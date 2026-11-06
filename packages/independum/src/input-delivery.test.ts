import { randomUUID } from "node:crypto";
import { mkdirSync, writeFileSync } from "node:fs";
import { basename, join } from "node:path";
import {
  type AssistantMessage,
  fauxAssistantMessage,
  fauxProvider,
  fauxToolCall,
} from "@earendil-works/pi-ai";
import { expect, test, vi } from "vitest";
import type { BranchRequest, ChatState, InputDelivery, InputOptions } from "./api-types.ts";
import { validateUserSettings } from "./configuration-schema.ts";
import { createChat, type OpenChat } from "./create-chat.ts";
import { createChatRoutes } from "./create-chat-routes.ts";
import { createModelRuntime } from "./create-model-runtime.ts";
import { projectIdOf } from "./create-profile-store.ts";
import { evaluatePermission } from "./permission-policy.ts";
import { builtInAttachments } from "./read-attachment-settings.ts";
import { createTestFolder } from "./tools/create-test-folder.ts";

const parent = createTestFolder("input-delivery");
const pixel = Buffer.from(
  "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mNkYAAAAAYAAjCB0C8AAAAASUVORK5CYII=",
  "base64",
);

async function setup(inputLimits?: { images: { maxPerRequest: number } }) {
  const directory = join(parent, randomUUID());
  const folder = join(directory, "project");
  mkdirSync(folder, { recursive: true });
  const models = await createModelRuntime(directory);
  const provider = `input-${randomUUID()}`;
  const faux = fauxProvider({
    provider,
    models: [
      {
        id: "first",
        input: ["text", "image"],
        ...(inputLimits === undefined ? {} : { inputLimits }),
      },
      { id: "second" },
    ],
  });
  models.registerNativeProvider(faux.provider);
  await models.setRuntimeApiKey(provider, "test-key");
  const chats = await createChat({ models, directory, folder });
  const chat = await chats.open(await chats.first());
  if (chat === undefined) {
    throw new Error("The input test chat did not open.");
  }
  await chat.chooseModel(provider, "first");
  return { chats, chat, models, provider, faux, directory, folder };
}

function optionsFor(chat: OpenChat, delivery: InputDelivery = "queue"): InputOptions {
  const state = chat.getState();
  return {
    id: randomUUID(),
    delivery,
    expectedRevision: state.pending.revision,
    expectedLeafId: state.leafId,
  };
}

async function send(
  chat: OpenChat,
  text: string,
  delivery: InputDelivery = "queue",
): Promise<InputOptions> {
  const options = optionsFor(chat, delivery);
  expect(await chat.send(text, "literal", undefined, false, options)).toBe(true);
  return options;
}

function holdReply(message: AssistantMessage) {
  const entered = Promise.withResolvers<void>();
  const finish = Promise.withResolvers<void>();
  return {
    entered: entered.promise,
    finish: finish.resolve,
    async receive() {
      entered.resolve();
      await finish.promise;
      return message;
    },
  };
}

function prompts(state: ChatState): string[] {
  return state.messages
    .filter((message) => message.role === "user")
    .map((message) =>
      message.parts.map((part) => (part.type === "text" ? part.text : "")).join(""),
    );
}

