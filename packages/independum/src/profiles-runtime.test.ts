import { randomUUID } from "node:crypto";
import { existsSync, mkdirSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { fauxAssistantMessage, fauxProvider, fauxToolCall } from "@earendil-works/pi-ai";
import { expect, test } from "vitest";
import { waitFor } from "../../../scripts/wait-for.ts";
import { addedFactTexts } from "./added-facts.ts";
import type { ProfileBundle, ProfileReference } from "./api-types.ts";
import { createChat, type OpenChat } from "./create-chat.ts";
import { createChatRoutes } from "./create-chat-routes.ts";
import { createModelRuntime } from "./create-model-runtime.ts";
import { createOperations, type Operations, type OperationView } from "./create-operations.ts";
import { builtInPermissions } from "./permission-policy.ts";
import { runHeadless } from "./run-headless.ts";
import { startAppServer } from "./start-app-server.ts";
import { createTestFolder, createTestProject } from "./tools/create-test-folder.ts";

const folder = createTestFolder("profile-runtime");
let nextId = 0;

test("headless prompts queue during a browser reply and wait through their own settlement", async () => {
  const { chats, chat, faux, directory } = await setup();
  const entered = Array.from({ length: 3 }, () => Promise.withResolvers<void>());
  const finished = Array.from({ length: 3 }, () => Promise.withResolvers<void>());
  faux.setResponses([
    ...entered.map((boundary, index) => async () => {
      boundary.resolve();
      await finished[index]?.promise;
      return index === 1
        ? fauxAssistantMessage([fauxToolCall("CheckCommand", { id: 1 })], { stopReason: "toolUse" })
        : fauxAssistantMessage(index === 0 ? "Browser answer." : "First headless answer.");
    }),
    fauxAssistantMessage("Second headless answer."),
  ]);
  const operations = createOperations(chats, directory, "headless-server");
  try {
    await chat.send("Browser prompt.");
    await entered[0]?.promise;
    const first = await submitHeadless(operations, chat, "First headless prompt.");
    const second = await operations.prompt({
      requestId: "driver-two",
      chatId: chat.getState().id,
      text: "Second headless prompt.",
    });
    expect(
      chat
        .getState()
        .pending.items.filter((input) => input.state === "waiting")
        .map((input) => input.text),
    ).toEqual(["First headless prompt.", "Second headless prompt."]);
    let hasFinished = false;
    const waiting = operations.wait(first.operationId, "fail").then((result) => {
      hasFinished = true;
      return result;
    });
    finished[0]?.resolve();
    await entered[1]?.promise;
    expect(hasFinished).toBe(false);
    expect((await operations.show(second.operationId)).status).toBe("running");
    finished[1]?.resolve();
    await entered[2]?.promise;
    expect(hasFinished).toBe(false);
    finished[2]?.resolve();
    expect(await waiting).toMatchObject({ status: "completed", text: "First headless answer." });
    expect(await operations.wait(second.operationId, "fail")).toMatchObject({
      status: "completed",
      text: "Second headless answer.",
    });
    expect(chat.getContext().submissions).toEqual([
      { operationId: first.operationId, submissionId: first.submissionId },
      { operationId: second.operationId, submissionId: second.submissionId },
    ]);
  } finally {
    for (const boundary of finished) {
      boundary.resolve();
    }
    operations.close();
    await chats.stopAll();
  }
});

test("headless waiting messages stay held after stop and support removal and explicit resume", async () => {
  const { chats, chat, faux, directory } = await setup();
  const entered = Promise.withResolvers<void>();
  const finished = Promise.withResolvers<void>();
  faux.setResponses([
    async () => {
      entered.resolve();
      await finished.promise;
      return fauxAssistantMessage("Stopped browser answer.");
    },
    fauxAssistantMessage("Resumed headless answer."),
    fauxAssistantMessage("Later headless answer."),
  ]);
  const operations = createOperations(chats, directory, "headless-server");
  try {
    await chat.send("Browser prompt.");
    await entered.promise;
    const first = await submitHeadless(operations, chat, "Waiting headless prompt.");
    const removable = await operations.prompt({
      requestId: "remove",
      chatId: chat.getState().id,
      text: "Remove this prompt.",
    });
    expect(chat.removePending(removable.submissionId)).toBe(true);
    expect(await operations.wait(removable.operationId, "fail")).toMatchObject({
      status: "cancelled",
    });
    const stopped = chat.stop();
    finished.resolve();
    await stopped;
    const later = await operations.prompt({
      requestId: "later",
      chatId: chat.getState().id,
      text: "Later headless prompt.",
    });
    expect(chat.getState().pending.items.map((input) => input.state)).toEqual(["held", "held"]);
    expect((await operations.wait(first.operationId, "fail", undefined, 1)).status).toBe("running");
    await chat.resumePending();
    expect(await operations.wait(first.operationId, "fail")).toMatchObject({
      status: "completed",
      text: "Resumed headless answer.",
    });
    expect(await operations.wait(later.operationId, "fail")).toMatchObject({
      status: "completed",
      text: "Later headless answer.",
    });
  } finally {
    finished.resolve();
    operations.close();
    await chats.stopAll();
  }
});

test("prompt and a later wait reach the listening server and its saved pi session", async () => {
  const { chats, chat, faux, directory, project, models } = await setup();
  faux.setResponses([fauxAssistantMessage("The transported answer.")]);
  const server = await startAppServer({
    chat: chats,
    models,
    directory,
    token: "private-end-to-end-test-token-that-must-not-print",
    port: 0,
    isDevelopment: false,
  });
  const output: string[] = [];
  const errors: string[] = [];
  const options = {
    directory,
    folder: project,
    stdin: async () => "",
    stdout: (text: string) => {
      output.push(text);
    },
    stderr: (text: string) => {
      errors.push(text);
    },
  };
  try {
    expect(
      await runHeadless(["prompt", "Task.", "--chat", chat.getState().id, "--no-wait"], options),
    ).toBe(0);
    const operationId = output.join("").split("\n")[1]?.slice("operation ".length) ?? "";
    output.length = 0;
    expect(await runHeadless(["wait", operationId], options)).toBe(0);
    expect(output).toEqual(["The transported answer.\n"]);
    expect(errors).toEqual([]);
  } finally {
    await server.close();
  }
});

test("headless work uses the selected profile and saves source without adding model instructions", async () => {
  const { chats, chat, faux, directory, project, reference } = await setup();
  let captured = "";
  faux.setResponses([
    (context) => {
      captured = JSON.stringify(context);
      return fauxAssistantMessage("Final headless answer.");
    },
  ]);
  const operations = createOperations(chats, directory, "headless-server");
  try {
    const browserId = chat.getState().id;
    const accepted = await operations.prompt({
      requestId: "driver-one",
      text: "  Exact headless input.\n",
      project,
      profile: reference,
    });
    const completed = await operations.wait(accepted.operationId, "fail");
    expect(completed).toMatchObject({ status: "completed", text: "Final headless answer." });
    expect(chat.getState().id).toBe(browserId);
    expect(accepted.chatId).not.toBe(browserId);
    const opened = await chats.open(accepted.chatId);
    expect(opened?.getContext().submissions).toEqual([
      { operationId: accepted.operationId, submissionId: accepted.submissionId },
    ]);
    opened?.close();
    expect(captured).toContain("The research prompt.");
    expect(captured).toContain("  Exact headless input.\\n");
    expect(captured).not.toContain(accepted.operationId);
    expect(captured).not.toContain(accepted.submissionId);
    operations.close();
    const recovered = createOperations(chats, directory, "next-server");
    expect(await recovered.show(accepted.operationId)).toMatchObject({
      status: "completed",
      text: "Final headless answer.",
    });
    recovered.close();
  } finally {
    operations.close();
    await chats.stopAll();
  }
});

test.each(["length", "aborted"] as const)(
  "headless settlement preserves the pi stop reason %s",
  async (stopReason) => {
    const { chats, chat, faux, directory } = await setup();
    faux.setResponses([fauxAssistantMessage("Partial text.", { stopReason })]);
    const operations = createOperations(chats, directory, "headless-server");
    try {
      const accepted = await submitHeadless(operations, chat, "Task.");
      expect(await operations.wait(accepted.operationId, "fail")).toMatchObject({
        status: stopReason === "length" ? "outputLimited" : "cancelled",
        text: "Partial text.",
      });
    } finally {
      operations.close();
      await chats.stopAll();
    }
  },
);

for (const onQuestion of ["fail", "wait"] as const) {
  test(`headless permissions use the shared tool result with question handling ${onQuestion}`, async (context) => {
    const { chats, chat, faux, directory, project } = await setup();
    faux.setResponses([
      fauxAssistantMessage(
        [
          fauxToolCall("Write", {
            path: join(project, "..", "outside.txt"),
            content: "Outside write.",
          }),
        ],
        { stopReason: "toolUse" },
      ),
      fauxAssistantMessage("The write needs approval."),
    ]);
    const operations = createOperations(chats, directory, "headless-server");
    try {
      const unavailable = chat.getAgent().fileSandbox?.unavailable;
      if (unavailable !== undefined && unavailable !== null) {
        context.skip(unavailable);
      }
      const accepted = await operations.prompt({
        requestId: "permission-task",
        text: "Write the requested file.",
        chatId: chat.getState().id,
        onQuestion,
      });
      if (onQuestion === "fail") {
        expect(await operations.wait(accepted.operationId, "fail")).toMatchObject({
          code: "approvalRequired",
        });
        expect(chats.approvals.pending()).toEqual([]);
      } else {
        await waitFor(() => expect(chats.approvals.pending()).toHaveLength(1));
        const question = chats.approvals.pending()[0];
        expect(await operations.wait(accepted.operationId, "fail")).toMatchObject({
          status: "waitingForInput",
          questionId: question?.id,
        });
        expect(
          await chats.approvals.resolve(question?.id ?? "", question?.revision ?? "", "deny"),
        ).toBe(200);
        expect(await operations.wait(accepted.operationId, "wait")).toMatchObject({
          status: "completed",
        });
      }
      await waitFor(() => expect(chat.getState().isReplying).toBe(false));
    } finally {
      operations.close();
      await chats.stopAll();
    }
  });
}

async function submitHeadless(
  operations: Operations,
  chat: OpenChat,
  text: string,
): Promise<OperationView> {
  return operations.prompt({ requestId: "driver-one", text, chatId: chat.getState().id });
}

test("context controls keep saved literal filenames visible while a reply waits for approval", async () => {
  const created = await setup();
  const { chats, chat, faux, reference, projectId } = created;
  await configureExternalCommand(created);
  const context = chat.getResources().settings;
  faux.setResponses([fauxAssistantMessage("Finished.")]);
  try {
    expect(await chat.send("Wait for approval", "literal", undefined, true)).toBe(true);
    await waitFor(() => expect(chats.approvals.pending()).toHaveLength(1));
    const names = [...context.instructions.names, "NOTES, CONTEXT.md"];
    await chats.changeSettings(
      reference,
      projectId,
      {
        context: {
          ...(chat.getAgent().contextSettings ?? context),
          instructions: { ...context.instructions, names },
        },
      },
      chats.profiles.profile(reference, projectId).revision,
    );
    expect(chat.getAgent().contextSettings?.instructions.names).toEqual(names);
    expect(chats.profileAgent(reference, projectId).contextSettings?.instructions.names).toEqual(
      names,
    );
    expect(
      chats.profiles.profile(reference, projectId).document?.profile.settings?.context?.instructions
        ?.names,
    ).toEqual(names);
  } finally {
    await chats.stopAll();
  }
});

test("project approvals survive restart and removing one blocks the next resource read", async () => {
  const created = await setup();
  const { chats, chat, reference, projectId, directory, project, models } = created;
  const source = await configureExternalCommand(created);
  const resource = chat.getResources().resources.find((entry) => entry.path === source);
  const waiting = chat.requestResourcePermission(resource?.id ?? "");
  const approval = chats.approvals.pending()[0];
  expect(
    await chats.approvals.resolve(approval?.id ?? "", approval?.revision ?? "", "allow", "project"),
  ).toBe(200);
  expect(await waiting).toBe(true);
  expect(chat.getResources().resources.find((entry) => entry.path === source)?.source).toBe(
    "External command.",
  );
  await chats.stopAll();
  const restarted = await createChat({ models, directory, folder: project });
  try {
    const opened = await restarted.open(await restarted.first());
    expect(opened?.getResources().resources.find((entry) => entry.path === source)?.source).toBe(
      "External command.",
    );
    const policy = opened?.getAgent().permissions;
    expect(policy?.savedApprovals).toHaveLength(1);
    expect(policy?.savedApprovals[0]).toMatchObject({
      project,
      resource: { path: source },
    });
    if (policy === undefined) {
      throw new Error("The profile needs a permission policy.");
    }
    await restarted.changeSettings(
      reference,
      projectId,
      { permissions: { ...policy, savedApprovals: [] } },
      restarted.profiles.profile(reference, projectId).revision,
    );
    expect(opened?.getResources().resources.find((entry) => entry.path === source)?.state).toBe(
      "needsPermission",
    );
    opened?.close();
  } finally {
    await restarted.stopAll();
  }
});

test.each([true, false])(
  "external context approval precedes the provider and records a decision of %s",
  async (isAllowed) => {
    const { chats, chat, faux, reference, projectId, directory } = await setup();
    const skillDirectory = join(directory, "external", "review");
    mkdirSync(skillDirectory, { recursive: true });
    const source = join(skillDirectory, "SKILL.md");
    writeFileSync(
      source,
      "---\nname: review\ndescription: Approved external metadata.\n---\nPrivate skill body.",
    );
    const settings = chat.getResources().settings;
    await chats.changeSettings(
      reference,
      projectId,
      { context: { ...settings, skills: { ...settings.skills, paths: [source] } } },
      chats.profiles.profile(reference, projectId).revision,
    );
    await requireContextApproval({ chats, chat, reference, projectId }, source);
    let request = "";
    faux.setResponses([
      (...[context]) => {
        request = JSON.stringify(context);
        return fauxAssistantMessage("Finished.");
      },
    ]);
    try {
      expect(await chat.send("Use the available catalog", "literal", undefined, true)).toBe(true);
      await waitFor(() => expect(chats.approvals.pending()).toHaveLength(1));
      expect(faux.state.callCount).toBe(0);
      expect(
        chat.getResources().resources.find((resource) => resource.path === source)?.source,
      ).toBe("");
      const approval = chat.getState().contextApprovals?.[0];
      expect(approval?.resources).toEqual([
        { kind: "path", path: source, scope: "file", access: "read" },
      ]);
      expect(
        await chats.approvals.resolve(
          approval?.id ?? "",
          approval?.revision ?? "",
          isAllowed ? "allow" : "deny",
        ),
      ).toBe(200);
      await waitFor(() => expect(chat.getState().isReplying).toBe(false));
      expect(faux.state.callCount).toBe(1);
      expect(request.includes("Approved external metadata.")).toBe(isAllowed);
      expect(request).not.toContain("Private skill body.");
      expect(chats.approvals.pending()).toHaveLength(0);
    } finally {
      await chats.stopAll();
    }
  },
);

test("stopping context preparation cancels external approvals without calling the provider", async () => {
  const { chats, chat, faux, directory, reference, projectId } = await setup();
  const commands = join(directory, "external-commands");
  mkdirSync(commands);
  const settings = chat.getResources().settings;
  await chats.changeSettings(
    reference,
    projectId,
    { context: { ...settings, slashCommands: { ...settings.slashCommands, paths: [commands] } } },
    chats.profiles.profile(reference, projectId).revision,
  );
  await requireContextApproval({ chats, chat, reference, projectId }, commands, "tree");
  try {
    expect(await chat.send("Start", "literal", undefined, true)).toBe(true);
    await waitFor(() => expect(chats.approvals.pending()).toHaveLength(1));
    await chat.stop();
    expect(chats.approvals.pending()).toHaveLength(0);
    expect(faux.state.callCount).toBe(0);
  } finally {
    await chats.stopAll();
  }
});

test("resources enter one coherent request and their off switches remove historical copies", async () => {
  const { chats, chat, faux, reference, projectId, project } = await setup();
  writeFileSync(join(project, "AGENTS.md"), "Unique project facts.");
  writeFileSync(join(project, "CLAUDE.md"), "Unique project facts.");
  const skillFolder = join(project, ".agents", "skills", "review");
  mkdirSync(skillFolder, { recursive: true });
  writeFileSync(
    join(skillFolder, "SKILL.md"),
    "---\nname: review\ndescription: Unique skill metadata.\n---\nHidden skill body.",
  );
  const requests: string[] = [];
  faux.setResponses([
    (...[context]) => {
      requests.push(JSON.stringify(context));
      return fauxAssistantMessage("First answer.");
    },
    (...[context]) => {
      requests.push(JSON.stringify(context));
      return fauxAssistantMessage("Second answer.");
    },
  ]);
  await reply(chat, "First question");
  expect(requests[0]?.match(/Unique project facts\./g)).toHaveLength(1);
  expect(requests[0]).toContain("Unique skill metadata.");
  expect(requests[0]).not.toContain("Hidden skill body.");
  expect(requests[0]).not.toContain("independum-context");
  const captured = chat.getAgent().lastContext;
  const settings = chat.getResources().settings;
  expect(
    await chats.changeSettings(
      reference,
      projectId,
      {
        context: {
          ...settings,
          instructions: { ...settings.instructions, isEnabled: false },
          skills: { ...settings.skills, isAdvertised: false },
        },
      },
      chats.profiles.profile(reference, projectId).revision,
    ),
  ).toBe(true);
  await reply(chat, "Second question");
  expect(requests[1]).not.toContain("Unique project facts.");
  expect(requests[1]).not.toContain("Unique skill metadata.");
  expect(captured?.renderedInstructions).toContain("Unique project facts.");
  await chats.stopAll();
});

test.each([false, true])(
  "invalid required instructions stop before the provider and disabling the candidate unblocks work with junction %s",
  async (isLinked) => {
    const { chats, chat, faux, reference, projectId, project } = await setup(isLinked);
    const path = join(project, "AGENTS.md");
    writeFileSync(path, Buffer.from([255]));
    const callsBefore = faux.state.callCount;
    await reply(chat, "Blocked request");
    expect(faux.state.callCount).toBe(callsBefore);
    const settings = chat.getResources().settings;
    await chats.changeSettings(
      reference,
      projectId,
      {
        context: { ...settings, instructions: { ...settings.instructions, disabledPaths: [path] } },
      },
      chats.profiles.profile(reference, projectId).revision,
    );
    faux.setResponses([fauxAssistantMessage("Unblocked.")]);
    await chat.resumePending();
    await reply(chat, "Unblocked request");
    expect(faux.state.callCount).toBe(callsBefore + 1);
    await chats.stopAll();
  },
);

test("command previews submit their captured expansion exactly once through addressed routes", async () => {
  const { chats, chat, faux, models, project } = await setup();
  const commands = join(project, ".independum", "commands");
  mkdirSync(commands, { recursive: true });
  const source = join(commands, "review.md");
  writeFileSync(source, "---\ndescription: Review data.\n---\nReview $1.");
  const preview = chat.compose('/review "the change"', "commands");
  writeFileSync(source, "---\ndescription: Review data.\n---\nChanged on disk.");
  faux.setResponses([fauxAssistantMessage("Reviewed.")]);
  const routes = createChatRoutes(chats, models);
  const path = `/chats/${chat.getState().id}/messages`;
  const state = chat.getState();
  const input = {
    kind: "send",
    id: randomUUID(),
    delivery: "queue",
    expectedRevision: state.pending.revision,
    expectedLeafId: state.leafId,
  };
  function submit(): Promise<Response> {
    return routes.request(path, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ ...input, text: "/User edited expansion", previewId: preview.id }),
    }) as Promise<Response>;
  }
  expect((await submit()).status).toBe(202);
  expect((await submit()).status).toBe(202);
  await waitFor(() =>
    expect(chat.getState().messages.filter((message) => message.role === "user")).toHaveLength(1),
  );
  expect(chat.getState().messages.find((message) => message.role === "user")?.parts).toEqual([
    { type: "text", text: "/User edited expansion" },
  ]);
  expect(JSON.stringify(chat.getContext().entries)).toContain("Review the change.");
  await chats.stopAll();
});

