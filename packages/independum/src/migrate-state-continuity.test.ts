import { createHash, randomUUID } from "node:crypto";
import {
  existsSync,
  mkdirSync,
  readFileSync,
  renameSync,
  unlinkSync,
  writeFileSync,
} from "node:fs";
import { join } from "node:path";
import { fauxAssistantMessage, fauxProvider } from "@earendil-works/pi-ai";
import { SessionManager } from "@earendil-works/pi-coding-agent";
import { expect, test, vi } from "vitest";
import { waitFor } from "../../../scripts/wait-for.ts";
import { connectHeadless, type HeadlessConnectionOptions } from "./connect-headless.ts";
import { createAttachments } from "./create-attachments.ts";
import { createChat } from "./create-chat.ts";
import { createModelRuntime } from "./create-model-runtime.ts";
import { createPhonePairings } from "./create-phone-pairings.ts";
import { createTestConnection } from "./create-test-connection.ts";
import { createModelTexts } from "./model-texts.ts";
import {
  privateRuntime,
  publishServer,
  readPrivateRuntimeFile,
  readServer,
  writePrivateRuntimeFile,
} from "./private-runtime.ts";
import { builtInAttachments } from "./read-attachment-settings.ts";
import { runHeadless } from "./run-headless.ts";
import { createTestFolder, createTestProject } from "./tools/create-test-folder.ts";

const parent = createTestFolder("state-continuity");
const connection = createTestConnection();
const providerId = "migration-fixture";
const modelId = "legacy-model";
const loginKey = "placeholder-login-created-only-for-migration-tests";
const phoneCredential = "placeholder-phone-created-only-for-migration-tests";
const original = "Original attachment.\r\nSecond line.\n";

async function legacy(hasServer = false, isFile = false, isBinary = false) {
  const { directory: home, project } = createTestProject(parent);
  const directory = join(home, ".independum");
  const runtime = join(directory, "runtime");
  const privateFolder = privateRuntime(directory);
  if (hasServer) {
    writePrivateRuntimeFile(join(privateFolder, "server.json"), JSON.stringify(connection));
  }
  const phone = { id: randomUUID(), name: "Existing phone", pairedAt: 1000, lastSeenAt: 1000 };
  writePrivateRuntimeFile(
    join(privateFolder, "phones.json"),
    JSON.stringify([
      { ...phone, credentialHash: createHash("sha256").update(phoneCredential).digest("hex") },
    ]),
  );
  renameSync(privateFolder, runtime);
  writeFileSync(
    join(directory, "auth.json"),
    JSON.stringify({ [providerId]: { type: "api_key", key: loginKey } }),
    { mode: 0o600 },
  );
  writeFileSync(
    join(directory, "models.json"),
    JSON.stringify({
      providers: {
        [providerId]: {
          name: "Legacy fixture provider",
          api: "openai-completions",
          baseUrl: "http://127.0.0.1:1/never-requested",
          models: [
            { id: modelId, name: "Legacy fixture model", contextWindow: 12345, maxTokens: 678 },
          ],
        },
      },
    }),
    { mode: 0o600 },
  );
  const sessionDirectory = join(directory, "sessions");
  mkdirSync(sessionDirectory);
  const session = SessionManager.create(project, sessionDirectory);
  const chatId = session.getSessionId();
  const oldAttachments = join(home, ".independum-attachments");
  const attachments = createAttachments(oldAttachments);
  const attachment = await attachments.upload(
    chatId,
    isBinary ? "legacy-file.pdf" : "legacy-note.txt",
    isBinary ? "application/pdf" : "text/plain",
    new Response(isBinary ? "%PDF-fixture" : original).body,
    builtInAttachments.maxFileBytes,
  );
  const prepared = await attachments.prepare(
    "Legacy prompt.",
    [attachment.id],
    isFile ? [attachment.id] : [],
    chatId,
    builtInAttachments,
    createModelTexts(() => ({})),
    fauxProvider().getModel(),
  );
  session.appendModelChange(providerId, modelId);
  session.appendCustomEntry("independum-input", {
    version: 1,
    inputId: randomUUID(),
    delivery: "queue",
    isSteered: false,
    text: "Legacy prompt.",
    attachmentIds: [attachment.id],
    fileAttachmentIds: isFile ? [attachment.id] : [],
    attachments: [attachment],
    attachmentPositions: prepared.positions,
    receivesImages: false,
  });
  session.appendMessage({ role: "user", content: prepared.text, timestamp: 1000 });
  session.appendMessage(fauxAssistantMessage("Saved reply."));
  const outputFolder = join(directory, "outputs", chatId);
  mkdirSync(outputFolder, { recursive: true });
  writeFileSync(join(outputFolder, "retained.txt"), "Retained command output.");
  return { home, directory, project, runtime, oldAttachments, phone, chatId, attachment, session };
}

