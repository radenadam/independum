import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { basename, join, resolve } from "node:path";
import { fauxAssistantMessage, fauxProvider } from "@earendil-works/pi-ai";
import type { Hono } from "hono";
import { afterAll, expect, test } from "vitest";
import type {
  ChatEvent,
  ChatMessage,
  ChatState,
  ModelSummary,
  ProjectSummary,
} from "./api-types.ts";
import { createChatRoutes } from "./chat-routes.ts";
import { createChat } from "./create-chat.ts";
import { createModelRuntime } from "./create-model-runtime.ts";
import { followEventStream } from "./follow-event-stream.ts";

const directory = mkdtempSync(join(tmpdir(), "independum-test-"));
const startFolder = resolve(mkdtempSync(join(tmpdir(), "independum-start-")));
const otherFolder = resolve(mkdtempSync(join(tmpdir(), "independum-other-")));
afterAll(() => {
  for (const folder of [directory, startFolder, otherFolder]) {
    rmSync(folder, { recursive: true, force: true });
  }
});
const models = await createModelRuntime(directory);
const faux = fauxProvider({ provider: "faux", models: [{ id: "faux-model", name: "Faux model" }] });
const slow = fauxProvider({
  provider: "faux-slow",
  models: [{ id: "slow-model", name: "Slow model" }],
  tokensPerSecond: 4,
});
models.registerNativeProvider(faux.provider);
models.registerNativeProvider(slow.provider);
await models.setRuntimeApiKey("faux", "test-key");
await models.setRuntimeApiKey("faux-slow", "test-key");
const json = { "content-type": "application/json" };

async function createRoutes(cwd: string): Promise<Hono> {
  return createChatRoutes(await createChat({ models, directory, cwd }), models);
}

let routes = await createRoutes(startFolder);

async function readStart(): Promise<{ state: ChatState; projects: ProjectSummary[] }> {
  const events = followEventStream<ChatEvent>(await routes.request("/chat/events"));
  const first = await events.next();
  const second = await events.next();
  await events.close();
  if (first.type !== "state" || second.type !== "projects") {
    throw new Error("The chat did not start with its state and its projects.");
  }
  return { state: first.state, projects: second.projects };
}

async function readTitles(folder: string): Promise<string[]> {
  const { projects } = await readStart();
  return (
    projects.find((project) => project.folder === folder)?.chats.map((chat) => chat.title) ?? []
  );
}