test("the all-compaction switch prevents manual work and removes the reserve", async () => {
  const { chats, chat, reference, projectId } = await setup();
  const settings = chat.getResources().settings;
  await chats.changeSettings(
    reference,
    projectId,
    {
      context: {
        ...settings,
        isBasePromptEnabled: false,
        pi: { disabled: [...settings.pi.disabled, "compaction"] },
      },
    },
    chats.profiles.profile(reference, projectId).revision,
  );
  expect(await chat.compact()).toBe(false);
  expect(chat.getContext().compactionReserve).toBeNull();
  expect(chat.getContext().requestParts.some((part) => part.link.kind === "systemPrompt")).toBe(
    false,
  );
  await chats.stopAll();
});

test("context routes reject malformed bodies and repeated new actions return the same destination", async () => {
  const { chats, chat, models } = await setup();
  const routes = createChatRoutes(chats, models);
  const root = `/chats/${chat.getState().id}`;
  for (const suffix of ["compose", "slash-actions", "messages"]) {
    expect(
      (
        await routes.request(`${root}/${suffix}`, {
          method: "POST",
          headers: { "content-type": "application/json" },
          body: "null",
        })
      ).status,
    ).toBe(400);
  }
  const action = chat.compose("/new", "commands");
  const first = await chat.slashAction(action.id);
  expect(first.chatId).toBeDefined();
  expect(await chat.slashAction(action.id)).toEqual(first);
  expect(
    (
      await routes.request(`${root}/compose`, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ text: "/unknown", interpretation: "commands" }),
      })
    ).status,
  ).toBe(404);
  await chats.stopAll();
});