function expectMigrated(fixture: Awaited<ReturnType<typeof legacy>>): void {
  const { directory, runtime, oldAttachments, attachment } = fixture;
  for (const source of [
    runtime,
    oldAttachments,
    ...["auth.json", "models.json"].map((name) => join(directory, name)),
  ]) {
    expect(existsSync(source)).toBe(false);
  }
  for (const name of ["auth.json", "models.json", "phones.json"]) {
    expect(existsSync(join(directory, "private", name))).toBe(true);
  }
  expect(existsSync(join(directory, "attachments", attachment.id, "content"))).toBe(true);
}

function discovery(fixture: Awaited<ReturnType<typeof legacy>>, request: typeof fetch) {
  const options: HeadlessConnectionOptions = {
    directory: fixture.directory,
    request,
    start: "never",
    launch: vi.fn<() => void>(),
    folder: fixture.project,
    signal: new AbortController().signal,
  };
  return options;
}

test.each(["models", "phones", "chats"])(
  "%s entry migrates the complete legacy home before consumers load retained state",
  async (entry) => {
    const fixture = await legacy();
    const { directory, project, phone, chatId, attachment, home } = fixture;
    const request = vi.fn<typeof fetch>(async () => {
      expectMigrated(fixture);
      return Response.json({ status: "ok", serverId: connection.serverId, protocolVersion: 1 });
    });
    const options = discovery(fixture, request);
    if (entry === "models") {
      await createModelRuntime(directory);
    } else if (entry === "phones") {
      expect(createPhonePairings(directory, () => 2000).authenticate(phoneCredential)?.id).toBe(
        phone.id,
      );
    } else {
      const models = await createModelRuntime(join(home, "isolated-runtime"));
      const chats = await createChat({ models, directory, folder: project });
      await chats.stopAll();
    }
    expectMigrated(fixture);
    writePrivateRuntimeFile(join(directory, "private", "server.json"), JSON.stringify(connection));
    for (const now of [3000, 4000]) {
      const models = await createModelRuntime(directory);
      expect(models.getError()).toBeUndefined();
      expect(await models.checkAuth(providerId)).toMatchObject({
        type: "api_key",
        source: "stored credential",
      });
      expect((await models.getAuth(providerId))?.auth.apiKey).toBe(loginKey);
      expect(models.getModel(providerId, modelId)).toMatchObject({
        name: "Legacy fixture model",
        contextWindow: 12345,
        maxTokens: 678,
      });
      expect((await models.getAvailable(providerId)).map((model) => model.id)).toContain(modelId);
      expect(createPhonePairings(directory, () => now).authenticate(phoneCredential)).toEqual({
        ...phone,
        lastSeenAt: now,
      });
      expect(await connectHeadless(options)).toEqual(connection);
      const chats = await createChat({ models, directory, folder: project });
      try {
        const chat = await chats.open(chatId);
        expect(chat).toBeDefined();
        expect(chat?.attachmentSource(attachment.id).path).toBe(
          join(directory, "attachments", attachment.id, "content"),
        );
        expect(chat?.attachmentSource(attachment.id).bytes.toString()).toBe(original);
        expect(chat?.getState().messages[0]?.attachments?.[0]).toMatchObject({
          id: attachment.id,
          text: original,
        });
        expect(chat?.getState().messages[1]?.parts).toMatchObject([
          { type: "text", text: "Saved reply." },
        ]);
      } finally {
        await chats.stopAll();
      }
    }
  },
);

