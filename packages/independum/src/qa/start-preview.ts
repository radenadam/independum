import { mkdtemp, rm } from "node:fs/promises";
import { homedir, tmpdir } from "node:os";
import { join } from "node:path";
import { setTimeout } from "node:timers/promises";
import {
  type AssistantMessage,
  fauxAssistantMessage,
  fauxProvider,
  fauxText,
  fauxThinking,
  fauxToolCall,
  type TranscriptContext,
} from "@earendil-works/pi-ai";
import { createAccessToken } from "../create-access-token.ts";
import { createChat } from "../create-chat.ts";
import { createModelRuntime } from "../create-model-runtime.ts";
import { startAppServer } from "../start-app-server.ts";
import { createPreviewFixture, type PreviewFixture } from "./create-preview-fixture.ts";

/** Starts an isolated app with a stand-in model and optional real logins through Pi. */
export async function startPreview(options: {
  fixture: PreviewFixture;
  port: number;
  hasRealLogins: boolean;
}): Promise<{ url: string; home: string; close: () => Promise<void> }> {
  const home = await mkdtemp(join(tmpdir(), "independum-preview-"));
  let stop: (() => Promise<void>) | undefined;
  try {
    const directory = join(home, ".independum");
    const project = await createPreviewFixture(home, options.fixture);
    const models = await createModelRuntime(
      options.hasRealLogins ? join(homedir(), ".independum") : directory,
    );
    const faux = fauxProvider({
      provider: "faux",
      models: [{ id: "faux-typing", name: "Faux typing", reasoning: true }],
      tokensPerSecond: 100,
    });
    if (options.fixture !== "empty") {
      models.registerNativeProvider(faux.provider);
    }
    const command =
      process.platform === "win32"
        ? 'Start-Sleep -Seconds 3\nWrite-Output "Preview steps complete."'
        : 'sleep 3\nprintf "Preview steps complete.\\n"';
    const reply =
      "Preview reply complete.\n\nThe stand-in model thinks, runs a command, and replies.\n\n| Check | Result |\n| --- | --- |\n| Steps | Complete |";
    faux.setResponses([respond]);
    async function respond(context: TranscriptContext): Promise<AssistantMessage> {
      faux.appendResponses([respond]);
      await setTimeout(500);
      return context.messages.at(-1)?.role === "toolResult"
        ? fauxAssistantMessage([fauxText(reply)])
        : fauxAssistantMessage(
            [
              fauxThinking("I check the project steps before writing the reply."),
              fauxToolCall("Shell", { command, description: "Check the project steps" }),
            ],
            { stopReason: "toolUse" },
          );
    }
    const chat = await createChat({ models, directory, folder: project });
    stop = stopChat;
    async function stopChat(): Promise<void> {
      await chat.stopAll();
    }
    const server = await startAppServer({
      chat,
      models,
      directory,
      token: createAccessToken(),
      port: options.port,
    });
    stop = server.close;
    const url = new URL(server.url);
    url.searchParams.set("chat", await chat.first());
    return { url: url.href, home, close };
  } catch (error) {
    await close();
    throw error;
  }

  async function close(): Promise<void> {
    try {
      await stop?.();
    } finally {
      await rm(home, { recursive: true, force: true, maxRetries: 10, retryDelay: 200 });
    }
  }
}