async function setup(isLinked = true) {
  nextId += 1;
  const created = createTestProject(folder, isLinked);
  const root = created.directory;
  const directory = join(root, "state");
  mkdirSync(directory);
  const project = join(root, "project");
  const models = await createModelRuntime(directory);
  const faux = fauxProvider({
    provider: `profile-test-${nextId}`,
    models: [{ id: "model", reasoning: true }],
  });
  models.registerNativeProvider(faux.provider);
  await models.setRuntimeApiKey(faux.provider.id, "test-key");
  const chats = await createChat({ models, directory, folder: project });
  const projectId = chats.profiles.projects()[0]?.id ?? "";
  const reference: ProfileReference = { scope: "user", id: "default" };
  const profile: ProfileBundle = {
    profile: {
      formatVersion: 1,
      name: "Research",
      settings: {
        model: { providerId: faux.provider.id, modelId: "model" },
        disabledFacts: addedFactTexts.map((text) => text.id),
        compaction: { isEnabled: false, reserveTokens: 0, keepRecentTokens: 0 },
      },
    },
    systemPrompt: "The research prompt.",
    modelTexts: null,
  };
  await chats.profiles.putProfile(
    reference,
    projectId,
    profile,
    chats.profiles.profile(reference, projectId).revision,
  );
  const chat = await chats.open(await chats.first());
  if (chat === undefined) {
    throw new Error("The profile test chat did not open.");
  }
  return { chats, chat, faux, profile, reference, projectId, directory, models, project };
}

