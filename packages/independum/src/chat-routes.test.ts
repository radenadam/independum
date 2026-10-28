import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { basename, join, resolve } from "node:path";
import {
  fauxAssistantMessage,
  fauxProvider,
  fauxText,
  fauxThinking,
  fauxToolCall,
} from "@earendil-works/pi-ai";
import type { Hono } from "hono";
import { afterAll, expect, test } from "vitest";
import type {
  AgentSummary,
  ArchivedChatSummary,
  ChatEvent,
  ChatMessage,
  ChatState,
  ChatSummary,
  ContextSummary,
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
const faux = fauxProvider({
  provider: "faux",
  models: [
    { id: "faux-model", name: "Faux model" },
    { id: "faux-thinker", name: "Faux thinker", reasoning: true },
  ],
});
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

const updateTypes = ["replyDelta", "replyPart", "toolStart", "toolProgress", "toolResult"];

// The reply comes back once the chat stops replying, so whatever Independum saves after the
// reply is saved too.
async function sendAndReadReply(
  text: string,
): Promise<{ updates: ChatEvent[]; reply: ChatMessage }> {
  const events = followEventStream<ChatEvent>(await routes.request("/chat/events"));
  await events.next();
  expect((await post("/chat/messages", { text })).status).toBe(202);
  const updates: ChatEvent[] = [];
  let reply: ChatMessage | undefined;
  for (let event = await events.next(); ; event = await events.next()) {
    if (updateTypes.includes(event.type)) {
      updates.push(event);
    } else if (event.type === "message" && event.message.role === "assistant") {
      reply = event.message;
    } else if (event.type === "replying" && !event.isReplying && reply !== undefined) {
      await events.close();
      return { updates, reply };
    }
  }
}

function textOf(message: ChatMessage | undefined): string {
  return (message?.parts ?? []).map((part) => (part.type === "text" ? part.text : "")).join("");
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
  const { updates, reply } = await sendAndReadReply("Hello");
  const deltas = updates.map((update) => (update.type === "replyDelta" ? update.delta : ""));
  expect(deltas.join("")).toBe("Hello from the fake model.");
  expect(reply).toMatchObject({
    role: "assistant",
    parts: [{ type: "text", text: "Hello from the fake model." }],
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
  expect(state.messages.map(textOf)).toEqual(["Hello", "Hello from the fake model.", "Again", ""]);
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
  expect(textOf(state.messages[0])).toBe("Hello");
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
  expect(textOf(reply)).not.toBe("");
  expect(story.startsWith(textOf(reply))).toBe(true);
  expect(textOf(reply).length).toBeLessThan(story.length);
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

test("the agent shows its prompts and its tools", async () => {
  expect((await post("/chat/new", {})).status).toBe(204);
  expect((await chooseModel("faux", "faux-model")).status).toBe(204);
  const agent = (await (await routes.request("/chat/agent")).json()) as AgentSummary;
  expect(agent.systemPrompt).toContain("Independum");
  expect(agent.addedByPi).toContain("<cwd>");
  expect(agent.tools.map((tool) => tool.name)).toEqual(["Shell", "StopCommand"]);
  expect(agent.tools[0]?.description).toMatch(/^Runs a command in /);
  expect(agent.shells.filter((choice) => choice.isChosen)).toHaveLength(1);
});

test("files that Pi would add to the system prompt stay out of it", async () => {
  const addendum = "Text from a file that the Agent place does not show.";
  mkdirSync(join(startFolder, ".pi"), { recursive: true });
  writeFileSync(join(startFolder, ".pi", "APPEND_SYSTEM.md"), addendum);
  writeFileSync(join(directory, "APPEND_SYSTEM.md"), addendum);
  expect((await post("/chat/new", { folder: startFolder })).status).toBe(204);
  expect((await chooseModel("faux", "faux-model")).status).toBe(204);
  const agent = (await (await routes.request("/chat/agent")).json()) as AgentSummary;
  expect(agent.addedByPi).not.toContain(addendum);
  expect(agent.addedByPi).toContain("<cwd>");
});

test("the context shows the model, the counts, the saved entries, and the last request", async () => {
  expect((await post("/chat/new", {})).status).toBe(204);
  expect((await chooseModel("faux", "faux-model")).status).toBe(204);
  const before = (await (await routes.request("/chat/context")).json()) as ContextSummary;
  expect(before.model).toBe("faux-model");
  expect(before.userMessages).toBe(0);
  expect(before.lastRequest).toBeNull();
  faux.setResponses([
    async (_context, options, _state, model) => {
      await options?.onPayload?.({ sent: "the exact request" }, model);
      return fauxAssistantMessage("Sent.");
    },
  ]);
  await sendAndReadReply("Show the request");
  const after = (await (await routes.request("/chat/context")).json()) as ContextSummary;
  expect(after.lastRequest).toEqual({ sent: "the exact request" });
  expect(after.userMessages).toBe(1);
  expect(after.assistantMessages).toBe(1);
  expect(after.contextWindow).toBeGreaterThan(0);
  const roles = after.entries
    .filter((entry) => entry.type === "message")
    .map((entry) => entry.role);
  expect(roles.slice(-2)).toEqual(["user", "assistant"]);
});

test("a model that thinks offers its thinking levels, and the chat keeps the chosen one", async () => {
  expect((await chooseModel("faux", "faux-model")).status).toBe(204);
  expect((await readStart()).state.thinking).toBeNull();
  expect((await chooseModel("faux", "faux-thinker")).status).toBe(204);
  const offered = (await readStart()).state.thinking;
  expect(offered?.levels).toContain("high");
  const choose = (level: unknown): Promise<Response> =>
    Promise.resolve(
      routes.request("/chat/thinking", {
        method: "PUT",
        headers: json,
        body: JSON.stringify({ level }),
      }),
    );
  expect((await choose("high")).status).toBe(204);
  expect((await readStart()).state.thinking?.level).toBe("high");
  expect((await choose("as hard as possible")).status).toBe(400);
  expect((await choose(5)).status).toBe(400);
});

test("a model streams its thinking, and the chat keeps how long it thought", async () => {
  expect((await post("/chat/new", {})).status).toBe(204);
  expect((await chooseModel("faux", "faux-thinker")).status).toBe(204);
  faux.setResponses([
    fauxAssistantMessage([fauxThinking("Weigh the options first."), fauxText("Done thinking.")]),
  ]);
  const { updates, reply } = await sendAndReadReply("Think first");
  const thought = updates.map((update) =>
    update.type === "replyDelta" && update.partType === "thinking" ? update.delta : "",
  );
  expect(thought.join("")).toBe("Weigh the options first.");
  expect(updates).toContainEqual({
    type: "replyPart",
    index: 0,
    part: expect.objectContaining({ type: "thinking", durationMs: expect.any(Number) }),
  });
  const parts = [
    {
      type: "thinking",
      text: "Weigh the options first.",
      isRedacted: false,
      durationMs: expect.any(Number),
    },
    { type: "text", text: "Done thinking." },
  ];
  expect(reply.parts).toEqual(parts);

  expect((await post("/chat/new", {})).status).toBe(204);
  expect((await openSaved("Think first")).status).toBe(204);
  expect((await readStart()).state.messages.at(-1)?.parts).toEqual(parts);
});

test("the agent runs a command in the shell, sees how it ended, and goes on", async () => {
  expect((await post("/chat/new", {})).status).toBe(204);
  expect((await chooseModel("faux", "faux-model")).status).toBe(204);
  const input = { command: 'echo "hello from the shell"', description: "Say hello" };
  faux.setResponses([
    fauxAssistantMessage([fauxToolCall("Shell", input)], { stopReason: "toolUse" }),
    fauxAssistantMessage("The shell said hello."),
  ]);
  const { updates, reply } = await sendAndReadReply("Say hello in the shell");
  expect(textOf(reply)).toBe("The shell said hello.");
  const types = updates.map((update) => update.type);
  expect(types).toEqual(expect.arrayContaining(["replyPart", "toolStart", "toolProgress"]));
  const call = updates.find((update) => update.type === "toolResult");
  expect(call?.type === "toolResult" ? call.result.text : "").toMatch(
    /^hello from the shell\s+Exit code 0 after \d+\.\d s\.$/,
  );

  const { messages } = (await readStart()).state;
  const part = messages
    .flatMap((message) => message.parts)
    .find((each) => each.type === "toolCall");
  expect(part).toMatchObject({
    name: "Shell",
    input,
    result: { isError: false, details: { ending: "exited", exitCode: 0, outputPath: null } },
  });
});

test("a command can be stopped on its own, and the agent goes on", async () => {
  expect((await post("/chat/new", {})).status).toBe(204);
  expect((await chooseModel("faux", "faux-model")).status).toBe(204);
  const pause = process.platform === "win32" ? "Start-Sleep -Seconds 30" : "sleep 30";
  faux.setResponses([
    fauxAssistantMessage([fauxToolCall("Shell", { command: pause })], { stopReason: "toolUse" }),
    fauxAssistantMessage("Going on without it."),
  ]);
  const events = followEventStream<ChatEvent>(await routes.request("/chat/events"));
  await events.next();
  expect((await post("/chat/messages", { text: "Wait a while" })).status).toBe(202);
  let event = await events.next();
  while (event.type !== "toolStart") {
    event = await events.next();
  }
  expect((await post(`/chat/commands/${event.id}/stop`, {})).status).toBe(204);
  while (event.type !== "toolResult") {
    event = await events.next();
  }
  expect(event.result.text).toMatch(/^Stopped by the user after \d+\.\d s\.$/);
  while (event.type !== "message" || event.message.role !== "assistant") {
    event = await events.next();
  }
  await events.close();
  expect(textOf(event.message)).toBe("Going on without it.");
  expect((await post("/chat/commands/no-such-command/stop", {})).status).toBe(404);
});

test("a tool that is turned off never runs, and the output limits change", async () => {
  expect((await post("/chat/new", {})).status).toBe(204);
  expect((await chooseModel("faux", "faux-model")).status).toBe(204);
  const call = fauxToolCall("Shell", { command: 'echo "it ran"' });
  faux.setResponses(
    [0, 1].flatMap(() => [
      fauxAssistantMessage([call], { stopReason: "toolUse" }),
      fauxAssistantMessage("Done."),
    ]),
  );
  const off = await put("/settings", { disabledTools: ["Shell"] });
  expect(((await off.json()) as AgentSummary).tools[0]?.isEnabled).toBe(false);
  const blocked = (await sendAndReadReply("Run it")).updates.find(
    (update) => update.type === "toolResult",
  );
  expect(blocked?.type === "toolResult" && blocked.result.isError).toBe(true);
  expect(blocked?.type === "toolResult" ? blocked.result.text : "").not.toContain("it ran");

  const on = await put("/settings", {
    disabledTools: [],
    outputLimits: { maxLines: 500, maxBytes: 8192 },
  });
  expect(((await on.json()) as AgentSummary).outputLimits).toEqual({
    maxLines: 500,
    maxBytes: 8192,
  });
  const ran = (await sendAndReadReply("Run it again")).updates.find(
    (update) => update.type === "toolResult",
  );
  expect(ran?.type === "toolResult" ? ran.result.text : "").toContain("it ran");
  expect((await put("/settings", { shell: "fish" })).status).toBe(400);
});

test("a background command runs on, and its end wakes the agent with a note", async () => {
  expect((await post("/chat/new", {})).status).toBe(204);
  expect((await chooseModel("faux", "faux-model")).status).toBe(204);
  const command =
    process.platform === "win32"
      ? 'echo "started"; Start-Sleep -Milliseconds 800'
      : "echo started; sleep 0.8";
  faux.setResponses([
    fauxAssistantMessage([fauxToolCall("Shell", { command, background: true })], {
      stopReason: "toolUse",
    }),
    fauxAssistantMessage("It runs."),
    fauxAssistantMessage("It ended."),
  ]);
  const events = followEventStream<ChatEvent>(await routes.request("/chat/events"));
  await events.next();
  expect((await post("/chat/messages", { text: "Start it" })).status).toBe(202);
  const seen: ChatEvent[] = [];
  let event = await events.next();
  while (event.type !== "message" || textOf(event.message) !== "It ended.") {
    seen.push(event);
    event = await events.next();
  }
  await events.close();
  const started = seen.find((each) => each.type === "toolResult");
  expect(started?.type === "toolResult" ? started.result.text : "").toMatch(
    /^Background command \d+ runs\. Its output goes to /,
  );
  const ended = seen.find((each) => each.type === "commandEnd");
  expect(ended?.type === "commandEnd" ? ended.end : undefined).toMatchObject({
    ending: "exited",
    exitCode: 0,
    isStoppedByUser: false,
  });
  const note = seen.find((each) => each.type === "message" && each.message.role === "note");
  const noteText = note?.type === "message" ? textOf(note.message) : "";
  expect(noteText).toMatch(/^Background command \d+ ended with exit code 0 after /);
  expect(noteText).toContain("started");
});

test("StopCommand stops a background command, and no note follows", async () => {
  expect((await post("/chat/new", {})).status).toBe(204);
  expect((await chooseModel("faux", "faux-model")).status).toBe(204);
  const pause = process.platform === "win32" ? "Start-Sleep -Seconds 30" : "sleep 30";
  faux.setResponses([
    fauxAssistantMessage([fauxToolCall("Shell", { command: pause, background: true })], {
      stopReason: "toolUse",
    }),
    (context) => {
      const last = context.messages.at(-1);
      const details = last?.role === "toolResult" ? last.details : undefined;
      const id = (details as { backgroundId: number } | undefined)?.backgroundId ?? 0;
      return fauxAssistantMessage([fauxToolCall("StopCommand", { id })], { stopReason: "toolUse" });
    },
    fauxAssistantMessage("Stopped it."),
  ]);
  const { updates, reply } = await sendAndReadReply("Start it and stop it");
  expect(textOf(reply)).toBe("Stopped it.");
  const results = updates.flatMap((update) =>
    update.type === "toolResult" ? [update.result.text] : [],
  );
  expect(results[1]).toMatch(/^Stopped background command \d+ after /);
  const { state } = await readStart();
  expect(state.backgroundCommands).toEqual([]);
  expect(state.messages.some((message) => message.role === "note")).toBe(false);
});

function put(path: string, body: unknown): Promise<Response> {
  return Promise.resolve(
    routes.request(path, { method: "PUT", headers: json, body: JSON.stringify(body) }),
  );
}

async function findChat(id: string | null): Promise<ChatSummary | undefined> {
  const { projects } = await readStart();
  return projects.flatMap((project) => project.chats).find((chat) => chat.id === id);
}

test("a saved chat exports as markdown with a heading for each message", async () => {
  expect((await post("/chat/new", {})).status).toBe(204);
  expect((await chooseModel("faux", "faux-model")).status).toBe(204);
  faux.setResponses([fauxAssistantMessage("A reply to **export**.")]);
  await sendAndReadReply("A chat to export");
  const { id } = (await readStart()).state;

  const response = await routes.request(`/chats/${id}/markdown`);
  expect(response.status).toBe(200);
  expect(await response.text()).toBe(
    "# A chat to export\n\n## You\n\nA chat to export\n\n## Agent (faux-model)\n\nA reply to **export**.\n",
  );
  expect((await routes.request("/chats/no-such-chat/markdown")).status).toBe(404);
});

test("a chat can be renamed, pinned, archived, brought back, and deleted", async () => {
  expect((await post("/chat/new", {})).status).toBe(204);
  expect((await chooseModel("faux", "faux-model")).status).toBe(204);
  faux.setResponses([fauxAssistantMessage("A reply to keep.")]);
  await sendAndReadReply("A chat to manage");
  const { id, folder } = (await readStart()).state;

  expect((await put(`/chats/${id}/name`, { name: "Managed chat" })).status).toBe(204);
  expect((await findChat(id))?.title).toBe("Managed chat");
  expect((await put(`/chats/${id}/pinned`, { isPinned: true })).status).toBe(204);
  expect((await findChat(id))?.isPinned).toBe(true);

  expect((await put(`/chats/${id}/archived`, { isArchived: true })).status).toBe(204);
  expect(await findChat(id)).toBeUndefined();
  expect((await readStart()).state.id).not.toBe(id);
  const archived = (await (await routes.request("/chats/archived")).json()) as {
    chats: ArchivedChatSummary[];
  };
  const entry = archived.chats.find((chat) => chat.id === id);
  expect(entry?.title).toBe("Managed chat");
  expect(entry?.folder).toBe(folder);
  expect(entry?.projectName).toBe(basename(folder));

  expect((await put(`/chats/${id}/archived`, { isArchived: false })).status).toBe(204);
  expect((await findChat(id))?.isPinned).toBe(false);
  expect((await routes.request(`/chats/${id}`, { method: "DELETE" })).status).toBe(204);
  expect(await findChat(id)).toBeUndefined();
  expect((await routes.request(`/chats/${id}`, { method: "DELETE" })).status).toBe(404);
  expect((await put("/chats/no-such-chat/pinned", { isPinned: true })).status).toBe(404);
  expect((await put(`/chats/${id}/name`, { name: " " })).status).toBe(400);
});

test("a closed chat can be renamed, and a pin lasts after a restart", async () => {
  const { projects } = await readStart();
  const hello = projects.flatMap((project) => project.chats).find((chat) => chat.title === "Hello");
  expect((await put(`/chats/${hello?.id}/name`, { name: "Greetings" })).status).toBe(204);
  expect((await put(`/chats/${hello?.id}/pinned`, { isPinned: true })).status).toBe(204);
  routes = await createRoutes(startFolder);
  const restarted = await findChat(hello?.id ?? null);
  expect(restarted).toMatchObject({ title: "Greetings", isPinned: true });
});