test("waiting messages carry each attachment form through steer and follow-up handoff", async () => {
  const { chats, chat, faux, directory, folder } = await setup();
  const reference = { scope: "user", id: "default" } as const;
  await chats.changeSettings(
    reference,
    projectIdOf(folder),
    { attachments: { ...builtInAttachments, resizeImages: false } },
    chats.profiles.profile(reference, projectIdOf(folder)).revision,
  );

  const sources = [];
  for (const [name, mimeType, bytes] of [
    ["note.txt", "text/plain", Buffer.from("Attached text.\r\n")],
    ["pixel.png", "image/png", pixel],
    ["paper.pdf", "application/pdf", Buffer.from("%PDF-1.7\nSaved bytes.")],
  ] as const) {
    sources.push(
      await chat.uploadAttachment(name, mimeType, new Response(new Uint8Array(bytes)).body),
    );
  }
  const policy = chat.getAgent().permissions;
  if (policy === undefined) {
    throw new Error("The attachment policy is missing.");
  }
  expect(policy.savedApprovals).toHaveLength(0);
  for (const source of sources) {
    const resource = {
      kind: "path",
      path: chat.attachmentSource(source.id).path,
      scope: "file",
      access: "read",
    } as const;
    expect(resource.path).toBe(
      join(parent, `${basename(directory)}-attachments`, source.id, "content"),
    );
    expect(evaluatePermission(policy, folder, resource, [], [directory]).decision).toBe("allow");
    expect(
      evaluatePermission(policy, folder, { ...resource, access: "write" }, [], [directory])
        .decision,
    ).toBe("ask");
    for (const effect of ["ask", "deny"] as const) {
      expect(
        evaluatePermission(
          { ...policy, rules: [{ id: "upload", effect, project: folder, resource }] },
          folder,
          resource,
          [],
          [directory],
        ).decision,
      ).toBe(effect);
    }
    expect(
      evaluatePermission(
        policy,
        folder,
        { ...resource, path: join(directory, "private.txt") },
        [],
        [directory],
      ).decision,
    ).toBe("deny");
  }
  const held = holdReply(
    fauxAssistantMessage([fauxToolCall("CheckCommand", { id: 1 })], { stopReason: "toolUse" }),
  );
  faux.setResponses([
    held.receive,
    fauxAssistantMessage("Steered."),
    fauxAssistantMessage("Queued."),
  ]);
  try {
    await send(chat, "Start");
    await held.entered;
    for (const delivery of ["queue", "steer"] as const) {
      await chat.send(`Attached ${delivery}`, "literal", undefined, false, {
        ...optionsFor(chat, delivery),
        attachmentIds: sources.map((source) => source.id),
      });
    }
    expect(
      chat
        .getState()
        .pending.items.filter((input) => (input.attachmentIds?.length ?? 0) > 0)
        .map((input) => input.attachments?.map((source) => source.kind)),
    ).toEqual([
      ["text", "image", "file"],
      ["text", "image", "file"],
    ]);
    held.finish();
    await vi.waitFor(() => expect(chat.getState().pending.items).toHaveLength(0));
    await vi.waitFor(() => expect(chat.getState().isReplying).toBe(false));
    const sent = chat
      .getState()
      .messages.filter((message) => (message.attachments?.length ?? 0) > 0);
    expect(sent.map((message) => message.parts)).toEqual([
      [{ type: "text", text: "Attached steer" }],
      [{ type: "text", text: "Attached queue" }],
    ]);
    for (const prompt of sent) {
      expect(prompt.attachments?.[1]?.image?.data).toBe(pixel.toString("base64"));
      expect(prompt.attachments?.[0]?.modelText).toContain("Attached text.\r\n");
      expect(prompt.attachments?.[2]?.modelText).toContain("Path:");
    }
    const exported = await chats.exportMarkdown(chat.getState().id);
    expect(exported).toContain("paper.pdf (File path included)");
    expect(exported).toContain("Attached text.\r\n");
    expect(exported).not.toContain(chat.attachmentSource(sources[0]?.id ?? "").path);
    expect(exported).not.toContain(pixel.toString("base64"));
  } finally {
    held.finish();
    await chats.stopAll();
  }
});