async function reply(chat: OpenChat, text: string): Promise<void> {
  const finished = Promise.withResolvers<void>();
  const stop = chat.subscribe((event) => {
    if (event.type === "replying" && !event.isReplying) {
      finished.resolve();
    }
  });
  try {
    expect(await chat.send(text)).toBe(true);
    await finished.promise;
  } finally {
    stop();
  }
}

test("independent profiles reach requests and a chat keeps its saved reference after restart", async () => {
  const { chats, chat, faux, profile, projectId, directory, models, project } = await setup();
  const other: ProfileReference = { scope: "project", id: "research" };
  await chats.profiles.putProfile(
    other,
    projectId,
    {
      ...profile,
      profile: { ...profile.profile, name: "Other research" },
      systemPrompt: "The other prompt.",
    },
    "*",
  );
  const original: string[] = [];
  faux.setResponses([
    (context) => {
      original.push(JSON.stringify(context));
      return fauxAssistantMessage("First answer.");
    },
  ]);
  await reply(chat, "First question");
  await chats.profiles.putProject(
    projectId,
    { formatVersion: 1, profile: other },
    chats.profiles.project(projectId).revision,
  );
  const nextId = await chats.startNew(chat.getState().id);
  const next = nextId === undefined ? undefined : await chats.open(nextId);
  if (next === undefined) {
    throw new Error("The other profile chat did not open.");
  }
  faux.setResponses([
    (context) => {
      original.push(JSON.stringify(context));
      return fauxAssistantMessage("Other answer.");
    },
  ]);
  await reply(next, "Other question");
  expect(original[0]).toContain("The research prompt.");
  expect(original[0]).not.toContain("The other prompt.");
  expect(original[1]).toContain("The other prompt.");
  expect(original[0]).not.toContain("profiles\\");
  expect(original[0]).not.toContain("independum-profile");
  expect(chat.getAgent().configuration?.profile.reference.scope).toBe("user");
  await chats.stopAll();
  const restarted = await createChat({ models, directory, folder: project });
  try {
    const restored = await restarted.open(chat.getState().id);
    expect(restored?.getAgent().configuration?.profile.reference).toEqual({
      scope: "user",
      id: "default",
    });
    expect(restored?.getState().model?.id).toBe("model");
  } finally {
    await restarted.stopAll();
  }
});

