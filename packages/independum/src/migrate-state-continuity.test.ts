import { createHash, randomUUID } from "node:crypto";
import { existsSync, mkdirSync, renameSync, unlinkSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { fauxAssistantMessage, fauxProvider } from "@earendil-works/pi-ai";
import { SessionManager } from "@earendil-works/pi-coding-agent";
import { expect, test, vi } from "vitest";
import { connectHeadless, type HeadlessConnectionOptions } from "./connect-headless.ts";
import { createAttachments } from "./create-attachments.ts";
import { createChat } from "./create-chat.ts";
import { createModelRuntime } from "./create-model-runtime.ts";
import { createPhonePairings } from "./create-phone-pairings.ts";
import { createTestConnection } from "./create-test-connection.ts";
import { isMissingFile } from "./is-missing-file.ts";
import { createModelTexts } from "./model-texts.ts";
import {
  privateRuntime,
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

async function legacy() {
  const { directory: home, project } = createTestProject(parent);
  const directory = join(home, ".independum");
  const runtime = join(directory, "runtime");
  const privateFolder = privateRuntime(directory);
  writePrivateRuntimeFile(join(privateFolder, "server.json"), JSON.stringify(connection));
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
    "legacy-note.txt",
    "text/plain",
    new Response(original).body,
    builtInAttachments.maxFileBytes,
  );
  const prepared = await attachments.prepare(
    "Legacy prompt.",
    [attachment.id],
    [],
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
    fileAttachmentIds: [],
    attachments: [attachment],
    attachmentPositions: prepared.positions,
    receivesImages: false,
  });
  session.appendMessage({ role: "user", content: prepared.text, timestamp: 1000 });
  session.appendMessage(fauxAssistantMessage("Saved reply."));
  const outputFolder = join(directory, "outputs", chatId);
  mkdirSync(outputFolder, { recursive: true });
  writeFileSync(join(outputFolder, "retained.txt"), "Retained command output.");
  return { home, directory, project, runtime, oldAttachments, phone, chatId, attachment };
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
  for (const name of ["auth.json", "models.json", "server.json", "phones.json"]) {
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

test.each(["models", "phones", "discovery", "chats"])(
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
    } else if (entry === "discovery") {
      expect(await connectHeadless(options)).toEqual(connection);
    } else {
      const models = await createModelRuntime(join(home, "isolated-runtime"));
      const chats = await createChat({ models, directory, folder: project });
      await chats.stopAll();
    }
    expectMigrated(fixture);
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
  const fixture = await legacy();
  const stdout = vi.fn<(text: string) => void>();
  const stderr = vi.fn<(text: string) => void>();
  const launch = vi.fn();
  const pairing = { id: randomUUID(), name: "Upgraded phone", code: "654321" };
  const confirmPairing = vi.fn(async (code: string) => code === pairing.code);
  const paths: string[] = [];
  const request = vi.fn<typeof fetch>(async (input, initialization) => {
    expectMigrated(fixture);
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
});

test("discovery removes a moved stale record after the old server exits without finding its former path", async () => {
  const fixture = await legacy();
  const oldPath = join(fixture.runtime, "server.json");
  expect(readServer(fixture.directory)).toEqual(connection);
  let oldRecord: string | undefined;
  try {
    oldRecord = readPrivateRuntimeFile(oldPath);
  } catch (error) {
    if (!isMissingFile(error)) {
      throw error;
    }
  }
  // The running legacy server reads its former path and only unlinks a matching record on exit.
  if (oldRecord !== undefined && JSON.parse(oldRecord).serverId === connection.serverId) {
    unlinkSync(oldPath);
  }
  expect(readServer(fixture.directory)).toEqual(connection);
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
  expect(readServer(fixture.directory)).toBeUndefined();
  expect(options.launch).not.toHaveBeenCalled();
  expect(existsSync(join(fixture.directory, "private", "phones.json"))).toBe(true);
});

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