test("edits and retries retain attachment sources and file choices without duplicating images", async () => {
  const { chats, chat, faux, models, directory, folder } = await setup();
  const sources = [
    await chat.uploadAttachment("note.txt", "text/plain", new Response("Attached text.\r\n").body),
    await chat.uploadAttachment("pixel.png", "image/png", new Response(new Uint8Array(pixel)).body),
  ];
  const ids = sources.map((source) => source.id);
  const textId = ids[0] ?? "";
  const imageId = ids[1] ?? "";
  const retainedForms = [
    [textId, true],
    [imageId, false],
  ];
  let retriedImages = 0;
  faux.setResponses([
    fauxAssistantMessage("Original."),
    fauxAssistantMessage("Resent."),
    (context) => {
      const prompt = context.messages.findLast((message) => message.role === "user");
      retriedImages = Array.isArray(prompt?.content)
        ? prompt.content.filter((part) => part.type === "image").length
        : 0;
      return fauxAssistantMessage("Retried.");
    },
    fauxAssistantMessage("Changed attachments."),
  ]);
  async function settled(id: string): Promise<ChatState> {
    await vi.waitFor(() => expect(chat.inputState(id)).toBe("delivered"));
    await vi.waitFor(() => expect(chat.getState().isReplying).toBe(false));
    return chat.getState();
  }
  function request(): Pick<BranchRequest, "id" | "expectedRevision" | "expectedLeafId" | "model"> {
    const options = optionsFor(chat);
    return {
      id: options.id,
      expectedRevision: options.expectedRevision,
      expectedLeafId: options.expectedLeafId,
      model: null,
    };
  }
  try {
    const original = { ...optionsFor(chat), attachmentIds: ids, fileAttachmentIds: [textId] };
    expect(await chat.send("", "literal", undefined, false, original)).toBe(true);
    const first = (await settled(original.id)).messages[0]?.entryId ?? "";
    const edit = { ...request(), kind: "edit", sourceUserEntryId: first, text: "" } as const;
    expect(await chat.resubmit(edit)).toBe(true);
    expect(chat.getState().pending.items[0]).toMatchObject({
      attachmentIds: ids,
      fileAttachmentIds: [textId],
      branch: { kind: "edit" },
    });
    const resent = await settled(edit.id);
    const source = resent.messages[0]?.entryId ?? "";
    expect(resent.messages[0]?.attachments?.map((attachment) => attachment.id)).toEqual(ids);
    expect(resent.messages[0]?.imageCount).toBe(0);
    const retry = {
      ...request(),
      kind: "retry",
      sourceUserEntryId: source,
      sourceAssistantEntryId: resent.messages[1]?.entryId ?? "",
    } as const;
    await expect(chat.resubmit({ ...retry, attachmentIds: [] })).rejects.toMatchObject({
      status: 400,
    });
    expect(await chat.resubmit(retry)).toBe(true);
    const retried = await settled(retry.id);
    expect(
      retried.messages[0]?.attachments?.map((attachment) => [attachment.id, attachment.isFile]),
    ).toEqual(retainedForms);
    expect(retriedImages).toBe(1);
    const added = await chat.uploadAttachment(
      "added.txt",
      "text/plain",
      new Response("New inline text.").body,
    );
    const changed: BranchRequest = {
      ...request(),
      kind: "edit",
      sourceUserEntryId: retried.messages[0]?.entryId ?? "",
      text: "/literal edit",
      attachmentIds: [textId, added.id],
      fileAttachmentIds: [],
    };
    const routes = createChatRoutes(chats, models);
    const response = await routes.request(`/chats/${retried.id}/messages`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify(changed),
    });
    expect(response.status).toBe(202);
    const final = await settled(changed.id);
    expect(
      final.messages[0]?.attachments?.map((attachment) => [attachment.id, attachment.isFile]),
    ).toEqual([
      [textId, false],
      [added.id, false],
    ]);
    expect(final.messages[0]?.submittedText).toBe("/literal edit");
    const invalid = await routes.request(`/chats/${final.id}/messages`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({
        ...request(),
        kind: "retry",
        sourceUserEntryId: final.messages[0]?.entryId,
        sourceAssistantEntryId: final.messages[1]?.entryId,
        attachmentIds: [],
      }),
    });
    expect(invalid.status).toBe(400);
    await chat.stop();
    const heldRetry: BranchRequest = {
      ...request(),
      kind: "retry",
      sourceUserEntryId: final.messages[0]?.entryId ?? "",
      sourceAssistantEntryId: final.messages[1]?.entryId ?? "",
    };
    expect(await chat.resubmit(heldRetry)).toBe(true);
    await chats.stopAll();
    const reopened = await createChat({ models, directory, folder });
    try {
      const selected = await reopened.open(final.id);
      if (selected === undefined) {
        throw new Error("The attachment branch did not reopen.");
      }
      expect(selected.getState().pending.items).toMatchObject([
        {
          attachmentIds: changed.attachmentIds,
          fileAttachmentIds: [],
          state: "held",
          branch: { kind: "retry" },
        },
      ]);
      faux.setResponses([fauxAssistantMessage("Resumed branch.")]);
      await selected.resumePending();
      await vi.waitFor(() => expect(selected.inputState(heldRetry.id)).toBe("delivered"));
      await vi.waitFor(() => expect(selected.getState().isReplying).toBe(false));
      expect(
        selected.getState().messages[0]?.attachments?.map((attachment) => attachment.id),
      ).toEqual(changed.attachmentIds);
      const state = selected.getState();
      await selected.selectBranch(
        state.messages[0]?.entryId ?? "",
        first,
        "prompt",
        state.pending.revision,
        state.leafId,
      );
      expect(
        selected
          .getState()
          .messages[0]?.attachments?.map((attachment) => [attachment.id, attachment.isFile]),
      ).toEqual(retainedForms);
    } finally {
      await reopened.stopAll();
    }
  } finally {
    await chats.stopAll();
  }
});

