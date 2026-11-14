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
import { startPreviewPhoneRoute } from "./start-preview-phone-route.ts";

/** Starts an isolated app with a stand-in model and optional real logins through Pi. */
export async function startPreview(options: {
  fixture: PreviewFixture;
  port: number;
  hasRealLogins: boolean;
  hasPhoneRoute?: boolean;
}): Promise<{ url: string; home: string; close: () => Promise<void>; certificatePin?: string }> {
  const home = await mkdtemp(join(tmpdir(), "independum-preview-"));
  let stop: (() => Promise<void>) | undefined;
  let phoneRoute: Awaited<ReturnType<typeof startPreviewPhoneRoute>> | undefined;
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
    const noteRequest = "Write the preview note.";
    const cutRequest = "Print the long preview output.";
    const privateRequest = "Read the private preview folder.";
    const stateNoteRequest = "Write the state note.";
    // The long output has more lines and bytes than the built-in output limits keep, so the model
    // gets its start and end with a cut note between them.
    const longOutput =
      process.platform === "win32"
        ? '1..3000 | ForEach-Object { "Preview output line $_." }'
        : 'for line in $(seq 1 3000); do echo "Preview output line $line."; done';
    // The long check sends Shell values of other types for most of its parameters at once, with a
    // timeout text of several hundred characters, so its failure lists every differing parameter.
    const longCheck = {
      command: 42,
      description: "Check the long preview arguments",
      timeout: `${"Wait for the preview build to finish before the check reads its log. ".repeat(5)}${"0123456789".repeat(12)}`,
      background: "false",
      access: { network: "true", paths: [{ path: "notes", scope: true, access: null }] },
    };
    faux.setResponses([respond]);
    async function respond(context: TranscriptContext): Promise<AssistantMessage> {
      faux.appendResponses([respond]);
      await setTimeout(500);
      const requestIndex = context.messages.findLastIndex((message) => message.role === "user");
      const request = JSON.stringify(context.messages[requestIndex]);
      if (
        context.messages.at(-1)?.role !== "toolResult" &&
        request.includes("Hold queue preview.")
      ) {
        await setTimeout(8000);
      }
      if (request.includes(noteRequest)) {
        return writeNote(context.messages, requestIndex);
      }
      if (request.includes(cutRequest)) {
        return readCutOutput(resultsSince(context.messages, requestIndex));
      }
      if (request.includes(privateRequest)) {
        return readPrivateFolder(resultsSince(context.messages, requestIndex));
      }
      if (request.includes(stateNoteRequest)) {
        return writeStateNote(context.messages, requestIndex);
      }
      const hasNetworkRequest = request.includes("Check network permissions.");
      const isLongCheck = request.includes("Run the long preview check.");
      return context.messages.at(-1)?.role === "toolResult"
        ? fauxAssistantMessage([
            fauxText(isLongCheck ? "The long preview check ends at its failed call." : reply),
          ])
        : fauxAssistantMessage(
            [
              fauxThinking("I check the project steps before writing the reply."),
              fauxToolCall(
                "Shell",
                isLongCheck
                  ? longCheck
                  : {
                      command,
                      description: "Check the project steps",
                      ...(hasNetworkRequest ? { access: { network: true } } : {}),
                    },
              ),
            ],
            { stopReason: "toolUse" },
          );
    }
    // A note request first sends Write a number as its content, which differs from the schema,
    // then sends the same call with text, and replies once that call returns. Each request names
    // its own file, so every corrected call creates a new file.
    function writeNote(
      messages: TranscriptContext["messages"],
      requestIndex: number,
    ): AssistantMessage {
      const path = join("notes", `preview-note-${requestCount(messages, noteRequest)}.txt`);
      const results = resultsSince(messages, requestIndex).length;
      if (results === 0) {
        return fauxAssistantMessage(
          [fauxThinking("I write the preview note."), fauxToolCall("Write", { path, content: 42 })],
          { stopReason: "toolUse" },
        );
      }
      if (results === 1) {
        return fauxAssistantMessage(
          [fauxToolCall("Write", { path, content: "Preview note 42.\nWritten as text.\n" })],
          { stopReason: "toolUse" },
        );
      }
      return fauxAssistantMessage([fauxText(`Preview note written to ${path}.`)]);
    }
    // A cut request prints the long output, then reads the line in the middle of the lines that
    // the cut note names, from the file that the note names, and replies once that read returns.
    function readCutOutput(results: ToolOutcome[]): AssistantMessage {
      const [printed, read] = results;
      if (printed === undefined) {
        return fauxAssistantMessage(
          [
            fauxThinking("I print the long preview output."),
            fauxToolCall("Shell", { command: longOutput, description: "Print the long output" }),
          ],
          { stopReason: "toolUse" },
        );
      }
      const cut =
        /Lines ([\d,]+) to ([\d,]+) of [\d,]+ are cut here\..*The whole output is in (.+)\]$/m.exec(
          printed.text,
        );
      if (cut === null) {
        return fauxAssistantMessage([fauxText("The long preview output is not cut.")]);
      }
      const [, first = "", last = "", path = ""] = cut;
      const line = Math.round(
        (Number(first.replaceAll(",", "")) + Number(last.replaceAll(",", ""))) / 2,
      );
      if (read === undefined) {
        return fauxAssistantMessage([fauxToolCall("Read", { path, offset: line, limit: 1 })], {
          stopReason: "toolUse",
        });
      }
      return fauxAssistantMessage([
        fauxText(
          read.isError
            ? `Line ${line} of the cut output could not be read.`
            : `Line ${line} of the cut output is back from the saved output.`,
        ),
      ]);
    }
    // A private request reads the server connection in the private folder of the state, which the
    // sandbox denies, then reads the user settings beside that folder, and replies after both.
    function readPrivateFolder(results: ToolOutcome[]): AssistantMessage {
      const [denied, recovered] = results;
      if (denied === undefined) {
        return fauxAssistantMessage(
          [
            fauxThinking("I read the server connection in the private folder."),
            fauxToolCall("Read", { path: join(directory, "private", "server.json") }),
          ],
          { stopReason: "toolUse" },
        );
      }
      if (recovered === undefined) {
        return fauxAssistantMessage(
          [fauxToolCall("Read", { path: join(directory, "settings.json") })],
          { stopReason: "toolUse" },
        );
      }
      return fauxAssistantMessage([
        fauxText(
          recovered.isError
            ? "The state settings could not be read either."
            : "The private folder is denied, so the state settings beside it answer instead.",
        ),
      ]);
    }
    // A state note request writes a new file into the notes folder of the state, which asks for
    // approval even where a saved rule allows the write, and replies with how that call ended.
    function writeStateNote(
      messages: TranscriptContext["messages"],
      requestIndex: number,
    ): AssistantMessage {
      const note = requestCount(messages, stateNoteRequest);
      const [written] = resultsSince(messages, requestIndex);
      if (written === undefined) {
        return fauxAssistantMessage(
          [
            fauxThinking("I write the state note."),
            fauxToolCall("Write", {
              path: join(directory, "notes", `state-note-${note}.txt`),
              content: `State note ${note}.\nWritten into the state folder.\n`,
            }),
          ],
          { stopReason: "toolUse" },
        );
      }
      return fauxAssistantMessage([
        fauxText(
          written.isError
            ? `State note ${note} was not written.`
            : `State note ${note} was written into the state folder.`,
        ),
      ]);
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
    if (options.hasPhoneRoute) {
      phoneRoute = await startPreviewPhoneRoute(url.href);
    }
    return {
      url: url.href,
      home,
      close,
      ...(phoneRoute === undefined ? {} : { certificatePin: phoneRoute.certificatePin }),
    };
  } catch (error) {
    await close();
    throw error;
  }

  async function close(): Promise<void> {
    try {
      await phoneRoute?.close();
      await stop?.();
    } finally {
      await rm(home, { recursive: true, force: true, maxRetries: 10, retryDelay: 200 });
    }
  }
}

/** The text and error flag of one tool result that the stand-in model reads. */
interface ToolOutcome {
  text: string;
  isError: boolean;
}

function requestCount(messages: TranscriptContext["messages"], text: string): number {
  return messages.filter(
    (message) => message.role === "user" && JSON.stringify(message).includes(text),
  ).length;
}

function resultsSince(
  messages: TranscriptContext["messages"],
  requestIndex: number,
): ToolOutcome[] {
  return messages.slice(requestIndex).flatMap((message) =>
    message.role === "toolResult"
      ? [
          {
            text: message.content
              .map((block) => (block.type === "text" ? block.text : ""))
              .join(""),
            isError: message.isError,
          },
        ]
      : [],
  );
}
