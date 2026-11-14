import { mkdirSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import {
  type Context,
  fauxAssistantMessage,
  fauxProvider,
  fauxToolCall,
} from "@earendil-works/pi-ai";
import { expect, type TestContext, test } from "vitest";
import { waitFor } from "../../../scripts/wait-for.ts";
import type { ProfileDocument } from "./api-types.ts";
import { commandEnvironment } from "./command-environment.ts";
import { createChat, type OpenChat } from "./create-chat.ts";
import { createModelRuntime } from "./create-model-runtime.ts";
import {
  captureSandbox,
  sandboxCommand,
  sandboxRequest,
  sandboxRuntime,
} from "./create-sandbox.ts";
import { skipUnavailableSandbox } from "./skip-unavailable-sandbox.ts";
import { createTestFolder, createTestProject } from "./tools/create-test-folder.ts";

// These chats run their tools and hooks in the native sandbox of project mode, so this file belongs
// to the serial native group, and each test skips where the sandbox is unavailable.
const parent = createTestFolder("sandbox-runtime");

async function openSandboxedChat(
  testContext: TestContext,
  settings: ProfileDocument["settings"],
): Promise<{
  chat: OpenChat;
  state: string;
  reply(
    text: string,
    ...steps: ((context: Context) => ReturnType<typeof fauxToolCall> | undefined)[]
  ): Promise<void>;
}> {
  const { directory, project } = createTestProject(parent);
  const home = join(directory, "home");
  mkdirSync(home);
  const faux = fauxProvider({
    provider: `sandbox-${testContext.task.id}`,
    models: [{ id: "model" }],
  });
  const models = await createModelRuntime(home);
  const environment = commandEnvironment("minimal", {});
  const runtime = sandboxRuntime(process.execPath, "minimal", Object.keys(environment));
  if (runtime.unavailable !== null) {
    testContext.skip(runtime.unavailable);
  }
  let preflight: Awaited<ReturnType<typeof captureSandbox>>;
  try {
    preflight = await captureSandbox(
      sandboxRequest(
        {
          runtime,
          paths: [{ kind: "path", path: project, scope: "tree", access: "write" }],
          deniedPaths: [join(home, "private")],
          network: false,
        },
        sandboxCommand(process.execPath, ["-e", 'process.stdout.write("ready")']),
        project,
        environment,
      ),
    );
  } catch (error) {
    skipUnavailableSandbox(testContext, error);
  }
  if (
    preflight.exitCode !== 0 &&
    /bwrap:.*(namespace|permitted|permission|sandbox)/is.test(preflight.error)
  ) {
    testContext.skip(`Nested bubblewrap setup fails: ${preflight.error}`);
  }
  expect(preflight).toMatchObject({ output: "ready", exitCode: 0 });
  models.registerNativeProvider(faux.provider);
  await models.setRuntimeApiKey(faux.provider.id, "test-key");
  const chats = await createChat({ models, directory: home, folder: project });
  testContext.onTestFinished(() => chats.stopAll());
  const reference = { scope: "user", id: "default" } as const;
  const projectId = chats.profiles.projects()[0]?.id ?? "";
  const { revision } = chats.profiles.profile(reference, projectId);
  const profile: ProfileDocument = {
    formatVersion: 1,
    name: "Sandboxed",
    settings: {
      model: { providerId: faux.provider.id, modelId: "model" },
      compaction: { isEnabled: false, reserveTokens: 0, keepRecentTokens: 0 },
      disabledFacts: ["facts.messageTime"],
      ...settings,
    },
  };
  await chats.profiles.putProfile(
    reference,
    projectId,
    { profile, systemPrompt: "Sandboxed prompt.", modelTexts: null },
    revision,
  );
  const chat = await chats.open(await chats.first());
  if (chat === undefined) {
    throw new Error("The sandboxed test chat did not open.");
  }
  for (const runtime of [chat.getAgent().sandbox, chat.getAgent().fileSandbox]) {
    if (runtime?.unavailable !== undefined && runtime.unavailable !== null) {
      testContext.skip(runtime.unavailable);
    }
  }
  return {
    chat,
    state: home,
    async reply(text, ...steps) {
      const answered = Promise.withResolvers<void>();
      faux.setResponses(
        steps.map((step) => (context: Context) => {
          const call = step(context);
          if (call !== undefined) {
            return fauxAssistantMessage([call], { stopReason: "toolUse" });
          }
          answered.resolve();
          return fauxAssistantMessage("Done.");
        }),
      );
      expect(await chat.send(text, "literal")).toBe(true);
      await answered.promise;
      await waitFor(() => expect(chat.getState().isReplying).toBe(false));
    },
  };
}

function lastResult(context: Context): { isError: boolean; text: string } {
  const result = context.messages.findLast((message) => message.role === "toolResult");
  return {
    isError: result?.isError === true,
    text: (result?.content ?? [])
      .map((block) => (block.type === "text" ? block.text : ""))
      .join(""),
  };
}

test("the model reads the cut middle of a command output through its own tools", async (testContext) => {
  const { reply } = await openSandboxedChat(testContext, {
    outputLimits: { maxLines: 10, maxBytes: 51_200 },
  });
  const command =
    process.platform === "win32"
      ? '1..30 | ForEach-Object { "line $_" }'
      : 'for line in $(seq 1 30); do echo "line $line"; done';
  let cut = "";
  let read: ReturnType<typeof lastResult> | undefined;
  await reply(
    "Run the command and read line 15.",
    () => fauxToolCall("Shell", { command }),
    (context) => {
      cut = lastResult(context).text;
      const path = /The whole output is in (.+)\]$/m.exec(cut)?.[1] ?? "";
      return fauxToolCall("Read", { path, offset: 15, limit: 1 });
    },
    (context) => {
      read = lastResult(context);
      return undefined;
    },
  );
  expect(cut).toContain("Lines 3 to 22 of 30 are cut here.");
  expect(read).toEqual({
    isError: false,
    text: "15\tline 15\n[Lines 16 to 30 are not shown.]",
  });
}, 30_000);