test("attachment-only waiting inputs remain readable without approvals after restart", async () => {
  const { chats, chat, faux, models, directory, folder } = await setup();
  const source = await chat.uploadAttachment(
    "result.txt",
    "text/plain",
    new Response("Retained result.").body,
  );
  await chat.stop();
  const input = { ...optionsFor(chat), attachmentIds: [source.id] };
  expect(await chat.send("", "literal", undefined, false, input)).toBe(true);
  await chats.stopAll();
  const reopened = await createChat({ models, directory, folder });
  const selected = await reopened.open(chat.getState().id);
  if (selected === undefined) {
    throw new Error("The attachment-only chat did not reopen.");
  }
  try {
    expect(selected.getState().pending.items).toMatchObject([
      { text: "", attachmentIds: [source.id], state: "held" },
    ]);
    expect(selected.getAgent().permissions?.savedApprovals).toHaveLength(0);
    expect(selected.attachmentSource(source.id).bytes.toString()).toBe("Retained result.");
    faux.setResponses([fauxAssistantMessage("Read the retained input.")]);
    await selected.resumePending();
    await vi.waitFor(() => expect(selected.inputState(input.id)).toBe("delivered"));
    await vi.waitFor(() => expect(selected.getState().isReplying).toBe(false));
    expect(selected.getState().messages[0]?.attachments?.[0]?.text).toBe("Retained result.");
  } finally {
    await reopened.stopAll();
  }
});

test("attachment routes bound uploads and reject missing sources and empty file input", async () => {
  const { chats, chat, models } = await setup();
  const routes = createChatRoutes(chats, models);
  const path = `/chats/${chat.getState().id}`;
  try {
    const response = await routes.request(`${path}/attachments?name=paper.pdf`, {
      method: "POST",
      headers: { "content-type": "application/pdf" },
      body: "%PDF-1.7\n",
    });
    expect(response.status).toBe(201);
    const source = (await response.json()) as { id: string };
    const content = await routes.request(`${path}/attachments/${source.id}/content`);
    expect(content.headers.get("content-disposition")).toBe(
      "attachment; filename*=UTF-8''paper.pdf",
    );
    expect(content.headers.get("x-content-type-options")).toBe("nosniff");
    expect(await content.text()).toBe("%PDF-1.7\n");
    expect((await routes.request(`${path}/attachments/${randomUUID()}`)).status).toBe(404);
    expect(
      (await routes.request(`${path}/attachments?name=../file`, { method: "POST", body: "bad" }))
        .status,
    ).toBe(400);
    expect(
      (
        await routes.request(`${path}/attachments?name=large`, {
          method: "POST",
          headers: { "content-length": String(100 * 1024 * 1024) },
          body: "small",
        })
      ).status,
    ).toBe(413);
    const missing = await routes.request(`${path}/messages`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({
        kind: "send",
        ...optionsFor(chat),
        text: "",
        attachmentIds: [randomUUID()],
      }),
    });
    expect(missing.status).toBe(404);
  } finally {
    await chats.stopAll();
  }
});

test("image limits include retained history before forwarding a request", async () => {
  const { chats, chat, faux } = await setup({ images: { maxPerRequest: 1 } });

  const source = await chat.uploadAttachment(
    "history.png",
    "image/png",
    new Response(new Uint8Array(pixel)).body,
  );
  faux.setResponses([fauxAssistantMessage("One image."), fauxAssistantMessage("Must not run.")]);
  try {
    const first = { ...optionsFor(chat), attachmentIds: [source.id] };
    expect(await chat.send("First", "literal", undefined, false, first)).toBe(true);
    await vi.waitFor(() => expect(chat.inputState(first.id)).toBe("delivered"));
    await vi.waitFor(() => expect(chat.getState().isReplying).toBe(false));
    const second = { ...optionsFor(chat), attachmentIds: [source.id] };
    expect(await chat.send("Second", "literal", undefined, false, second)).toBe(true);
    await vi.waitFor(() =>
      expect(
        chat.getState().messages.some((message) => message.error?.includes("request has 2 images")),
      ).toBe(true),
    );
    expect(faux.state.callCount).toBe(1);
  } finally {
    await chats.stopAll();
  }
});

