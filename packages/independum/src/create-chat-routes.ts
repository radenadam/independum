import type { ModelRuntime } from "@earendil-works/pi-coding-agent";
import { type Context, Hono } from "hono";
import type { ChatsEvent, ModelPrices, ModelSummary } from "./api-types.ts";
import { ConfigurationError, validateChatSettings } from "./configuration-schema.ts";
import type { ApprovalPersistence } from "./create-approvals.ts";
import type { Chat, OpenChat } from "./create-chat.ts";
import { InputError } from "./create-pending-inputs.ts";
import {
  bodyOf,
  configurationErrorResponse,
  createProfileRoutes,
  revisionOf,
} from "./profile-routes.ts";
import { streamEvents } from "./stream-events.ts";

/** Creates routes for independent chats and their shared list and reply events. */
export function createChatRoutes(chat: Chat, models: ModelRuntime): Hono {
  const routes = new Hono();
  routes.onError(configurationErrorResponse);
  routes.route("/", createProfileRoutes(chat));
  routes.get("/approvals", (context) =>
    context.json({ approvals: chat.approvals.pending(context.req.query("chatId")) }),
  );
  routes.post("/approvals/:approvalId", async (context) => {
    const body = await bodyOf(context);
    if (
      typeof body !== "object" ||
      body === null ||
      Object.keys(body).some((key) => !["revision", "decision", "persistence"].includes(key)) ||
      !("revision" in body) ||
      !("decision" in body) ||
      !("persistence" in body) ||
      typeof body.revision !== "string" ||
      (body.decision !== "allow" && body.decision !== "deny") ||
      !["once", "chat", "project", "runtime"].includes(String(body.persistence))
    ) {
      return context.json(
        { error: "An approval requires its revision, allow or deny, and a supported lifetime." },
        400,
      );
    }
    let status: Awaited<ReturnType<typeof chat.approvals.resolve>>;
    try {
      status = await chat.approvals.resolve(
        context.req.param("approvalId"),
        body.revision,
        body.decision,
        body.persistence as ApprovalPersistence,
      );
    } catch (error) {
      return contextFailure(context, error, "The approval could not be saved.", 409);
    }
    return context.json(
      status === 200
        ? { resolved: true }
        : {
            error:
              status === 404
                ? "The approval does not exist."
                : status === 400
                  ? "This approval does not offer that lifetime."
                  : "The approval has changed or already has another answer.",
          },
      status,
    );
  });
  // biome-ignore lint/style/useNamingConvention: Hono names its context variables type.
  const active = new Hono<{ Variables: { chat: OpenChat } }>();
  active.use("*", async (context, next) => {
    const opened = await chat.open(context.req.param("id") ?? "");
    if (opened === undefined) {
      return answer(context, false);
    }
    context.set("chat", opened);
    try {
      await next();
    } finally {
      opened.close();
    }
    return undefined;
  });
  routes.get("/chats/first", async (context) => context.json({ id: await chat.first() }));

  routes.get("/models", async (context) => {
    const available = await models.getAvailable();
    return context.json({
      models: available.map((model) =>
        summaryOf(model, models.getProvider(model.provider)?.name ?? model.provider),
      ),
    });
  });

  routes.get("/chats/events", (context) =>
    streamEvents<ChatsEvent>(
      context,
      async () => [
        { type: "projects", projects: await chat.getProjects() },
        { type: "replyingChats", ids: chat.getReplyingIds() },
      ],
      chat.subscribe,
      () => false,
    ),
  );

  active.get("/", (context) => context.json(context.get("chat").getState()));

  active.get("/events", (context) =>
    streamEvents(context, [], context.get("chat").subscribe, (event) => event.type === "removed"),
  );

  active.get("/agent", (context) => context.json(context.get("chat").getAgent()));
  active.delete("/permissions/:approvalId", (context) =>
    chat.approvals.remove(context.get("chat").getState().id, context.req.param("approvalId"))
      ? context.body(null, 204)
      : context.json({ error: "This saved chat approval does not exist." }, 404),
  );

  active.get("/context", (context) => context.json(context.get("chat").getContext()));

  active.get("/resources", (context) => context.json(context.get("chat").getResources()));
  active.post("/resources/:resourceId/approval", (context) => {
    const opened = context.get("chat");
    const id = context.req.param("resourceId");
    if (!opened.getResources().resources.some((resource) => resource.id === id)) {
      return context.json({ error: "This resource is unknown." }, 404);
    }
    opened.requestResourcePermission(id).catch(() => undefined);
    return context.body(null, 202);
  });
  active.put("/resources/:resourceId", async (context) => {
    const body = await contextBody(context);
    if (typeof body.fingerprint !== "string" || typeof body.content !== "string") {
      return context.json({ error: "A source edit needs its fingerprint and content." }, 400);
    }
    try {
      return context.json(
        await context
          .get("chat")
          .saveResource(context.req.param("resourceId"), body.fingerprint, body.content),
      );
    } catch (error) {
      return contextFailure(context, error, "The resource could not be saved.", 409);
    }
  });
  active.get("/resources/:resourceId", (context) => {
    const resource = context
      .get("chat")
      .getResources()
      .resources.find((entry) => entry.id === context.req.param("resourceId"));
    return resource === undefined
      ? context.json({ error: "This resource is unknown." }, 404)
      : context.json(resource);
  });
  active.post("/resources/reload", async (context) => {
    await chat.reconcile();
    return context.json(context.get("chat").getResources());
  });
  active.post("/compose", async (context) => {
    const body = await contextBody(context);
    if (
      typeof body.text !== "string" ||
      (body.interpretation !== "literal" && body.interpretation !== "commands")
    ) {
      return context.json(
        { error: "Composition needs text and a literal or commands interpretation." },
        400,
      );
    }
    try {
      return context.json(context.get("chat").compose(body.text, body.interpretation));
    } catch (error) {
      return contextFailure(context, error, "The command cannot expand.", 400);
    }
  });
  active.post("/slash-actions", async (context) => {
    const body = await contextBody(context);
    if (typeof body.previewId !== "string") {
      return context.json({ error: "An action needs a preview id." }, 400);
    }
    try {
      return context.json(await context.get("chat").slashAction(body.previewId));
    } catch (error) {
      return contextFailure(context, error, "The action cannot run.", 409);
    }
  });

  active.post("/messages", async (context) => {
    const body = await contextBody(context);
    if (
      body.kind !== "send" ||
      typeof body.id !== "string" ||
      !/^[a-f0-9]{8}(?:-[a-f0-9]{4}){3}-[a-f0-9]{12}$/i.test(body.id) ||
      !Number.isSafeInteger(body.expectedRevision) ||
      (body.expectedRevision as number) < 0 ||
      (body.expectedLeafId !== null && typeof body.expectedLeafId !== "string") ||
      (body.delivery !== "queue" && body.delivery !== "steer") ||
      Object.keys(body).some(
        (key) =>
          ![
            "kind",
            "id",
            "expectedRevision",
            "expectedLeafId",
            "delivery",
            "text",
            "interpretation",
            "previewId",
            "approvalMode",
          ].includes(key),
      )
    ) {
      return context.json(
        {
          code: "invalidInput",
          error: "A send needs its input id, pending revision, leaf id, delivery mode, and text.",
        },
        400,
      );
    }
    if (typeof body.text !== "string" || body.text.trim() === "") {
      return context.json({ error: "A message needs text." }, 400);
    }
    if (
      body.approvalMode !== undefined &&
      body.approvalMode !== "browser" &&
      body.approvalMode !== "headless"
    ) {
      return context.json({ error: "Approval mode must be browser or headless." }, 400);
    }
    if (
      (body.interpretation !== undefined &&
        body.interpretation !== "literal" &&
        body.interpretation !== "commands") ||
      (body.previewId !== undefined && typeof body.previewId !== "string")
    ) {
      return context.json({ error: "The message interpretation or preview id is invalid." }, 400);
    }
    try {
      if (
        !(await context
          .get("chat")
          .send(
            body.text,
            body.interpretation ?? "commands",
            body.previewId,
            body.approvalMode === "browser",
            {
              id: body.id,
              expectedRevision: body.expectedRevision as number,
              expectedLeafId: body.expectedLeafId,
              delivery: body.delivery,
            },
          ))
      ) {
        return context.json(
          {
            code: "chatUnavailable",
            error:
              "The chat needs a model and valid configuration and cannot be closing or compacting.",
          },
          409,
        );
      }
      const state = context.get("chat").getState();
      return context.json(
        {
          inputId: body.id,
          state: context.get("chat").inputState(body.id),
          revision: state.pending.revision,
        },
        202,
      );
    } catch (error) {
      if (error instanceof InputError) {
        return inputFailure(context, error);
      }
      return contextFailure(context, error, "The message cannot be sent.", 409);
    }
  });

  active.delete("/pending/:inputId", (context) =>
    inputResponse(context, async () => {
      return context.get("chat").removePending(context.req.param("inputId"))
        ? context.body(null, 204)
        : context.json(
            { code: "inputMissing", error: "This waiting message does not exist." },
            404,
          );
    }),
  );
  active.post("/pending/resume", (context) =>
    inputResponse(context, async () => {
      await context.get("chat").resumePending();
      return context.body(null, 204);
    }),
  );

  active.put("/model", async (context) => {
    const body: { providerId?: unknown; modelId?: unknown } = await context.req
      .json()
      .catch(() => ({}));
    const isChosen =
      typeof body.providerId === "string" &&
      typeof body.modelId === "string" &&
      (await context.get("chat").chooseModel(body.providerId, body.modelId));
    if (!isChosen) {
      return context.json({ error: "That model is not available." }, 400);
    }
    return context.body(null, 204);
  });

  active.put("/thinking", async (context) => {
    const body: { level?: unknown } = await context.req.json().catch(() => ({}));
    if (typeof body.level !== "string" || !(await context.get("chat").chooseThinking(body.level))) {
      return context.json({ error: "This model does not offer that thinking level." }, 400);
    }
    return context.body(null, 204);
  });

  active.post("/stop", async (context) => {
    await context.get("chat").stop();
    return context.body(null, 204);
  });

  active.post("/compact", async (context) =>
    (await context.get("chat").compact())
      ? context.body(null, 202)
      : context.json({ error: "The chat needs a model and must be idle to compact." }, 409),
  );

  active.get("/settings", async (context) => {
    await chat.reconcile();
    return context.json(context.get("chat").getAgent().configuration);
  });
  active.put("/settings", async (context) => {
    const opened = context.get("chat");
    const state = opened.getState();
    const current = chat.profiles.choices(state.id);
    const document = validateChatSettings(await bodyOf(context), current.path);
    if (
      current.document?.profile.id !== document.profile.id ||
      current.document.profile.scope !== document.profile.scope
    ) {
      delete document.overrides;
    }
    await chat.profiles.putChoices({
      id: state.id,
      folder: state.folder,
      value: document,
      revision: revisionOf(context),
      isDurable: state.messages.length > 0,
    });
    await chat.reconcile();
    return context.json(opened.getAgent().configuration);
  });

  active.post("/commands/:commandId/background", (context) =>
    context.get("chat").moveToBackground(context.req.param("commandId"))
      ? context.body(null, 204)
      : context.json({ error: "No command that runs in a reply has that id." }, 404),
  );

  active.post("/commands/:commandId/stop", (context) =>
    context.get("chat").stopCommand(context.req.param("commandId"))
      ? context.body(null, 204)
      : context.json({ error: "No running command has that id." }, 404),
  );

  active.post("/new", async (context) => {
    const body: { folder?: unknown; profile?: unknown } = await context.req
      .json()
      .catch(() => ({}));
    const folder = typeof body.folder === "string" ? body.folder : undefined;
    if (body.folder !== undefined && folder === undefined) {
      return context.json({ error: "A folder is a path." }, 400);
    }
    const profile =
      body.profile === undefined
        ? undefined
        : validateChatSettings({ formatVersion: 1, profile: body.profile }, "Request body").profile;
    const id = await chat.startNew(context.req.param("id") ?? "", folder, profile);
    if (id === undefined) {
      return context.json({ error: "That folder is not a project." }, 400);
    }
    return context.json({ id }, 201);
  });

  routes.get("/chats/archived", async (context) =>
    context.json({ chats: await chat.getArchived() }),
  );

  routes.get("/chats/:id/markdown", async (context) => {
    const markdown = await chat.exportMarkdown(context.req.param("id"));
    return markdown === undefined
      ? answer(context, false)
      : context.body(markdown, 200, { "content-type": "text/markdown; charset=utf-8" });
  });

  routes.put("/chats/:id/name", async (context) => {
    const body: { name?: unknown } = await context.req.json().catch(() => ({}));
    if (typeof body.name !== "string" || body.name.trim() === "") {
      return context.json({ error: "A chat needs a name." }, 400);
    }
    return answer(context, await chat.rename(context.req.param("id"), body.name));
  });

  routes.put("/chats/:id/pinned", async (context) => {
    const body: { isPinned?: unknown } = await context.req.json().catch(() => ({}));
    if (typeof body.isPinned !== "boolean") {
      return context.json({ error: "Pinning needs a yes or a no." }, 400);
    }
    return answer(context, await chat.pin(context.req.param("id"), body.isPinned));
  });

  routes.put("/chats/:id/archived", async (context) => {
    const body: { isArchived?: unknown } = await context.req.json().catch(() => ({}));
    if (typeof body.isArchived !== "boolean") {
      return context.json({ error: "Archiving needs a yes or a no." }, 400);
    }
    return answer(context, await chat.archive(context.req.param("id"), body.isArchived));
  });

  routes.delete("/chats/:id", async (context) =>
    answer(context, await chat.remove(context.req.param("id"))),
  );

  routes.route("/chats/:id", active);
  return routes;
}

