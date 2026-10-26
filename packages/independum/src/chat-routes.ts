import type { ModelRuntime } from "@earendil-works/pi-coding-agent";
import { Hono } from "hono";
import type { ChatEvent, ModelSummary } from "./api-types.ts";
import type { Chat } from "./create-chat.ts";
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

  routes.post("/chat/open", async (context) => {
    const body: { id?: unknown } = await context.req.json().catch(() => ({}));
    if (typeof body.id !== "string" || !(await chat.open(body.id))) {
      return context.json({ error: "No saved chat has that id." }, 404);
    }
    return context.body(null, 204);
  });

  routes.post("/chat/stop", async (context) => {
    await chat.stop();
    return context.body(null, 204);
  });

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

  return routes;
}