test("steers follow the tool batch one per boundary and precede queued prompts in order", async () => {
  const { chats, chat, faux } = await setup();
  const entered = Promise.withResolvers<void>();
  const finish = Promise.withResolvers<void>();
  const observed: string[] = [];
  const stop = chat.subscribe((event) => {
    if (event.type === "toolResult") {
      observed.push("tool result");
    }
    if (event.type === "message" && event.message.role === "user") {
      observed.push(
        event.message.parts.map((part) => (part.type === "text" ? part.text : "")).join(""),
      );
    }
  });
  faux.setResponses([
    async () => {
      entered.resolve();
      await finish.promise;
      return fauxAssistantMessage([fauxToolCall("CheckCommand", { id: 1 })], {
        stopReason: "toolUse",
      });
    },
    fauxAssistantMessage("First steer answered."),
    fauxAssistantMessage("Second steer answered."),
    fauxAssistantMessage("First queued answer."),
    fauxAssistantMessage("Second queued answer."),
  ]);
  try {
    await send(chat, "Start");
    await entered.promise;
    await send(chat, "Queued first");
    await send(chat, "Queued second");
    await send(chat, "Steer first", "steer");
    await send(chat, "Steer second", "steer");
    expect(prompts(chat.getState())).toEqual(["Start"]);
    await vi.waitFor(() => expect(chat.getState().pending.items).toHaveLength(4));
    finish.resolve();
    await vi.waitFor(() => expect(chat.getState().pending.items).toHaveLength(0));
    await vi.waitFor(() => expect(chat.getState().isReplying).toBe(false));
    expect(observed).toEqual([
      "Start",
      "tool result",
      "Steer first",
      "Steer second",
      "Queued first",
      "Queued second",
    ]);
    expect(
      chat
        .getState()
        .messages.filter((message) => message.isSteered)
        .map((message) => message.parts),
    ).toHaveLength(2);
    expect(
      chat
        .getContext()
        .entries.filter(
          (entry) =>
            entry.type === "custom" &&
            (entry.data as { customType?: string }).customType === "independum-input",
        ),
    ).toHaveLength(5);
  } finally {
    finish.resolve();
    stop();
    await chats.stopAll();
  }
});

test("stop holds pending work and resume is required even for a later send", async () => {
  const { chats, chat, faux } = await setup();
  const held = holdReply(fauxAssistantMessage("Stopped."));
  faux.setResponses([
    held.receive,
    fauxAssistantMessage("Resumed."),
    fauxAssistantMessage("Later."),
  ]);
  try {
    await send(chat, "Start");
    await held.entered;
    const removable = await send(chat, "Remove me");
    expect(chat.removePending(removable.id)).toBe(true);
    await send(chat, "Resume me");
    const stopped = chat.stop();
    expect(chat.getState().pending).toMatchObject({ isPaused: true, items: [{ state: "held" }] });
    held.finish();
    await stopped;
    await send(chat, "Later send");
    expect(prompts(chat.getState())).toEqual(["Start"]);
    await chat.resumePending();
    await vi.waitFor(() =>
      expect(prompts(chat.getState())).toEqual(["Start", "Resume me", "Later send"]),
    );
    await vi.waitFor(() => expect(chat.getState().isReplying).toBe(false));
  } finally {
    held.finish();
    await chats.stopAll();
  }
});

test("input receipts survive restart and stale or conflicting submissions fail", async () => {
  const { chats, chat, models, directory, folder, faux } = await setup();
  faux.setResponses([fauxAssistantMessage("Done.")]);
  const input = await send(chat, "One input");
  await vi.waitFor(() => expect(chat.inputState(input.id)).toBe("delivered"));
  await vi.waitFor(() => expect(chat.getState().isReplying).toBe(false));
  expect(await chat.send("One input", "literal", undefined, false, input)).toBe(true);
  await expect(chat.send("Changed input", "literal", undefined, false, input)).rejects.toThrow(
    "different content",
  );
  await expect(
    chat.send("Stale input", "literal", undefined, false, { ...input, id: randomUUID() }),
  ).rejects.toThrow("chat changed");
  await chats.stopAll();
  const reopened = await createChat({ models, directory, folder });
  try {
    const selected = await reopened.open(chat.getState().id);
    expect(selected).toBeDefined();
    expect(await selected?.send("One input", "literal", undefined, false, input)).toBe(true);
    expect(prompts(selected?.getState() as ChatState)).toEqual(["One input"]);
  } finally {
    await reopened.stopAll();
  }
});

