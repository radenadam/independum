import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { fauxAssistantMessage, fauxProvider } from "@earendil-works/pi-ai";
import type { Hono } from "hono";
import { afterAll, expect, test } from "vitest";
import type { ChatEvent, ChatMessage, ChatState, ModelSummary } from "./api-types.ts";
import { createChatRoutes } from "./chat-routes.ts";
import { createChat } from "./create-chat.ts";
import { createModelRuntime } from "./create-model-runtime.ts";
import { followEventStream } from "./follow-event-stream.ts";

const directory = mkdtempSync(join(tmpdir(), "independum-test-"));
afterAll(() => rmSync(directory, { recursive: true, force: true }));
const models = await createModelRuntime(directory);
const faux = fauxProvider({ provider: "faux", models: [{ id: "faux-model", name: "Faux model" }] });
models.registerNativeProvider(faux.provider);
await models.setRuntimeApiKey("faux", "test-key");
const json = { "content-type": "application/json" };

async function openChat(): Promise<Hono> {
  return createChatRoutes(await createChat({ models, directory, cwd: directory }), models);
}

let routes = await openChat();

async function readState(): Promise<ChatState> {
  const events = followEventStream<ChatEvent>(await routes.request("/chat/events"));
  const first = await events.next();
  await events.close();
  if (first.type !== "state") {
    throw new Error("The chat did not start with its state.");
  }
  return first.state;
}

function send(text: string): Promise<Response> {
  return Promise.resolve(
    routes.request("/chat/messages", {
      method: "POST",
      headers: json,
      body: JSON.stringify({ text }),
    }),
  );
}

function chooseModel(providerId: string, modelId: string): Promise<Response> {
  return Promise.resolve(
    routes.request("/chat/model", {
      method: "PUT",
      headers: json,
      body: JSON.stringify({ providerId, modelId }),
    }),
  );
}

async function sendAndReadReply(text: string): Promise<{ deltas: string[]; reply: ChatMessage }> {
  const events = followEventStream<ChatEvent>(await routes.request("/chat/events"));
  await events.next();
  expect((await send(text)).status).toBe(202);
  const deltas: string[] = [];
  for (let event = await events.next(); ; event = await events.next()) {
    if (event.type === "replyDelta") {
      deltas.push(event.delta);
    }
    if (event.type === "message" && event.message.role === "assistant") {
      await events.close();
      return { deltas, reply: event.message };
    }
  }
}

test("models lists the models of every provider with a login", async () => {
  const response = await routes.request("/models");
  const { models: listed } = (await response.json()) as { models: ModelSummary[] };
  expect(listed).toContainEqual(
    expect.objectContaining({ providerId: "faux", id: "faux-model", name: "Faux model" }),
  );
});

test("a chat waits for a chosen model before it takes a message", async () => {
  expect(await readState()).toEqual({ model: null, messages: [], isReplying: false });
  expect((await send("Hello")).status).toBe(409);
  expect((await chooseModel("faux", "no-such-model")).status).toBe(400);
});

test("a message streams its reply", async () => {
  expect((await chooseModel("faux", "faux-model")).status).toBe(204);
  faux.setResponses([fauxAssistantMessage("Hello from the fake model.")]);
  const { deltas, reply } = await sendAndReadReply("Hello");
  expect(deltas.join("")).toBe("Hello from the fake model.");
  expect(reply).toMatchObject({
    role: "assistant",
    text: "Hello from the fake model.",
    error: null,
  });
});

test("a failed reply carries the provider's error", async () => {
  faux.setResponses([
    fauxAssistantMessage("", { stopReason: "error", errorMessage: "Invalid API key." }),
  ]);
  const { reply } = await sendAndReadReply("Again");
  expect(reply.error).toBe("Invalid API key.");
});

test("the last chat reopens with its model after a restart", async () => {
  routes = await openChat();
  const state = await readState();
  expect(state.model).toEqual({ providerId: "faux", id: "faux-model" });
  expect(state.messages.map((message) => message.text)).toEqual([
    "Hello",
    "Hello from the fake model.",
    "Again",
    "",
  ]);
});

test("a new chat starts empty with the same model", async () => {
  expect((await routes.request("/chat/new", { method: "POST" })).status).toBe(204);
  expect(await readState()).toEqual({
    model: { providerId: "faux", id: "faux-model" },
    messages: [],
    isReplying: false,
  });
});
