import { mkdirSync, mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import {
  type AssistantMessage,
  type FauxResponseFactory,
  fauxAssistantMessage,
  fauxProvider,
  fauxToolCall,
  type SimpleStreamOptions,
} from "@earendil-works/pi-ai";
import { shouldCompact } from "@earendil-works/pi-coding-agent";
import { afterAll, expect, test } from "vitest";
import type { ChatState, ModelOverrideChange, Settings, SettingsChange } from "./api-types.ts";
import { type Chat, createChat, type OpenChat } from "./create-chat.ts";
import { createChatRoutes } from "./create-chat-routes.ts";
import { createModelRuntime } from "./create-model-runtime.ts";
import { createProfileStore } from "./create-profile-store.ts";
import { applyModelOverrides, modelSettingsOf } from "./model-settings.ts";
import { builtInSettings, readSettingsChange } from "./read-settings-change.ts";

const folders: string[] = [];
afterAll(() => {
  for (const folder of folders) {
    rmSync(folder, { recursive: true, force: true });
  }
});

async function setup() {
  const directory = mkdtempSync(join(tmpdir(), "independum-model-settings-"));
  folders.push(directory);
  const folder = join(directory, "project");
  mkdirSync(folder);
  const models = await createModelRuntime(directory);
  const provider = `settings-models-${folders.length}`;
  const faux = fauxProvider({ provider, models: [{ id: "first" }, { id: "second" }] });
  const other = fauxProvider({ provider: `${provider}-other`, models: [{ id: "first" }] });
  for (const entry of [faux, other]) {
    models.registerNativeProvider(entry.provider);
    await models.setRuntimeApiKey(entry.provider.id, "test-key");
  }
  const chats = await createChat({ models, directory, folder });
  const chat = await chats.open(await chats.first());
  if (chat === undefined) {
    throw new Error("The test chat did not open.");
  }
  await chat.chooseModel(provider, "first");
  return { chat, chats, models, faux, other, directory, folder, provider };
}

async function startNextChat(chats: Chat, chat: OpenChat): Promise<OpenChat> {
  const nextId = await chats.startNew(chat.getState().id);
  if (nextId === undefined) {
    throw new Error("The next test chat did not start.");
  }
  const selected = chat.getState().model;
  chat.close();
  const next = await chats.open(nextId);
  if (next === undefined) {
    throw new Error("The next test chat did not open.");
  }
  if (selected !== null) {
    await next.chooseModel(selected.providerId, selected.id);
  }
  return next;
}

async function reply(chat: OpenChat, text = "Continue"): Promise<void> {
  await new Promise<void>((resolve, reject) => {
    const stop = chat.subscribe((event) => {
      if (event.type === "replying" && !event.isReplying) {
        stop();
        resolve();
      }
    });
    chat.send(text).then((isAccepted) => {
      if (!isAccepted) {
        stop();
        reject(new Error("The test chat refused the message."));
      }
    }, reject);
  });
}

function waitForCompaction(chat: OpenChat): Promise<ChatState> {
  return new Promise((resolve) => {
    const stop = chat.subscribe((event) => {
      if (event.type === "contextChanged" && !event.state.isCompacting) {
        stop();
        resolve(chat.getState());
      }
    });
  });
}

function overridesOf(provider: string, overrides: ModelOverrideChange) {
  return { modelOverrides: { [provider]: { first: overrides } } };
}

function holdReply() {
  const entered = Promise.withResolvers<void>();
  const response = Promise.withResolvers<AssistantMessage>();
  return {
    entered: entered.promise,
    finish: response.resolve,
    receive() {
      entered.resolve();
      return response.promise;
    },
  };
}

test("model overrides reach only requests of their provider and model", async () => {
  const { chat, chats, faux, other, provider } = await setup();
  await changeSettings(
    chats,
    overridesOf(provider, { contextWindow: 240_000, maxOutput: 900, temperature: 0 }),
  );
  const requests: {
    contextWindow: number;
    maxTokens: number;
    options: SimpleStreamOptions | undefined;
  }[] = [];
  function capture(
    ...[_context, options, _state, model]: Parameters<FauxResponseFactory>
  ): ReturnType<FauxResponseFactory> {
    requests.push({ contextWindow: model.contextWindow, maxTokens: model.maxTokens, options });
    return fauxAssistantMessage("A reply.");
  }
  faux.setResponses([capture, capture, capture]);
  other.setResponses([capture]);
  await reply(chat);
  const next = await startNextChat(chats, chat);
  await reply(next);
  await next.chooseModel(provider, "second");
  await reply(next);
  await next.chooseModel(other.provider.id, "first");
  await reply(next);
  for (const request of requests.slice(0, 2)) {
    expect(request).toMatchObject({
      contextWindow: 240_000,
      maxTokens: 900,
      options: expect.objectContaining({ maxTokens: 900, temperature: 0 }),
    });
  }
  for (const request of requests.slice(2)) {
    expect(request.contextWindow).toBe(128_000);
    expect(request.maxTokens).toBe(16_384);
    expect(request.options?.temperature).toBeUndefined();
  }
  expect(faux.models[0].contextWindow).toBe(128_000);
  expect(faux.models[0].maxTokens).toBe(16_384);
}, 20_000);

test("model overrides keep cutoff facts and message times through changes and resets", async () => {
  const { chat, chats, faux, provider } = await setup();
  await changeSettings(chats, {
    ...overridesOf(provider, { contextWindow: 240_000, maxOutput: 900, temperature: 0 }),
    knowledgeCutoffs: { [provider]: { first: "2026-04" } },
    disabledFacts: ["facts.chatFolder"],
    texts: { "facts.messageTime": "Sent at {time}\n\n" },
    compaction: { isEnabled: false },
  });
  const prompts: string[] = [];
  const messages: string[] = [];
  function capture(...[context]: Parameters<FauxResponseFactory>): ReturnType<FauxResponseFactory> {
    prompts.push(JSON.stringify(context.messages.filter((message) => message.role === "system")));
    messages.push(JSON.stringify(context.messages));
    return fauxAssistantMessage("A reply.");
  }
  faux.setResponses([capture, capture, capture]);
  await reply(chat, "First message");
  await changeSettings(chats, overridesOf(provider, { maxOutput: 1200 }));
  await reply(chat, "Second message");
  await changeSettings(chats, { modelOverrides: { [provider]: { first: null } } });
  await reply(chat, "Third message");
  for (const prompt of prompts) {
    expect(prompt).toContain("Model knowledge cutoff: 2026-04.");
    expect(prompt).toContain("Harness: Independum");
    expect(prompt).not.toContain("Chat folder:");
    expect(prompt).not.toContain("<cwd>");
  }
  for (const message of messages) {
    expect(message).toContain("Sent at ");
  }
  expect(chat.getAgent()).toMatchObject({
    addedByPi: "",
    modelSettings: { overrides: {} },
    knowledgeCutoffs: { [provider]: { first: "2026-04" } },
    compaction: { isEnabled: false },
  });
  expect(chat.getState().messages.filter((message) => message.role === "user")).toMatchObject([
    { parts: [{ type: "text", text: "First message" }] },
    { parts: [{ type: "text", text: "Second message" }] },
    { parts: [{ type: "text", text: "Third message" }] },
  ]);
  await expect(
    changeSettings(chats, {
      disabledFacts: ["facts.unknown"],
      ...overridesOf(provider, { temperature: 1 }),
    }),
  ).rejects.toMatchObject({ status: 422 });
  expect(chat.getAgent().modelSettings?.overrides).toEqual({});
});

test("the context window changes the share and the reserve threshold", async () => {
  const { chat, chats, faux, provider } = await setup();
  faux.setResponses([fauxAssistantMessage("A reply.")]);
  await reply(chat);
  const before = chat.getContext();
  await changeSettings(chats, overridesOf(provider, { contextWindow: 256_000 }));
  const after = chat.getContext();
  expect(after.contextWindow).toBe(256_000);
  expect(after.contextTokens).toBe(before.contextTokens);
  expect(Number(after.contextTokens) / Number(after.contextWindow)).toBe(
    Number(before.contextTokens) / Number(before.contextWindow) / 2,
  );
  const { reserveTokens, keepRecentTokens } = chat.getAgent().compaction;
  const settings = { enabled: true, reserveTokens, keepRecentTokens };
  expect(shouldCompact(128_000 - reserveTokens + 1, Number(before.contextWindow), settings)).toBe(
    true,
  );
  expect(shouldCompact(128_000 - reserveTokens + 1, Number(after.contextWindow), settings)).toBe(
    false,
  );
  expect(shouldCompact(256_000 - reserveTokens, Number(after.contextWindow), settings)).toBe(false);
  expect(shouldCompact(256_000 - reserveTokens + 1, Number(after.contextWindow), settings)).toBe(
    true,
  );
});

test("automatic compaction uses the overridden window and token settings", async () => {
  const { chat, chats, faux, provider } = await setup();
  faux.setResponses([fauxAssistantMessage("Older text. ".repeat(1000))]);
  await reply(chat, "Remember this older message.");
  const tokens = Number(chat.getContext().contextTokens);
  await changeSettings(chats, {
    ...overridesOf(provider, { contextWindow: tokens + 500 }),
    compaction: { isEnabled: true, reserveTokens: 512, keepRecentTokens: 0 },
  });
  faux.setResponses([
    fauxAssistantMessage("The older conversation is summarized."),
    fauxAssistantMessage("A new reply."),
  ]);
  await reply(chat, "Continue after summarizing.");
  const context = chat.getContext();
  expect(context.compactionReserve).toBe(512);
  expect(context.entries.filter((entry) => entry.type === "compaction")).toHaveLength(1);
  expect(chat.getState().isCompacting).toBe(false);
  expect(chat.getState().compactionError).toBeNull();
});

test("compaction off removes the reserve and prevents automatic compaction", async () => {
  const { chat, chats, faux, provider } = await setup();
  await changeSettings(chats, {
    ...overridesOf(provider, { contextWindow: 1 }),
    compaction: { isEnabled: false, reserveTokens: 16_384, keepRecentTokens: 0 },
  });
  faux.setResponses([fauxAssistantMessage("One reply."), fauxAssistantMessage("Another reply.")]);
  await reply(chat);
  await reply(chat);
  expect(faux.state.callCount).toBe(2);
  expect(chat.getContext().compactionReserve).toBeNull();
  expect(chat.getContext().entries.some((entry) => entry.type === "compaction")).toBe(false);
});

test("manual compaction works while automatic compaction is off and reports failures", async () => {
  const { chat, chats, faux, provider, models } = await setup();
  await changeSettings(chats, {
    ...overridesOf(provider, { maxOutput: 250, temperature: 0.2 }),
    compaction: { isEnabled: false, reserveTokens: 400, keepRecentTokens: 0 },
  });
  faux.setResponses([
    fauxAssistantMessage("An older reply."),
    fauxAssistantMessage("A newer reply."),
  ]);
  await reply(chat, "An older message.");
  await reply(chat, "A newer message.");
  const summaryOptions: (SimpleStreamOptions | undefined)[] = [];
  function summarize(
    ...[_context, options]: Parameters<FauxResponseFactory>
  ): ReturnType<FauxResponseFactory> {
    summaryOptions.push(options);
    return fauxAssistantMessage("A summary of older messages.");
  }
  faux.setResponses([summarize]);
  const completed = waitForCompaction(chat);
  const routes = createChatRoutes(chats, models);
  const path = `/chats/${chat.getState().id}/compact`;
  expect((await routes.request("/chats/missing/compact", { method: "POST" })).status).toBe(404);
  expect((await routes.request(path, { method: "POST" })).status).toBe(202);
  expect((await routes.request(path, { method: "POST" })).status).toBe(409);
  expect(await chat.send("While compacting")).toBe(false);
  expect((await completed).compactionError).toBeNull();
  expect(chat.getContext().entries.filter((entry) => entry.type === "compaction")).toHaveLength(1);
  expect(summaryOptions).toHaveLength(1);
  for (const options of summaryOptions) {
    expect(options).toMatchObject({ maxTokens: 250, temperature: 0.2 });
  }
  const failed = waitForCompaction(chat);
  expect(await chat.compact()).toBe(true);
  expect((await failed).compactionError).toContain("Already compacted");
  expect(chat.getState().isCompacting).toBe(false);
});

test("model and compaction settings survive reopening a saved chat after a restart", async () => {
  const { chat, chats, faux, models, directory, folder, provider } = await setup();
  const overrides = { contextWindow: 200_000, maxOutput: 1500, temperature: 0.4 };
  const compaction = { isEnabled: false, reserveTokens: 600, keepRecentTokens: 300 };
  await changeSettings(chats, { ...overridesOf(provider, overrides), compaction });
  faux.setResponses([fauxAssistantMessage("Saved.")]);
  await reply(chat);
  const restartedChats = await createChat({ models, directory, folder });
  const restarted = await restartedChats.open(await restartedChats.first());
  if (restarted === undefined) {
    throw new Error("The saved test chat did not reopen.");
  }
  expect(restarted.getAgent()).toMatchObject({ modelSettings: { overrides }, compaction });
  expect(restarted.getContext().contextWindow).toBe(200_000);
  expect(restarted.getContext().compactionReserve).toBeNull();
  let temperature: number | undefined;
  faux.setResponses([
    (_context, options) => {
      temperature = options?.temperature;
      return fauxAssistantMessage("After restart.");
    },
  ]);
  await reply(restarted);
  expect(temperature).toBe(0.4);
  const saved = await savedSettings(directory);
  expect(saved.modelOverrides).toEqual({ [provider]: { first: overrides } });
  expect(saved.compaction).toEqual(compaction);
});

test("choosing built-in values removes edits and reset restores the catalog limits", async () => {
  const { chat, chats, faux, provider, directory } = await setup();
  await changeSettings(
    chats,
    overridesOf(provider, { contextWindow: 100_000, maxOutput: 500, temperature: 0.5 }),
  );
  await changeSettings(
    chats,
    overridesOf(provider, { contextWindow: 128_000, maxOutput: 16_384, temperature: null }),
  );
  expect(chat.getAgent().modelSettings?.overrides).toEqual({});
  await changeSettings(chats, overridesOf(provider, { contextWindow: 100_000 }));
  await changeSettings(chats, { modelOverrides: { [provider]: { first: null } } });
  expect(chat.getContext().contextWindow).toBe(128_000);
  expect((await savedSettings(directory)).modelOverrides).toEqual({});
  const model = { ...faux.models[0], samplingParams: { temperature: 0.6 } };
  expect(modelSettingsOf(model).builtIn.temperature).toBe(0.6);
  expect(modelSettingsOf(model, { contextWindow: 128_000, temperature: 0.6 }).overrides).toEqual(
    {},
  );
  expect(applyModelOverrides(model, {}).contextWindow).toBe(128_000);
});

test("invalid overrides and compaction settings are refused whole", async () => {
  const { chat, chats, models, provider } = await setup();
  const routes = createChatRoutes(chats, models);
  const invalid = [
    { modelOverrides: { [provider]: { first: { contextWindow: 0 } } } },
    { modelOverrides: { [provider]: { first: { maxOutput: 1.5 } } } },
    { modelOverrides: { [provider]: { first: { temperature: -1 } } } },
    { modelOverrides: { [provider]: { first: { unknown: 1 } } } },
    { modelOverrides: { [provider]: { missing: { maxOutput: 100 } } } },
    { compaction: { isEnabled: false, reserveTokens: -1, keepRecentTokens: 0 } },
    { compaction: { isEnabled: true, reserveTokens: 0, keepRecentTokens: 0.5 } },
  ];
  for (const change of invalid) {
    const response = await routes.request("/profiles/user/default/settings", {
      method: "PUT",
      headers: {
        "content-type": "application/json",
        "If-Match": chats.profiles.profile(
          { scope: "user", id: "default" },
          chats.profiles.projects()[0]?.id ?? "",
        ).revision,
      },
      body: JSON.stringify(change),
    });
    expect(response.status).toBe(422);
  }
  expect(readSettingsChange(overridesOf(provider, { temperature: Number.NaN }))).toBeUndefined();
  expect(
    readSettingsChange(overridesOf(provider, { contextWindow: Number.MAX_SAFE_INTEGER + 1 })),
  ).toBeUndefined();
  expect(chat.getAgent().modelSettings?.overrides).toEqual({});
  expect(chat.getAgent().compaction).toEqual(builtInSettings.compaction);
});

test("separate field changes keep each other and persist in order", async () => {
  const { chat, chats, provider, directory } = await setup();
  for (const change of [
    overridesOf(provider, { contextWindow: 180_000 }),
    overridesOf(provider, { temperature: 0.3 }),
    { compaction: { isEnabled: false } },
    { compaction: { reserveTokens: 0 } },
    { tool: { name: "Read", isEnabled: false } },
    { tool: { name: "Write", isEnabled: false } },
  ]) {
    await changeSettings(chats, change);
  }
  const saved = await savedSettings(directory);
  expect(saved.disabledTools).toEqual(["Read", "Write"]);
  expect(saved.modelOverrides).toEqual({
    [provider]: { first: { contextWindow: 180_000, temperature: 0.3 } },
  });
  expect(saved.compaction).toEqual({
    ...builtInSettings.compaction,
    isEnabled: false,
    reserveTokens: 0,
  });
  await changeSettings(chats, overridesOf(provider, { contextWindow: null }));
  expect(chat.getAgent().modelSettings?.overrides).toEqual({ temperature: 0.3 });
});

test("a profile edit waits until all turns of a running reply settle", async () => {
  const { chat, chats, faux, provider } = await setup();
  const held = holdReply();
  let received: { contextWindow: number; temperature: number | undefined } | undefined;
  faux.setResponses([
    held.receive,
    (_context, options, _state, model) => {
      received = { contextWindow: model.contextWindow, temperature: options?.temperature };
      return fauxAssistantMessage("Done after the tool.");
    },
  ]);
  const finished = reply(chat);
  await held.entered;
  const next = await startNextChat(chats, chat);
  await next.chooseModel(provider, "second");
  await changeSettings(chats, overridesOf(provider, { contextWindow: 300_000, temperature: 0.7 }));
  held.finish(
    fauxAssistantMessage([fauxToolCall("Read", { path: "missing-file-for-settings-test" })], {
      stopReason: "toolUse",
    }),
  );
  await finished;
  expect(received).toEqual({ contextWindow: 128_000, temperature: undefined });
  expect(next.getContext().contextWindow).toBe(128_000);
});

test("manual compaction stays alive when the user opens another chat", async () => {
  const { chat, chats, faux, models } = await setup();
  await changeSettings(chats, { compaction: { isEnabled: false, keepRecentTokens: 0 } });
  faux.setResponses([
    fauxAssistantMessage("An older turn."),
    fauxAssistantMessage("A newer turn."),
  ]);
  await reply(chat, "An older prompt.");
  await reply(chat, "A newer prompt.");
  const id = chat.getState().id ?? "";
  const held = holdReply();
  faux.setResponses([held.receive, fauxAssistantMessage("The start of the newest turn.")]);
  const routes = createChatRoutes(chats, models);
  expect((await routes.request(`/chats/${id}/compact`, { method: "POST" })).status).toBe(202);
  await held.entered;
  const next = await startNextChat(chats, chat);
  expect(next.getState().isCompacting).toBe(false);
  const reopened = await chats.open(id);
  expect(reopened).toBeDefined();
  expect(reopened?.getState().isCompacting).toBe(true);
  if (reopened === undefined) {
    throw new Error("The compacting chat did not reopen.");
  }
  const completed = waitForCompaction(reopened);
  held.finish(fauxAssistantMessage("The older conversation."));
  expect((await completed).compactionError).toBeNull();
});

async function changeSettings(chats: Chat, change: SettingsChange): Promise<boolean> {
  const projectId = chats.profiles.projects()[0]?.id ?? "";
  const reference = chats.profiles.user().document?.defaultProfile ?? {
    scope: "user",
    id: "default",
  };
  if (change.knowledgeCutoffs !== undefined) {
    const user = chats.profiles.user();
    await chats.profiles.putUser(
      { ...user.document, knowledgeCutoffs: change.knowledgeCutoffs },
      user.revision,
    );
  }
  const { knowledgeCutoffs: _cutoffs, ...profileChange } = change;
  return chats.changeSettings(
    reference,
    projectId,
    profileChange,
    chats.profiles.profile(reference, projectId).revision,
  );
}

async function savedSettings(directory: string): Promise<Settings> {
  const store = await createProfileStore(directory, [join(directory, "project")], []);
  try {
    return store.preview(
      store.user().document?.defaultProfile ?? { scope: "user", id: "default" },
      store.projects()[0]?.id ?? "",
    ).settings;
  } finally {
    store.close();
  }
}