test("queued command previews preserve captured text and a restart holds them", async () => {
  const { chats, chat, models, directory, folder, faux } = await setup();
  faux.setResponses([
    fauxAssistantMessage("First answer."),
    fauxAssistantMessage("Captured answer."),
  ]);
  const initial = await send(chat, "Start");
  await vi.waitFor(() => expect(chat.inputState(initial.id)).toBe("delivered"));
  await vi.waitFor(() => expect(chat.getState().isReplying).toBe(false));
  const commands = join(folder, ".independum", "commands");
  mkdirSync(commands, { recursive: true });
  writeFileSync(join(commands, "review.md"), "---\ndescription: Review data.\n---\nCaptured $1.");
  const preview = chat.compose("/review result", "commands");
  await chat.stop();
  const input = optionsFor(chat);
  expect(await chat.send(preview.text, "commands", preview.id, false, input)).toBe(true);
  await chats.stopAll();
  writeFileSync(
    join(commands, "review.md"),
    "---\ndescription: Review data.\n---\nChanged on disk.",
  );
  const reopened = await createChat({ models, directory, folder });
  const selected = await reopened.open(chat.getState().id);
  if (selected === undefined) {
    throw new Error("The saved chat did not reopen.");
  }
  try {
    expect(selected.getState().pending.isPaused).toBe(true);
    expect(prompts(selected.getState())).toEqual(["Start"]);
    await selected.resumePending();
    await vi.waitFor(() =>
      expect(prompts(selected.getState())).toEqual(["Start", "Captured result."]),
    );
  } finally {
    await reopened.stopAll();
  }
});

test("addressed input routes validate identities and report removal conflicts", async () => {
  const { chats, chat, models, faux } = await setup();
  faux.setResponses([fauxAssistantMessage("Done.")]);
  const routes = createChatRoutes(chats, models);
  const path = `/chats/${chat.getState().id}`;
  const input = optionsFor(chat);
  const body = { ...input, kind: "send", text: "One request", interpretation: "literal" };
  async function post(value: unknown): Promise<Response> {
    return routes.request(`${path}/messages`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify(value),
    });
  }
  try {
    expect((await post({ text: "No identity" })).status).toBe(400);
    expect((await post(body)).status).toBe(202);
    expect((await post(body)).status).toBe(202);
    expect((await post({ ...body, text: "Changed" })).status).toBe(409);
    await vi.waitFor(() => expect(chat.inputState(input.id)).toBe("delivered"));
    await vi.waitFor(() => expect(chat.getState().isReplying).toBe(false));
    expect((await routes.request(`${path}/pending/${input.id}`, { method: "DELETE" })).status).toBe(
      409,
    );
    expect(
      (await routes.request(`${path}/pending/${randomUUID()}`, { method: "DELETE" })).status,
    ).toBe(404);
  } finally {
    await chats.stopAll();
  }
});

test("failed replies hold steering inputs until an explicit resume", async () => {
  const { chats, chat, faux } = await setup();
  const held = holdReply(
    fauxAssistantMessage("", { stopReason: "error", errorMessage: "Request refused." }),
  );
  faux.setResponses([held.receive, fauxAssistantMessage("Resumed.")]);
  try {
    await send(chat, "Fail this reply");
    await held.entered;
    await send(chat, "Held steer", "steer");
    held.finish();
    await vi.waitFor(() => expect(chat.getState().pending.isPaused).toBe(true));
    expect(prompts(chat.getState())).toEqual(["Fail this reply"]);
    await chat.resumePending();
    await vi.waitFor(() =>
      expect(prompts(chat.getState())).toEqual(["Fail this reply", "Held steer"]),
    );
  } finally {
    held.finish();
    await chats.stopAll();
  }
});