test("a hook script beside a user profile runs", async (testContext) => {
  const { chat, reply } = await openSandboxedChat(testContext, {
    hooks: [
      {
        id: "observer",
        event: "input",
        mode: "observe",
        run: { command: [process.execPath, "observer.mjs"], workingDirectory: "source" },
      },
    ],
  });
  writeFileSync(
    join(chat.getHooks().source, "observer.mjs"),
    'process.stdin.resume();\nprocess.stdin.on("end", () => process.stdout.write(JSON.stringify({ apiVersion: 1, action: "continue" })));\n',
  );
  await reply("Question.", () => undefined);
  expect(chat.getHooks().invocations).toMatchObject([{ status: "succeeded", exitCode: 0 }]);
}, 30_000);

test("the model reads attachments inside state and state writes still require approval", async (testContext) => {
  const { chat, state, reply } = await openSandboxedChat(testContext, {});
  const source = await chat.uploadAttachment(
    "readable.txt",
    "text/plain",
    new Response("attachment fixture").body,
  );
  const path = join(state, "attachments", source.id, "content");
  const results: ReturnType<typeof lastResult>[] = [];
  await reply(
    "Read the attachment, then write a state file.",
    () => fauxToolCall("Read", { path }),
    (context) => {
      results.push(lastResult(context));
      return fauxToolCall("Write", { path: join(state, "model.txt"), content: "needs approval" });
    },
    (context) => {
      results.push(lastResult(context));
      return undefined;
    },
  );
  expect(results[0]).toEqual({ isError: false, text: "1\tattachment fixture" });
  expect(results[1]).toMatchObject({
    isError: true,
    text: expect.stringContaining("user approval"),
  });
}, 30_000);