test.each([
  ["server", "status"],
  ["server", "stop"],
  ["phone", "pair"],
  ["prompt", "Task.", "--start", "never"],
  ["wait", "operation-one", "--start", "never"],
  ["server", "start", "--start", "never"],
])("legacy server discovery works for command %j", async (...argumentsList) => {
  const fixture = await legacy(true);
  const stdout = vi.fn<(text: string) => void>();
  const stderr = vi.fn<(text: string) => void>();
  const launch = vi.fn();
  const pairing = { id: randomUUID(), name: "Upgraded phone", code: "654321" };
  const confirmPairing = vi.fn(async (code: string) => code === pairing.code);
  const paths: string[] = [];
  const request = vi.fn<typeof fetch>(async (input, initialization) => {
    expect(existsSync(fixture.runtime)).toBe(true);
    expect(existsSync(join(fixture.directory, "private"))).toBe(false);
    const phonePath = join(fixture.runtime, "phones.json");
    const phones = JSON.parse(readPrivateRuntimeFile(phonePath) ?? "[]");
    phones[0].lastSeenAt += 1;
    writePrivateRuntimeFile(phonePath, JSON.stringify(phones));
    expect(initialization?.headers).toMatchObject({
      authorization: `Bearer ${connection.accessToken}`,
    });
    const path = new URL(String(input)).pathname;
    paths.push(path);
    if (path === "/api/health") {
      return Response.json({ status: "ok", serverId: connection.serverId, protocolVersion: 1 });
    }
    if (path === "/api/phone-access/invitation") {
      const invitation = {
        id: pairing.id,
        expiresAt: Date.now() + 120000,
        url: "https://phone.invalid/#pair=fixture",
      };
      return Response.json(invitation);
    }
    if (path === "/api/phone-access") {
      return Response.json({ pairing });
    }
    if (path === "/api/server/stop" || path === "/api/phone-access/approve") {
      return new Response(null, { status: 204 });
    }
    return Response.json({
      chatId: fixture.chatId,
      operationId: "operation-one",
      status: "completed",
      text: "Final answer.",
    });
  });
  expect(
    await runHeadless(argumentsList, {
      directory: fixture.directory,
      folder: fixture.project,
      request,
      launch,
      confirmPairing,
      stdin: async () => "",
      stdout,
      stderr,
    }),
  ).toBe(0);
  expect(launch).not.toHaveBeenCalled();
  expect(stderr).not.toHaveBeenCalled();
  expect(stdout.mock.calls.flat().join("")).not.toContain(connection.accessToken);
  expect(paths[0]).toBe("/api/health");
  const command = argumentsList[0];
  expect(paths).toContain(
    command === "phone"
      ? "/api/phone-access/approve"
      : command === "prompt"
        ? "/api/prompt"
        : command === "wait"
          ? "/api/operations/operation-one"
          : argumentsList[1] === "stop"
            ? "/api/server/stop"
            : "/api/health",
  );
  expect(
    JSON.parse(readPrivateRuntimeFile(join(fixture.runtime, "phones.json")) ?? "[]")[0],
  ).toMatchObject({ ...fixture.phone, lastSeenAt: fixture.phone.lastSeenAt + paths.length });
  expect(() => privateRuntime(fixture.directory)).toThrow("legacy server record must be checked");
});

test("a legacy server removes its own record before the next startup migrates", async () => {
  const fixture = await legacy(true);
  const oldPath = join(fixture.runtime, "server.json");
  expect(readServer(fixture.directory)).toEqual(connection);
  const oldRecord = readPrivateRuntimeFile(oldPath);
  if (oldRecord !== undefined && JSON.parse(oldRecord).serverId === connection.serverId) {
    unlinkSync(oldPath);
  }
  privateRuntime(fixture.directory);
  expectMigrated(fixture);
  expect(readServer(fixture.directory)).toBeUndefined();
});

test("discovery clears a refused legacy record even when its recorded process is alive", async () => {
  const fixture = await legacy(true);
  expect(connection.pid).toBe(process.pid);
  const options = discovery(
    fixture,
    vi.fn(async () => {
      throw new TypeError("Connection refused.", { cause: { code: "ECONNREFUSED" } });
    }),
  );
  await expect(connectHeadless(options)).rejects.toMatchObject({
    code: "serverMissing",
    exitCode: 5,
  });
  expect(existsSync(join(fixture.runtime, "server.json"))).toBe(false);
  expect(existsSync(join(fixture.runtime, "phones.json"))).toBe(true);
  expect(options.launch).not.toHaveBeenCalled();
  privateRuntime(fixture.directory);
  expectMigrated(fixture);
  expect(existsSync(join(fixture.directory, "private", "phones.json"))).toBe(true);
});

test("automatic start migrates a refused legacy runtime before opening replacement services", async () => {
  const fixture = await legacy(true);
  let isStarted = false;
  let unpublish: (() => void) | undefined;
  const options = discovery(
    fixture,
    vi.fn(async () => {
      if (!isStarted) {
        throw new TypeError("Connection refused.", { cause: { code: "ECONNREFUSED" } });
      }
      return Response.json({ status: "ok", serverId: connection.serverId, protocolVersion: 1 });
    }),
  );
  options.start = "auto";
  options.launch = vi.fn(() => {
    privateRuntime(fixture.directory);
    expectMigrated(fixture);
    expect(
      createPhonePairings(fixture.directory, () => 5000).authenticate(phoneCredential),
    ).toEqual({ ...fixture.phone, lastSeenAt: 5000 });
    unpublish = publishServer(fixture.directory, connection);
    isStarted = true;
  });
  try {
    expect(await connectHeadless(options)).toEqual(connection);
    expect(options.launch).toHaveBeenCalledOnce();
  } finally {
    unpublish?.();
  }
});