test("a captured model without its login holds work instead of substituting another model", async () => {
  const { chats, chat, faux, models } = await setup();
  const held = holdReply(fauxAssistantMessage("First reply."));
  faux.setResponses([held.receive, fauxAssistantMessage("Queued reply.")]);
  const available = vi.spyOn(models, "hasConfiguredAuth");
  try {
    await send(chat, "Start");
    await held.entered;
    await send(chat, "Captured choice");
    available.mockReturnValue(false);
    held.finish();
    await vi.waitFor(() => expect(chat.getState().pending.isPaused).toBe(true));
    expect(chat.getState().pending.items[0]?.reason).toContain("captured model");
    expect(prompts(chat.getState())).toEqual(["Start"]);
    available.mockRestore();
    await chat.resumePending();
    await vi.waitFor(() => expect(prompts(chat.getState())).toEqual(["Start", "Captured choice"]));
  } finally {
    available.mockRestore();
    held.finish();
    await chats.stopAll();
  }
});

test("an accepted first input can reopen, archive, and resume before pi saves a message", async () => {
  const { chats, chat, models, directory, folder, faux } = await setup();
  const input = await send(chat, "Unsent durable input");
  const id = chat.getState().id;
  await chats.stopAll();
  const reopened = await createChat({ models, directory, folder });
  try {
    const selected = await reopened.open(id);
    if (selected === undefined) {
      throw new Error("The pending chat did not reopen.");
    }
    expect(selected.inputState(input.id)).toBe("held");
    expect(prompts(selected.getState())).toEqual([]);
    expect(await reopened.rename(id, "Held first input")).toBe(true);
    expect(await reopened.archive(id, true)).toBe(true);
    expect((await reopened.getArchived()).some((chat) => chat.id === id)).toBe(true);
    expect(await reopened.archive(id, false)).toBe(true);
    const restored = await reopened.open(id);
    if (restored === undefined) {
      throw new Error("The restored pending chat did not reopen.");
    }
    expect(restored.getState().pending.isPaused).toBe(true);
    faux.setResponses([fauxAssistantMessage("Delivered.")]);
    await restored.resumePending();
    await vi.waitFor(() => expect(prompts(restored.getState())).toEqual(["Unsent durable input"]));
    await vi.waitFor(() => expect(restored.getState().isReplying).toBe(false));
    expect(await reopened.remove(id)).toBe(true);
    expect(await reopened.open(id)).toBeUndefined();
  } finally {
    await reopened.stopAll();
  }
});

test("pending inputs keep their model and later work keeps the user's newer choice", async () => {
  const { chats, chat, faux, provider } = await setup();
  const held = holdReply(fauxAssistantMessage("Original."));
  faux.setResponses([held.receive, fauxAssistantMessage("Captured.")]);
  try {
    await send(chat, "Start");
    await held.entered;
    const queued = await send(chat, "Use captured choice");
    await chat.chooseModel(provider, "second");
    expect(
      chat.getState().pending.items.find((input) => input.id === queued.id)?.model.modelId,
    ).toBe("first");
    held.finish();
    await vi.waitFor(() => expect(chat.inputState(queued.id)).toBe("delivered"));
    await vi.waitFor(() => expect(chat.getState().isReplying).toBe(false));
    await vi.waitFor(() => expect(chat.getState().model?.id).toBe("second"));
  } finally {
    held.finish();
    await chats.stopAll();
  }
});

test("delivery preferences use strict user settings and persist across restarts", async () => {
  const { chats, chat, models, directory, folder } = await setup();
  const user = chats.profiles.user();
  if (user.document === null) {
    throw new Error("The user settings did not load.");
  }
  const document = { ...user.document, messages: { whileReplying: "steer" as const } };
  validateUserSettings({ ...document, messages: {} }, "settings.json");
  for (const messages of [
    { whileReplying: "other" },
    { whileReplying: false },
    { whileReplying: "queue", extra: true },
  ]) {
    expect(() => validateUserSettings({ ...document, messages }, "settings.json")).toThrow(
      "whileReplying",
    );
  }
  await chats.profiles.putUser(document, user.revision);
  expect(chat.getState().whileReplying).toBe("steer");
  await chats.stopAll();
  const reopened = await createChat({ models, directory, folder });
  try {
    const selected = await reopened.open(await reopened.first());
    expect(selected?.getState().whileReplying).toBe("steer");
  } finally {
    await reopened.stopAll();
  }
});