test("a profile edit stays pending for every turn and tool result until the reply settles", async () => {
  const { chats, chat, faux, profile, reference, projectId, project } = await setup();
  const entered = Promise.withResolvers<void>();
  const release = Promise.withResolvers<void>();
  const requests: string[] = [];
  faux.setResponses([
    async (context) => {
      requests.push(JSON.stringify(context));
      entered.resolve();
      await release.promise;
      return fauxAssistantMessage([fauxToolCall("Read", { path: "missing-profile-file" })], {
        stopReason: "toolUse",
      });
    },
    (context) => {
      requests.push(JSON.stringify(context));
      return fauxAssistantMessage("Finished.");
    },
  ]);
  const finished = reply(chat, "Hold this reply");
  await entered.promise;
  const path = chats.profiles.profile(reference, projectId).path;
  writeFileSync(join(path, "SYSTEM.md"), "The edited prompt.");
  writeFileSync(
    join(path, "model-texts.json"),
    JSON.stringify({
      formatVersion: 1,
      texts: { "read.description": { text: "The edited Read declaration." } },
    }),
  );
  await chats.reconcile();
  expect(chat.getAgent().configuration?.pendingRevision).not.toBeNull();
  expect(chat.getAgent().systemPrompt).toBe(profile.systemPrompt);
  release.resolve();
  await finished;
  expect(requests).toHaveLength(2);
  for (const request of requests) {
    expect(request).not.toContain("The edited prompt.");
    expect(request).not.toContain("The edited Read declaration.");
  }
  await chats.reconcile();
  expect(chat.getAgent().systemPrompt).toBe("The edited prompt.");
  faux.setResponses([
    (context) => {
      requests.push(JSON.stringify(context));
      return fauxAssistantMessage("New setup.");
    },
  ]);
  await reply(chat, "Use the edited setup");
  expect(requests[2]).toContain("The edited prompt.");
  expect(requests[2]).toContain("The edited Read declaration.");
  expect(chats.profiles.resolve(chat.getState().id, project).issues).toEqual([]);
  await chats.stopAll();
});