function post(path: string, body: unknown): Promise<Response> {
  return Promise.resolve(
    routes.request(path, { method: "POST", headers: json, body: JSON.stringify(body) }),
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
  expect((await post("/chat/messages", { text })).status).toBe(202);
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

async function openSaved(title: string): Promise<Response> {
  const { projects } = await readStart();
  const saved = projects.flatMap((project) => project.chats).find((chat) => chat.title === title);
  return post("/chat/open", { id: saved?.id ?? "no-such-chat" });
}

test("models lists the models of every provider with a login", async () => {
  const response = await routes.request("/models");
  const { models: listed } = (await response.json()) as { models: ModelSummary[] };
  expect(listed).toContainEqual(
    expect.objectContaining({ providerId: "faux", id: "faux-model", name: "Faux model" }),
  );
});

test("an empty chat starts in the start folder and waits for a chosen model", async () => {
  const { state, projects } = await readStart();
  expect(state).toMatchObject({
    folder: startFolder,
    model: null,
    messages: [],
    isReplying: false,
  });
  expect(projects).toEqual([{ folder: startFolder, name: basename(startFolder), chats: [] }]);
  expect((await post("/chat/messages", { text: "Hello" })).status).toBe(409);
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
  routes = await createRoutes(startFolder);
  const { state } = await readStart();
  expect(state.model).toEqual({ providerId: "faux", id: "faux-model" });
  expect(state.messages.map((message) => message.text)).toEqual([
    "Hello",
    "Hello from the fake model.",
    "Again",
    "",
  ]);
});

test("a new chat starts empty with the same model and stays out of its project", async () => {
  expect((await post("/chat/new", {})).status).toBe(204);
  const { state } = await readStart();
  expect(state).toMatchObject({
    folder: startFolder,
    model: { providerId: "faux", id: "faux-model" },
    messages: [],
    isReplying: false,
  });
  expect(await readTitles(startFolder)).toEqual(["Hello"]);
});

test("a chat joins the top of its project with its first message", async () => {
  faux.setResponses([fauxAssistantMessage("A second reply.")]);
  await sendAndReadReply("A second chat");
  const { state, projects } = await readStart();
  expect(await readTitles(startFolder)).toEqual(["A second chat", "Hello"]);
  expect(projects[0]?.chats[0]?.id).toBe(state.id);
});

test("opening a saved chat shows its messages", async () => {
  expect((await openSaved("Hello")).status).toBe(204);
  const { state } = await readStart();
  expect(state.messages[0]?.text).toBe("Hello");
  expect((await openSaved("No such chat")).status).toBe(404);
});

test("leaving a chat stops its reply and keeps what the reply said", async () => {
  expect((await post("/chat/new", {})).status).toBe(204);
  expect((await chooseModel("faux-slow", "slow-model")).status).toBe(204);
  const story = "Once upon a time there was a reply that was far too long to finish.";
  slow.setResponses([fauxAssistantMessage(story)]);
  const events = followEventStream<ChatEvent>(await routes.request("/chat/events"));
  expect((await post("/chat/messages", { text: "Tell a story" })).status).toBe(202);
  let event = await events.next();
  while (event.type !== "replyDelta") {
    event = await events.next();
  }
  await events.close();
  expect((await post("/chat/new", {})).status).toBe(204);
  expect((await openSaved("Tell a story")).status).toBe(204);
  const reply = (await readStart()).state.messages.at(-1);
  expect(reply?.role).toBe("assistant");
  expect(reply?.error).toBe("The reply was stopped.");
  expect(reply?.text).not.toBe("");
  expect(story.startsWith(reply?.text ?? "")).toBe(true);
  expect(reply?.text.length).toBeLessThan(story.length);
});

test("a chat joins its project as soon as it is sent, before the reply", async () => {
  expect((await post("/chat/new", {})).status).toBe(204);
  slow.setResponses([fauxAssistantMessage("A reply that takes its time to arrive.")]);
  const events = followEventStream<ChatEvent>(await routes.request("/chat/events"));
  expect((await post("/chat/messages", { text: "List me at once" })).status).toBe(202);
  let titles: string[] = [];
  let event = await events.next();
  while (event.type !== "message" || event.message.role !== "assistant") {
    if (event.type === "projects") {
      titles = event.projects.flatMap((project) => project.chats.map((chat) => chat.title));
      if (titles.includes("List me at once")) {
        break;
      }
    }
    event = await events.next();
  }
  await events.close();
  expect(titles).toContain("List me at once");
  expect((await post("/chat/stop", {})).status).toBe(204);
});

test("chats from another folder form their own project and open in that folder", async () => {
  routes = await createRoutes(otherFolder);
  expect((await readStart()).state).toMatchObject({ folder: otherFolder, model: null });
  expect((await chooseModel("faux", "faux-model")).status).toBe(204);
  faux.setResponses([fauxAssistantMessage("A reply in another folder.")]);
  await sendAndReadReply("A chat in another folder");

  routes = await createRoutes(startFolder);
  const { state, projects } = await readStart();
  expect(state.folder).toBe(startFolder);
  expect(projects.map((project) => project.name)).toEqual([
    basename(startFolder),
    basename(otherFolder),
  ]);
  expect((await openSaved("A chat in another folder")).status).toBe(204);
  expect((await readStart()).state.folder).toBe(otherFolder);
});

test("a new chat starts in a chosen project, and only in a project", async () => {
  expect((await post("/chat/new", { folder: startFolder })).status).toBe(204);
  expect((await readStart()).state.folder).toBe(startFolder);
  expect((await post("/chat/new", { folder: otherFolder })).status).toBe(204);
  expect((await readStart()).state.folder).toBe(otherFolder);
  expect((await post("/chat/new", { folder: tmpdir() })).status).toBe(400);
  expect((await post("/chat/new", { folder: 5 })).status).toBe(400);
});
