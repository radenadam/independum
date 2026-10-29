import type { ModelRuntime } from "@earendil-works/pi-coding-agent";
import { type Context, Hono } from "hono";
import type { ChatEvent, ModelSummary } from "./api-types.ts";
import type { Chat } from "./create-chat.ts";
import { readSettingsChange } from "./create-settings.ts";
import { streamEvents } from "./stream-events.ts";

/**
 * Creates the routes that list models, show, follow, and drive the chat, show its agent, and open
 * other chats.
 */
export function createChatRoutes(chat: Chat, models: ModelRuntime): Hono {
  const routes = new Hono();

  routes.get("/models", async (context) => {
    const available = await models.getAvailable();
    return context.json({
      models: available.map(
        (model): ModelSummary => ({
          providerId: model.provider,
          providerName: models.getProvider(model.provider)?.name ?? model.provider,
          id: model.id,
          name: model.name,
        }),
      ),
    });
  });

  routes.get("/chat/events", async (context) => {
    const projects = await chat.getProjects();
    return streamEvents<ChatEvent>(
      context,
      [
        { type: "state", state: chat.getState() },
        { type: "projects", projects },
      ],
      chat.subscribe,
      () => false,
    );
  });

  routes.get("/chat/agent", (context) => context.json(chat.getAgent()));

  routes.get("/chat/context", (context) => context.json(chat.getContext()));

  routes.post("/chat/messages", async (context) => {
    const body: { text?: unknown } = await context.req.json().catch(() => ({}));
    if (typeof body.text !== "string" || body.text.trim() === "") {
      return context.json({ error: "A message needs text." }, 400);
    }
    if (!chat.send(body.text.trim())) {
      return context.json(
        { error: "The chat needs a model and takes no message while it replies." },
        409,
      );
    }
    return context.body(null, 202);
  });

  routes.put("/chat/model", async (context) => {
    const body: { providerId?: unknown; modelId?: unknown } = await context.req
      .json()
      .catch(() => ({}));
    const isChosen =
      typeof body.providerId === "string" &&
      typeof body.modelId === "string" &&
      (await chat.chooseModel(body.providerId, body.modelId));
    if (!isChosen) {
      return context.json({ error: "That model is not available." }, 400);
    }
    return context.body(null, 204);
  });

  routes.put("/chat/thinking", async (context) => {
    const body: { level?: unknown } = await context.req.json().catch(() => ({}));
    if (typeof body.level !== "string" || !chat.chooseThinking(body.level)) {
      return context.json({ error: "This model does not offer that thinking level." }, 400);
    }
    return context.body(null, 204);
  });

  routes.post("/chat/open", async (context) => {
    const body: { id?: unknown } = await context.req.json().catch(() => ({}));
    return answer(context, typeof body.id === "string" && (await chat.open(body.id)));
  });

  routes.post("/chat/stop", async (context) => {
    await chat.stop();
    return context.body(null, 204);
  });

  routes.put("/settings", async (context) => {
    const change = readSettingsChange(await context.req.json().catch(() => undefined));
    const agent = change === undefined ? undefined : await chat.changeSettings(change);
    return agent === undefined
      ? context.json({ error: "That is not a valid setting." }, 400)
      : context.json(agent);
  });

  routes.post("/chat/commands/:id/background", (context) =>
    chat.moveToBackground(context.req.param("id"))
      ? context.body(null, 204)
      : context.json({ error: "No command that runs in a reply has that id." }, 404),
  );

  routes.post("/chat/commands/:id/stop", (context) =>
    chat.stopCommand(context.req.param("id"))
      ? context.body(null, 204)
      : context.json({ error: "No running command has that id." }, 404),
  );

  routes.post("/chat/new", async (context) => {
    const body: { folder?: unknown } = await context.req.json().catch(() => ({}));
    const folder = typeof body.folder === "string" ? body.folder : undefined;
    if (body.folder !== undefined && folder === undefined) {
      return context.json({ error: "A folder is a path." }, 400);
    }
    if (!(await chat.startNew(folder))) {
      return context.json({ error: "That folder is not a project." }, 400);
    }
    return context.body(null, 204);
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

  return routes;
}

function answer(context: Context, isDone: boolean): Response {
  return isDone
    ? context.body(null, 204)
    : context.json({ error: "No saved chat has that id." }, 404);
}