test("invalid external files block dependent work and preserve the last applied setup", async () => {
  const { chats, chat, faux, reference, projectId } = await setup();
  const path = join(chats.profiles.profile(reference, projectId).path, "profile.json");
  writeFileSync(path, '{"formatVersion":1,"name":"Broken","settings":{"shell":"fish"}}');
  expect(await chat.send("Do not start")).toBe(false);
  expect(await chat.compact()).toBe(false);
  expect(faux.state.callCount).toBe(0);
  expect(chat.getAgent().systemPrompt).toBe("The research prompt.");
  expect(chat.getAgent().configuration?.issues[0]?.pointer).toBe("/settings/shell");
  await chats.stopAll();
});

test("configuration routes enforce strict json and conditional saves", async () => {
  const { chats, chat, models, profile, projectId } = await setup();
  const routes = createChatRoutes(chats, models);
  const path = `/profiles/user/default?projectId=${projectId}`;
  const current = await routes.request(path);
  const revision = current.headers.get("etag") ?? "";
  function put(body: string, expected?: string): Promise<Response> {
    return Promise.resolve(
      routes.request(path, {
        method: "PUT",
        body,
        headers: {
          "content-type": "application/json",
          ...(expected === undefined ? {} : { "If-Match": expected }),
        },
      }),
    );
  }
  expect((await put(JSON.stringify(profile))).status).toBe(428);
  expect(
    (
      await put(
        '{"profile":{"formatVersion":1,"name":"First","name":"Second"},"systemPrompt":null,"modelTexts":null}',
        revision,
      )
    ).status,
  ).toBe(400);
  const invalid = await put(
    JSON.stringify({
      ...profile,
      profile: { ...profile.profile, settings: { outputLimits: { maxLines: 1, maxBytes: 5000 } } },
    }),
    revision,
  );
  expect(invalid.status).toBe(422);
  expect(await invalid.json()).toMatchObject({
    issues: [
      {
        pointer: "/settings/outputLimits/maxLines",
        message: "Expected an integer from 10 through 1000000.",
      },
    ],
  });
  expect(
    (await put(JSON.stringify({ ...profile, systemPrompt: "Changed." }), revision)).status,
  ).toBe(200);
  expect((await put(JSON.stringify(profile), revision)).status).toBe(412);
  const legacy = await routes.request("/settings", {
    method: "PUT",
    headers: { "content-type": "application/json" },
    body: '{"shell":"bash"}',
  });
  expect(legacy.status).toBe(422);
  expect(chat.getAgent().systemPrompt).toBe("Changed.");
  await chats.stopAll();
});