test.each(["authentication", "protocol", "timeout"])(
  "discovery preserves legacy paths after a %s failure",
  async (failure) => {
    const fixture = await legacy(true);
    const options = discovery(
      fixture,
      vi.fn(async () => {
        if (failure === "timeout") {
          throw new DOMException("Timed out.", "TimeoutError");
        }
        return failure === "authentication"
          ? new Response(null, { status: 401 })
          : Response.json({ status: "ok", serverId: "another-server", protocolVersion: 1 });
      }),
    );
    await expect(connectHeadless(options)).rejects.toBeDefined();
    expect(readServer(fixture.directory)).toEqual(connection);
    expect(existsSync(join(fixture.runtime, "phones.json"))).toBe(true);
    expect(existsSync(fixture.oldAttachments)).toBe(true);
    expect(existsSync(join(fixture.directory, "private"))).toBe(false);
    expect(options.launch).not.toHaveBeenCalled();
  },
);

test("discovery refuses a legacy collision before reading or contacting the server", async () => {
  const fixture = await legacy();
  const destination = join(fixture.directory, "attachments");
  mkdirSync(destination);
  const request = vi.fn<typeof fetch>();
  const options = discovery(fixture, request);
  await expect(connectHeadless(options)).rejects.toMatchObject({
    code: "privateRecordDenied",
    exitCode: 4,
    message: expect.stringContaining(`both "${fixture.oldAttachments}" and "${destination}" exist`),
  });
  expect(request).not.toHaveBeenCalled();
  expect(options.launch).not.toHaveBeenCalled();
  expect(existsSync(fixture.runtime)).toBe(true);
  expect(existsSync(fixture.oldAttachments)).toBe(true);
  expect(existsSync(join(fixture.directory, "private"))).toBe(false);
});

test.each([false, true])(
  "saved legacy attachment file choice %s projects the moved path",
  async (isBinary) => {
    const fixture = await legacy(false, !isBinary, isBinary);
    const { directory, project, chatId, attachment, session, oldAttachments } = fixture;
    const sessionPath = session.getSessionFile() ?? "";
    const saved = readFileSync(sessionPath, "utf8");
    const canonical = session.getEntries();
    const oldPath = join(oldAttachments, attachment.id, "content");
    const newPath = join(directory, "attachments", attachment.id, "content");
    const expected = JSON.stringify(JSON.stringify(newPath)).slice(1, -1);
    const obsolete = JSON.stringify(JSON.stringify(oldPath)).slice(1, -1);
    const models = await createModelRuntime(directory);
    const projectionProvider = `projection-${randomUUID()}`;
    const faux = fauxProvider({ provider: projectionProvider, models: [{ id: modelId }] });
    let providerMessages = "";
    faux.setResponses([
      async (context, options, _state, model) => {
        providerMessages = JSON.stringify(context.messages);
        await options?.onPayload?.({ messages: context.messages }, model);
        return fauxAssistantMessage("Continued saved chat.");
      },
    ]);
    models.registerNativeProvider(faux.provider);
    await models.setRuntimeApiKey(projectionProvider, "test-key");
    const chats = await createChat({ models, directory, folder: project });
    try {
      const chat = await chats.open(chatId);
      if (chat === undefined) {
        throw new Error("The saved attachment chat did not open.");
      }
      expect(readFileSync(sessionPath, "utf8").startsWith(saved)).toBe(true);
      expect(existsSync(oldPath)).toBe(false);
      expect(existsSync(newPath)).toBe(true);
      expect(await chat.chooseModel(projectionProvider, modelId)).toBe(true);
      expect(await chat.send("Continue.", "literal")).toBe(true);
      await waitFor(() => expect(providerMessages).toContain(expected));
      await waitFor(() => expect(chat.getState().isReplying).toBe(false));
      expect(providerMessages).toContain(expected);
      expect(providerMessages).not.toContain(obsolete);
      const inspected = JSON.stringify(chat.getContext().lastRequest);
      expect(inspected).toContain(expected);
      expect(inspected).not.toContain(obsolete);
      expect(readFileSync(sessionPath, "utf8").startsWith(saved)).toBe(true);
      expect(SessionManager.open(sessionPath).getEntries().slice(0, canonical.length)).toEqual(
        canonical,
      );
    } finally {
      await chats.stopAll();
    }
  },
);