function inputFailure(context: Context, error: InputError): Response {
  return context.json({ code: error.code, error: error.message }, error.status);
}

async function inputResponse(
  context: Context,
  mutation: () => Promise<Response>,
): Promise<Response> {
  try {
    return await mutation();
  } catch (error) {
    if (error instanceof InputError) {
      return inputFailure(context, error);
    }
    throw error;
  }
}

function answer(context: Context, isDone: boolean): Response {
  return isDone ? context.body(null, 204) : context.json({ error: "No chat has that id." }, 404);
}

function contextFailure(
  context: Context,
  error: unknown,
  fallback: string,
  status: 400 | 409,
): Response {
  const message = error instanceof Error ? error.message : fallback;
  const code = message.includes("permission")
    ? 403
    : message.includes("unknown") || message.includes("does not belong")
      ? 404
      : typeof error === "object" && error !== null && "code" in error
        ? 500
        : status;
  return context.json({ error: message }, code);
}

async function contextBody(context: Context): Promise<Record<string, unknown>> {
  const value = await bodyOf(context);
  if (typeof value !== "object" || value === null || Array.isArray(value)) {
    throw new ConfigurationError("Expected an object.", "Request body", "", 400);
  }
  return value as Record<string, unknown>;
}

function summaryOf(
  model: Awaited<ReturnType<ModelRuntime["getAvailable"]>>[number],
  providerName: string,
): ModelSummary {
  const images = model.inputLimits?.images;
  const resize = images?.resize;
  function pricesOf({ input, output, cacheRead, cacheWrite }: ModelPrices): ModelPrices {
    return {
      input,
      output,
      cacheRead,
      cacheWrite,
    };
  }
  return {
    providerId: model.provider,
    providerName,
    id: model.id,
    name: model.name,
    api: model.api,
    baseUrl: model.baseUrl,
    contextWindow: model.contextWindow,
    maxOutput: model.maxTokens,
    images: model.input.includes("image")
      ? {
          perRequest: images?.maxPerRequest ?? null,
          perMessage: images?.maxPerMessage ?? null,
          resizedTo:
            resize === undefined
              ? null
              : {
                  width: resize.maxWidth ?? null,
                  height: resize.maxHeight ?? null,
                  bytes: resize.maxBytes ?? null,
                },
        }
      : null,
    requestBytes: model.inputLimits?.maxRequestBytes ?? null,
    prices: pricesOf(model.cost),
    priceTiers: (model.cost.tiers ?? []).map((tier) => ({
      inputAbove: tier.inputTokensAbove,
      prices: pricesOf(tier),
    })),
    cacheSeconds: {
      short: model.promptCache?.short ?? null,
      long: model.promptCache?.long ?? null,
    },
  };
}