test("switching a chat profile clears explicit choices and resolves the new effort", async () => {
  const { chats, chat, models, faux, profile, projectId } = await setup();
  await chat.chooseModel(faux.provider.id, "model");
  await chat.chooseThinking("high");
  const other: ProfileReference = { scope: "user", id: "other" };
  await chats.profiles.putProfile(
    other,
    projectId,
    {
      ...profile,
      profile: {
        ...profile.profile,
        name: "Other",
        settings: { ...profile.profile.settings, thinkingLevel: "low" },
      },
    },
    "*",
  );
  const choices = chats.profiles.choices(chat.getState().id);
  expect(choices.document?.overrides?.thinkingLevel).toBe("high");
  const routes = createChatRoutes(chats, models);
  const response = await routes.request(`/chats/${chat.getState().id}/settings`, {
    method: "PUT",
    headers: { "content-type": "application/json", "If-Match": choices.revision },
    body: JSON.stringify({
      formatVersion: 1,
      profile: other,
      overrides: { thinkingLevel: "high" },
    }),
  });
  expect(response.status).toBe(200);
  expect(chats.profiles.choices(chat.getState().id).document?.overrides).toBeUndefined();
  expect(chat.getState().thinking?.level).toBe("low");
  await chats.stopAll();
});

test("an empty system file removes the owned preamble and disabled tools from the request", async () => {
  const { chats, chat, faux, profile, reference, projectId } = await setup();
  await chats.profiles.putProfile(
    reference,
    projectId,
    {
      ...profile,
      systemPrompt: "",
      profile: {
        ...profile.profile,
        settings: { ...profile.profile.settings, disabledTools: ["Read"] },
      },
    },
    chats.profiles.profile(reference, projectId).revision,
  );
  let request = "";
  faux.setResponses([
    (context) => {
      request = JSON.stringify(context);
      return fauxAssistantMessage("Empty prompt received.");
    },
  ]);
  await reply(chat, "Inspect the setup");
  expect(request).not.toContain("The research prompt.");
  expect(request).not.toContain("You are an agent working");
  expect(request).not.toContain("coding assistant");
  expect(request).not.toContain('"name":"Read"');
  expect(request).toContain('"name":"Write"');
  await chats.stopAll();
});

