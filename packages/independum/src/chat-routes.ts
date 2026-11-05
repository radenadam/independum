import type { ModelRuntime } from "@earendil-works/pi-coding-agent";
import { type Context, Hono } from "hono";
import type { ChatsEvent, ModelPrices, ModelSummary } from "./api-types.ts";
import type { Chat, OpenChat } from "./create-chat.ts";
import { readSettingsChange } from "./create-settings.ts";
import { streamEvents } from "./stream-events.ts";

/** Creates routes for independent chats and their shared list and reply events. */
export function createChatRoutes(chat: Chat, models: ModelRuntime): Hono {
  const routes = new Hono();
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

  active.get("/context", (context) => context.json(context.get("chat").getContext()));

  active.post("/messages", async (context) => {
    const body: { text?: unknown } = await context.req.json().catch(() => ({}));
    if (typeof body.text !== "string" || body.text.trim() === "") {
      return context.json({ error: "A message needs text." }, 400);
    }
    if (!context.get("chat").send(body.text.trim())) {
      return context.json(
        { error: "The chat needs a model and must be idle to receive a message." },
        409,
      );
    }
    return context.body(null, 202);
  });

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
    if (typeof body.level !== "string" || !context.get("chat").chooseThinking(body.level)) {
      return context.json({ error: "This model does not offer that thinking level." }, 400);
    }
    return context.body(null, 204);
  });

  active.post("/stop", async (context) => {
    await context.get("chat").stop();
    return context.body(null, 204);
  });

  active.post("/compact", (context) =>
    context.get("chat").compact()
      ? context.body(null, 202)
      : context.json({ error: "The chat needs a model and must be idle to compact." }, 409),
  );

  routes.put("/settings", async (context) => {
    const change = readSettingsChange(await context.req.json().catch(() => undefined));
    return change !== undefined && (await chat.changeSettings(change))
      ? context.body(null, 204)
      : context.json({ error: "That is not a valid setting." }, 400);
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
    const body: { folder?: unknown } = await context.req.json().catch(() => ({}));
    const folder = typeof body.folder === "string" ? body.folder : undefined;
    if (body.folder !== undefined && folder === undefined) {
      return context.json({ error: "A folder is a path." }, 400);
    }
    const id = await chat.startNew(context.req.param("id") ?? "", folder);
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

function answer(context: Context, isDone: boolean): Response {
  return isDone ? context.body(null, 204) : context.json({ error: "No chat has that id." }, 404);
}

function summaryOf(
  model: Awaited<ReturnType<ModelRuntime["getAvailable"]>>[number],
  providerName: string,
): ModelSummary {
  const images = model.inputLimits?.images;
  const resize = images?.resize;
  const pricesOf = ({ input, output, cacheRead, cacheWrite }: ModelPrices): ModelPrices => ({
    input,
    output,
    cacheRead,
    cacheWrite,
  });
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
