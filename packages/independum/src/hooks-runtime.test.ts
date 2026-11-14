import { randomUUID } from "node:crypto";
import { mkdirSync, readFileSync, renameSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import {
  fauxAssistantMessage,
  fauxProvider,
  fauxToolCall,
  getCurrentSystemPrompt,
} from "@earendil-works/pi-ai";
import { AssistantMessageEventStream } from "@earendil-works/pi-ai/utils/event-stream";
import { type SessionEntry, SessionManager } from "@earendil-works/pi-coding-agent";
import { expect, test, vi } from "vitest";
import { waitFor } from "../../../scripts/wait-for.ts";
import type { ChatEvent, InputOptions } from "./api-types.ts";
import type { AttachmentPosition } from "./create-attachments.ts";
import { createChat, type OpenChat } from "./create-chat.ts";
import { createChatRoutes } from "./create-chat-routes.ts";
import { createModelRuntime } from "./create-model-runtime.ts";
import { createOperations } from "./create-operations.ts";
import { executeScriptHook } from "./execute-script-hook.ts";
import type { HookEvent, ScriptHook } from "./hook-contract.ts";
import { createTestFolder, createTestProject } from "./tools/create-test-folder.ts";
import { envelopeText } from "./wrap-note.ts";

vi.mock("./execute-script-hook.ts", () => ({ executeScriptHook: vi.fn() }));

const parent = createTestFolder("hook-runtime");
let nextId = 0;

async function setup(
  event: HookEvent,
  additionalEvents: HookEvent[] = [],
  hasCustomEnvelope = false,
) {
  nextId += 1;
  const { directory, project } = createTestProject(parent);
  const state = join(directory, "state");
  mkdirSync(state);
  const models = await createModelRuntime(state);
  const faux = fauxProvider({
    provider: `hook-test-${nextId}`,
    models: [{ id: "model", input: ["text", "image"] }, { id: "other" }],
  });
  models.registerNativeProvider(faux.provider);
  await models.setRuntimeApiKey(faux.provider.id, "test-key");
  faux.setResponses([fauxAssistantMessage("Complete.")]);
  const sent: unknown[] = [];
  const prompts: string[] = [];
  const original = models.streamSimple.bind(models);
  vi.spyOn(models, "streamSimple").mockImplementation((model, context, options) => {
    const stream = new AssistantMessageEventStream();
    async function send(): Promise<void> {
      try {
        const payload = { messages: context.messages };
        const accepted = (await options?.onPayload?.(payload, model)) ?? payload;
        sent.push(accepted);
        prompts.push(getCurrentSystemPrompt(context.messages));
        const response = original(model, context, options);
        for await (const event of response) {
          stream.push(event);
        }
      } catch (error) {
        stream.push({
          type: "error",
          reason: "error",
          error: fauxAssistantMessage([], {
            stopReason: "error",
            errorMessage: error instanceof Error ? error.message : "Failed.",
          }),
        });
      } finally {
        stream.end();
      }
    }
    send();
    return stream;
  });
  const chats = await createChat({ models, directory: state, folder: project });
  const reference = { scope: "user", id: "default" } as const;
  const projectId = chats.profiles.projects()[0]?.id ?? "";
  const hook: ScriptHook = {
    id: "script",
    event,
    mode: "transform",
    run: { command: [process.execPath, "script.ts"], workingDirectory: "source" },
  };
  const profile = chats.profiles.profile(reference, projectId);
  await chats.profiles.putProfile(
    reference,
    projectId,
    {
      profile: {
        formatVersion: 1,
        name: "Hooks",
        settings: {
          model: { providerId: faux.provider.id, modelId: "model" },
          hooks: [
            hook,
            ...additionalEvents.map((event, index) => ({ ...hook, id: `script${index}`, event })),
          ],
          compaction: { isEnabled: false, reserveTokens: 0, keepRecentTokens: 0 },
          attachments: { resizeImages: false },
        },
      },
      systemPrompt: "Base prompt.",
      modelTexts: hasCustomEnvelope
        ? {
            formatVersion: 1,
            texts: {
              "note.envelope": { text: "From {source}\n{note}", builtIn: envelopeText.builtIn },
            },
          }
        : null,
    },
    profile.revision,
  );
  const opened = await chats.open(await chats.first());
  if (opened === undefined) {
    throw new Error("The hook test chat did not open.");
  }
  return {
    chats,
    opened,
    models,
    sent,
    prompts,
    faux,
    directory: state,
    folder: project,
    routes: createChatRoutes(chats, models),
  };
}

async function reply(opened: OpenChat): Promise<ChatEvent[]> {
  const events: ChatEvent[] = [];
  const finished = Promise.withResolvers<void>();
  const stop = opened.subscribe((event) => {
    events.push(event);
    if (event.type === "replying" && !event.isReplying) {
      finished.resolve();
    }
  });
  try {
    expect(await opened.send("Question.", "literal")).toBe(true);
    await finished.promise;
    return events;
  } finally {
    stop();
  }
}

function optionsFor(
  opened: OpenChat,
  attachmentIds: string[] = [],
  delivery: InputOptions["delivery"] = "queue",
): InputOptions {
  const state = opened.getState();
  return {
    id: randomUUID(),
    delivery,
    expectedRevision: state.pending.revision,
    expectedLeafId: state.leafId,
    attachmentIds,
  };
}

test.each([
  [false, false],
  [true, false],
  [false, true],
  [true, true],
])(
  "legacy attachments with changed input %s and custom wrapper %s require exact input",
  async (doesHookChangeInput, hasCustomEnvelope) => {
    const prefix = doesHookChangeInput ? "x".repeat(580) : "";
    vi.mocked(executeScriptHook).mockImplementation(async (_hook, input) => ({
      output: JSON.stringify({
        apiVersion: 1,
        action: "replace",
        replacement: { text: prefix + String(input.data.text), images: input.data.images ?? [] },
      }),
      error: "",
      exitCode: 0,
    }));
    const { chats, opened, models, directory, folder, faux } = await setup(
      "input",
      [],
      hasCustomEnvelope,
    );
    const attachment = await opened.uploadAttachment(
      "file.pdf",
      "application/pdf",
      new Response("%PDF-fixture").body,
    );
    const expected = (await opened.previewAttachment(attachment.id, false)).modelText;
    const chatId = opened.getState().id;
    try {
      const events: ChatEvent[] = [];
      const stop = opened.subscribe((event) => events.push(event));
      try {
        expect(
          await opened.send(
            "Question.",
            "literal",
            undefined,
            false,
            optionsFor(opened, [attachment.id]),
          ),
        ).toBe(true);
        await waitFor(() =>
          expect(opened.getState().messages[0]?.attachments?.[0]?.modelText).toBe(expected),
        );
        await waitFor(() =>
          expect(opened.getState().messages.at(-1)?.parts).toEqual([
            { type: "text", text: "Complete." },
          ]),
        );
        await waitFor(() => expect(opened.getState().isReplying).toBe(false));
        expect(
          events.some(
            (event) =>
              event.type === "message" && event.message.attachments?.[0]?.modelText === expected,
          ),
        ).toBe(true);
      } finally {
        stop();
      }
    } finally {
      opened.close();
      await chats.stopAll();
    }
    const saved = (await SessionManager.listAll(join(directory, "sessions"))).find(
      (chat) => chat.id === chatId,
    );
    if (saved === undefined) {
      throw new Error("The saved hook chat is missing.");
    }
    const reopened = await createChat({ models, directory, folder });
    try {
      expect(
        (await reopened.open(chatId))?.getState().messages[0]?.attachments?.[0]?.modelText,
      ).toBe(expected);
    } finally {
      await reopened.stopAll();
    }
    const current = JSON.stringify(join(directory, "attachments", attachment.id, "content"));
    const legacyStore = `${directory}-attachments`;
    const legacy = JSON.stringify(join(legacyStore, attachment.id, "content"));
    const preparedText = `Question.\n\n${expected}`;
    const entries = `${readFileSync(saved.path, "utf8")
      .trim()
      .split("\n")
      .map((line) => {
        const entry = JSON.parse(line) as SessionEntry;
        if (entry.type === "custom" && entry.customType === "independum-input") {
          const data = entry.data as { attachmentPositions: AttachmentPosition[] };
          data.attachmentPositions = data.attachmentPositions.map(
            ({ id, isFile, start, end, imageIndex }) => ({
              id,
              isFile,
              start: preparedText.slice(0, start).replaceAll(current, legacy).length,
              end: preparedText.slice(0, end).replaceAll(current, legacy).length,
              imageIndex,
            }),
          );
        }
        return JSON.stringify(entry).replaceAll(
          JSON.stringify(current).slice(1, -1),
          JSON.stringify(legacy).slice(1, -1),
        );
      })
      .join("\n")}\n`;
    writeFileSync(saved.path, entries);
    renameSync(join(directory, "attachments"), legacyStore);
    const migrated = await createChat({ models, directory, folder });
    try {
      const chat = await migrated.open(chatId);
      if (chat === undefined) {
        throw new Error("The migrated hook chat did not open.");
      }
      expect(chat.getState().messages[0]?.attachments?.[0]?.modelText).toBe(
        doesHookChangeInput ? null : expected,
      );
      await chat.resumePending();
      let received = "";
      faux.setResponses([
        async (context, options, _state, model) => {
          received = JSON.stringify(context.messages);
          await options?.onPayload?.({ messages: context.messages }, model);
          return fauxAssistantMessage("Continued.");
        },
      ]);
      expect(await chat.send("Continue.", "literal")).toBe(true);
      const escaped = JSON.stringify(current).slice(1, -1);
      const obsolete = JSON.stringify(legacy).slice(1, -1);
      await waitFor(() => expect(received).toContain(escaped));
      await waitFor(() => expect(chat.getState().isReplying).toBe(false));
      expect(received).toContain(prefix);
      expect(received).not.toContain(obsolete);
      expect(JSON.stringify(chat.getContext().lastRequest)).toContain(escaped);
      expect(JSON.stringify(chat.getContext().lastRequest)).not.toContain(obsolete);
      expect(readFileSync(saved.path, "utf8").startsWith(entries)).toBe(true);
    } finally {
      await migrated.stopAll();
    }
  },
);

test.each([
  "input",
  "before_agent_start",
  "context",
  "context_with_system",
  "before_provider_request",
] as const)(
  "a stopped %s hook sends no request despite pi catching extension errors",
  async (event) => {
    vi.mocked(executeScriptHook).mockResolvedValue({
      output: "invalid JSON",
      error: "diagnostic",
      exitCode: 0,
    });
    const { opened, chats, sent } = await setup(event);
    try {
      await reply(opened);
      expect(sent).toHaveLength(0);
      expect(opened.getHooks().invocations[0]?.status).toBe("failed");
      if (event === "input") {
        replaceWith({ text: "Recovered input.", images: [] });
        expect(await opened.send("Try again", "literal")).toBe(true);
        expect(opened.getState().pending.isPaused).toBe(true);
        await opened.resumePending();
        await waitFor(() => expect(opened.getState().pending.items).toHaveLength(0));
        await waitFor(() => expect(opened.getState().isReplying).toBe(false));
        expect(sent).toHaveLength(1);
        expect(opened.getHooks().invocations).toHaveLength(2);
      }
    } finally {
      opened.close();
      await chats.stopAll();
    }
  },
);

test("prompt replacement survives the owned context projection and final payload is captured", async () => {
  replaceWith({ systemPrompt: "The replaced prompt." });
  const { opened, chats, sent, prompts } = await setup("before_agent_start");
  try {
    await reply(opened);
    expect(sent).toHaveLength(1);
    expect(prompts[0]).toBe("The replaced prompt.");
  } finally {
    opened.close();
    await chats.stopAll();
  }
});

test("hook routes bind invocation reads stop and revision checks to the addressed chat", async () => {
  replaceWith({ changed: true });
  const { opened, chats, routes, sent } = await setup("before_provider_request");
  try {
    await reply(opened);
    expect(sent).toEqual([{ changed: true }]);
    const prefix = `/chats/${opened.getState().id}/hooks`;
    const summary = opened.getHooks();
    const id = summary.invocations[0]?.id;
    expect((await routes.request(`${prefix}/invocations/${id}`)).status).toBe(200);
    expect((await routes.request(`${prefix}/invocations/unknown`)).status).toBe(404);
    expect((await routes.request(`${prefix}/reload`, { method: "POST" })).status).toBe(428);
    expect(
      (
        await routes.request(`${prefix}/reload`, {
          method: "POST",
          headers: { "If-Match": "stale" },
        })
      ).status,
    ).toBe(412);
    expect(
      (
        await routes.request(`${prefix}/reload`, {
          method: "POST",
          headers: { "If-Match": summary.revision },
        })
      ).status,
    ).toBe(200);
    const otherId = await chats.startNew(opened.getState().id);
    expect((await routes.request(`/chats/${otherId}/hooks/invocations/${id}`)).status).toBe(404);
  } finally {
    opened.close();
    await chats.stopAll();
  }
});

test.each(["queue", "steer", "headless"] as const)(
  "%s delivery invokes input once with captured choices command text and attachments",
  async (delivery) => {
    vi.mocked(executeScriptHook).mockImplementation(async (_hook, input) => ({
      output: JSON.stringify({
        apiVersion: 1,
        action: "replace",
        replacement: {
          text: `Accepted ${String(input.data.text)}`,
          images: input.data.images ?? [],
        },
      }),
      error: "",
      exitCode: 0,
    }));
    const { chats, opened, faux, folder, sent, directory } = await setup("input");
    const operations = createOperations(chats, directory, "hook-server");
    let operationId: string | undefined;
    const entered = Promise.withResolvers<void>();
    const finish = Promise.withResolvers<void>();
    faux.setResponses([
      async () => {
        entered.resolve();
        await finish.promise;
        return fauxAssistantMessage("First answer.");
      },
      fauxAssistantMessage("Next answer."),
    ]);
    try {
      const pixel =
        "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mNkYAAAAAYAAjCB0C8AAAAASUVORK5CYII=";
      const attachmentIds: string[] = [];
      if (delivery !== "headless") {
        for (const [name, mimeType, bytes] of [
          ["note.txt", "text/plain", Buffer.from("Hook attachment.\r\n")],
          ["pixel.png", "image/png", Buffer.from(pixel, "base64")],
        ] as const) {
          const source = await opened.uploadAttachment(
            name,
            mimeType,
            new Response(new Uint8Array(bytes)).body,
          );
          attachmentIds.push(source.id);
        }
      }
      expect(
        await opened.send("Start", "literal", undefined, false, optionsFor(opened, attachmentIds)),
      ).toBe(true);
      await entered.promise;
      const commands = join(folder, ".independum", "commands");
      mkdirSync(commands, { recursive: true });
      const source = join(commands, "review.md");
      writeFileSync(source, "---\ndescription: Review data.\n---\nCaptured $1.");
      const preview = opened.compose("/review result", "commands");
      const state = opened.getState();
      const options = optionsFor(opened, attachmentIds, delivery === "steer" ? "steer" : "queue");
      const requestId = options.id;
      async function submit(): Promise<boolean> {
        if (delivery === "headless") {
          const accepted = await operations.prompt({
            requestId,
            chatId: state.id,
            text: "/review result",
          });
          operationId = accepted.operationId;
          options.id = accepted.submissionId;
          return true;
        }
        return opened.send(preview.text, "commands", preview.id, false, options);
      }
      expect(await submit()).toBe(true);
      expect(await submit()).toBe(true);
      const captured = opened.getState().pending.items.find((input) => input.id === options.id);
      expect(captured?.command?.text).toBe(preview.text);
      expect(await opened.send("Remove me", "literal")).toBe(true);
      const removable = opened.getState().pending.items.find((input) => input.text === "Remove me");
      expect(opened.removePending(removable?.id ?? "")).toBe(true);
      expect(opened.getHooks().invocations).toHaveLength(1);
      writeFileSync(source, "Changed source.");
      expect(await opened.chooseModel(faux.provider.id, "other")).toBe(true);
      finish.resolve();
      await waitFor(() => expect(opened.inputState(options.id)).toBe("delivered"));
      await waitFor(() => expect(opened.getState().isReplying).toBe(false));
      if (operationId !== undefined) {
        expect(await operations.wait(operationId, "fail")).toMatchObject({
          status: "completed",
          text: "Next answer.",
        });
      }
      expect(await submit()).toBe(true);
      const invocations = opened.getHooks().invocations;
      expect(invocations.map((record) => record.input.data.text)).toEqual([
        delivery === "headless" ? "Start" : expect.stringContaining("Start\n\n"),
        delivery === "headless"
          ? "Captured result."
          : expect.stringContaining("Captured result.\n\n"),
      ]);
      for (const invocation of invocations) {
        if (delivery !== "headless") {
          expect(invocation.input.data.text).toContain("Hook attachment.\r\n");
          expect(invocation.input.data.images).toEqual([
            { type: "image", mimeType: "image/png", data: pixel },
          ]);
        }
      }
      expect(invocations[1]?.input).toMatchObject({
        model: {
          providerId: captured?.model.providerId,
          id: captured?.model.modelId,
          thinkingLevel: captured?.model.thinkingLevel,
        },
        data: { source: delivery === "headless" ? "rpc" : "interactive" },
      });
      expect(invocations[1]?.input.data.streamingBehavior).toBe(
        delivery === "steer" ? "steer" : undefined,
      );
      expect(sent).toHaveLength(2);
      expect(sent[1]).toMatchObject({
        messages: expect.arrayContaining([
          expect.objectContaining({
            role: "user",
            content: expect.arrayContaining([
              { type: "text", text: `Accepted ${String(invocations[1]?.input.data.text)}` },
              ...(delivery === "headless"
                ? []
                : [{ type: "image", mimeType: "image/png", data: pixel }]),
            ]),
          }),
        ]),
      });
    } finally {
      finish.resolve();
      operations.close();
      opened.close();
      await chats.stopAll();
    }
  },
);

test("restart holds accepted inputs until resume and invokes input only at delivery", async () => {
  replaceWith({ text: "Delivered after restart.", images: [] });
  const { chats, opened, models, directory, folder } = await setup("input");
  const operations = createOperations(chats, directory, "first-server");
  const accepted = await operations.prompt({
    requestId: "restart",
    chatId: opened.getState().id,
    text: "Held input",
    isLiteral: true,
  });
  const id = opened.getState().id;
  await chats.stopAll();
  operations.close();
  expect(opened.getHooks().invocations).toHaveLength(0);
  const reopened = await createChat({ models, directory, folder });
  const recovered = createOperations(reopened, directory, "next-server");
  const restored = await reopened.open(id);
  if (restored === undefined) {
    throw new Error("The waiting hook input did not reopen.");
  }
  try {
    expect(restored.getState().pending.isPaused).toBe(true);
    expect(await recovered.show(accepted.operationId)).toMatchObject({
      status: "interrupted",
      code: "serverRestarted",
    });
    expect(restored.getHooks().invocations).toHaveLength(0);
    await restored.resumePending();
    await waitFor(() => expect(restored.getState().pending.items).toHaveLength(0));
    await waitFor(() => expect(restored.getState().isReplying).toBe(false));
    expect(restored.getHooks().invocations).toMatchObject([
      {
        input: { data: { text: "Held input", source: "rpc" } },
        accepted: { text: "Delivered after restart." },
      },
    ]);
    expect(restored.getContext().submissions).toEqual([
      { operationId: accepted.operationId, submissionId: accepted.submissionId },
    ]);
  } finally {
    recovered.close();
    restored.close();
    await reopened.stopAll();
  }
});

test("a stopped tool result hook holds steers before handoff until resume", async () => {
  const entered = Promise.withResolvers<void>();
  const fail = Promise.withResolvers<void>();
  vi.mocked(executeScriptHook).mockImplementation(async (hook) => {
    if (hook.event === "tool_result") {
      entered.resolve();
      await fail.promise;
      return { output: "invalid JSON", error: "", exitCode: 0 };
    }
    return { output: '{"apiVersion":1,"action":"continue"}', error: "", exitCode: 0 };
  });
  const { chats, opened, faux, sent } = await setup("input", ["tool_result"]);
  faux.setResponses([
    fauxAssistantMessage([fauxToolCall("CheckCommand", { id: 1 })], { stopReason: "toolUse" }),
    fauxAssistantMessage("Resumed."),
  ]);
  try {
    await opened.send("Start", "literal");
    await entered.promise;
    await opened.send("Held steer", "literal", undefined, false, optionsFor(opened, [], "steer"));
    fail.resolve();
    await waitFor(() => expect(opened.getState().isReplying).toBe(false));
    expect(opened.getState().pending).toMatchObject({
      isPaused: true,
      items: [{ text: "Held steer", state: "held" }],
    });
    function inputs(): unknown[] {
      return opened
        .getHooks()
        .invocations.filter((record) => record.event === "input")
        .map((record) => record.input.data.text);
    }
    expect(inputs()).toEqual(["Start"]);
    await opened.resumePending();
    await waitFor(() => expect(opened.getState().pending.items).toHaveLength(0));
    expect(inputs()).toEqual(["Start", "Held steer"]);
    await waitFor(() => expect(opened.getState().isReplying).toBe(false));
    expect(sent).toHaveLength(2);
  } finally {
    fail.resolve();
    opened.close();
    await chats.stopAll();
  }
});

test("a tool call replacement that differs from the tool schema fails its hook", async () => {
  replaceWith({ input: { id: "1" } });
  const { chats, opened, faux } = await setup("tool_call");
  faux.setResponses([
    fauxAssistantMessage([fauxToolCall("CheckCommand", {})], { stopReason: "toolUse" }),
    fauxAssistantMessage("Checked."),
  ]);
  try {
    await reply(opened);
    expect(opened.getHooks().invocations).toMatchObject([{ status: "failed" }]);
  } finally {
    opened.close();
    await chats.stopAll();
  }
});

function replaceWith(replacement: unknown): void {
  vi.mocked(executeScriptHook).mockResolvedValue({
    output: JSON.stringify({ apiVersion: 1, action: "replace", replacement }),
    error: "",
    exitCode: 0,
  });
}