// Pi converts the arguments of each call to the types of its schema before the tool runs, and the
// permission gate converts them again, so the tool acts on values that the model never sent.
test.fails.each([
  ["Write", { path: "number.txt", content: 42 }],
  ["Read", { path: "lines.txt", offset: "2" }],
  ["Read", { path: "lines.txt", limit: null }],
] as const)(
  "a %s call fails without effects when its arguments differ from its schema %j",
  async (name, input) => {
    const { chats, chat, faux, reference, projectId, project } = await setup();
    await chats.changeSettings(
      reference,
      projectId,
      { permissions: { ...builtInPermissions, mode: "unrestricted" } },
      chats.profiles.profile(reference, projectId).revision,
    );
    writeFileSync(join(project, "lines.txt"), "first\nsecond\n");
    const results: unknown[] = [];
    faux.setResponses([
      fauxAssistantMessage([fauxToolCall(name, input)], { stopReason: "toolUse" }),
      (context) => {
        results.push(...context.messages.filter((message) => message.role === "toolResult"));
        return fauxAssistantMessage("Done.");
      },
    ]);
    try {
      await reply(chat, "Use the tool.");
      expect(existsSync(join(project, "number.txt"))).toBe(false);
      expect(results).toMatchObject([{ toolName: name, isError: true }]);
    } finally {
      await chats.stopAll();
    }
  },
);

async function configureExternalCommand({
  chats,
  chat,
  directory,
  reference,
  projectId,
}: Awaited<ReturnType<typeof setup>>): Promise<string> {
  const source = join(directory, "outside.md");
  writeFileSync(source, "External command.");
  const context = chat.getResources().settings;
  await chats.changeSettings(
    reference,
    projectId,
    { context: { ...context, slashCommands: { ...context.slashCommands, paths: [source] } } },
    chats.profiles.profile(reference, projectId).revision,
  );
  await requireContextApproval({ chats, chat, reference, projectId }, source);
  return source;
}

async function requireContextApproval(
  {
    chats,
    chat,
    reference,
    projectId,
  }: Pick<Awaited<ReturnType<typeof setup>>, "chats" | "chat" | "reference" | "projectId">,
  path: string,
  scope: "file" | "tree" = "file",
): Promise<void> {
  await chats.changeSettings(
    reference,
    projectId,
    {
      permissions: {
        ...(chat.getAgent().permissions ?? builtInPermissions),
        rules: [
          {
            id: "ask-context",
            project: "*",
            effect: "ask",
            resource: { kind: "path", path, scope, access: "read" },
          },
        ],
      },
    },
    chats.profiles.profile(reference, projectId).revision,
  );
}
