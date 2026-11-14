import { homedir } from "node:os";
import { join } from "node:path";
import { setTimeout } from "node:timers/promises";
import { fileURLToPath } from "node:url";
import {
  type AssistantMessage,
  fauxAssistantMessage,
  fauxProvider,
  fauxText,
  fauxThinking,
  fauxToolCall,
  type TranscriptContext,
} from "@earendil-works/pi-ai";
import { connectHeadless } from "../connect-headless.ts";
import { createChat } from "../create-chat.ts";
import { createModelRuntime } from "../create-model-runtime.ts";
import { HeadlessError } from "../headless-types.ts";
import { startAppServer } from "../start-app-server.ts";
import type { PreviewFixture } from "./create-preview-fixture.ts";

/** The home, project, port, and access token of one preview server process. */
export interface PreviewServerOptions {
  home: string;
  project: string;
  fixture: PreviewFixture;
  port: number;
  hasRealLogins: boolean;
  token: string;
}

/** Serves the app of a prepared preview home with a stand-in model and optional real logins. */
export async function servePreview(
  options: PreviewServerOptions,
): Promise<{ url: string; close: () => Promise<void> }> {
  const directory = join(options.home, ".independum");
  // Like the command that starts Independum, the server first looks for a running server through
  // the saved connection record. That removes a stale record, so state migration can finish.
  await connectHeadless({
    directory,
    folder: options.project,
    start: "never",
    signal: new AbortController().signal,
  }).then(
    () => {
      throw new Error("An Independum server already runs with this preview home.");
    },
    (error: unknown) => {
      if (!(error instanceof HeadlessError) || error.code !== "serverMissing") {
        throw error;
      }
    },
  );
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
  const attachmentRequest = "Read the saved attachment.";
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
    if (context.messages.at(-1)?.role !== "toolResult" && request.includes("Hold queue preview.")) {
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
    if (request.includes(attachmentRequest)) {
      return readAttachment(context.messages, requestIndex);
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
  // An attachment request reads the file at the first attachment path that a saved message gives
  // the model, and replies with that path once the read returns.
  function readAttachment(
    messages: TranscriptContext["messages"],
    requestIndex: number,
  ): AssistantMessage {
    const path = attachmentPathOf(messages);
    const [read] = resultsSince(messages, requestIndex);
    if (path === undefined) {
      return fauxAssistantMessage([fauxText("No attachment path reaches the model.")]);
    }
    if (read === undefined) {
      return fauxAssistantMessage(
        [
          fauxThinking("I read the saved attachment from the path in its note."),
          fauxToolCall("Read", { path }),
        ],
        { stopReason: "toolUse" },
      );
    }
    return fauxAssistantMessage([
      fauxText(
        read.isError
          ? `The saved attachment cannot be read from \`${path}\`.`
          : `The saved attachment reads from \`${path}\`.`,
      ),
    ]);
  }
  const chat = await createChat({ models, directory, folder: options.project });
  try {
    const server = await startAppServer({
      chat,
      models,
      directory,
      token: options.token,
      port: options.port,
    });
    const url = new URL(server.url);
    url.searchParams.set("chat", await chat.first());
    return { url: url.href, close: server.close };
  } catch (error) {
    await chat.stopAll();
    throw error;
  }
}

// Like the development launcher, the parent passes the access token in the environment, and the
// server removes it there, so processes that the server starts, such as agent tools, never get it.
if (process.argv[1] === fileURLToPath(import.meta.url)) {
  const token = process.env.INDEPENDUM_ACCESS_TOKEN ?? "";
  delete process.env.INDEPENDUM_ACCESS_TOKEN;
  const server = await servePreview({
    ...(JSON.parse(process.argv[2] ?? "") as Omit<PreviewServerOptions, "token">),
    token,
  });
  let isClosing = false;
  function close(): void {
    if (!isClosing) {
      isClosing = true;
      server.close().finally(() => process.exit(0));
    }
  }
  process.on("message", (message) => {
    if (message === "close") {
      close();
    }
  });
  process.once("disconnect", close);
  for (const signal of ["SIGINT", "SIGTERM"] as const) {
    process.once(signal, close);
  }
  process.send?.({ url: server.url });
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
  return messages
    .slice(requestIndex)
    .flatMap((message) =>
      message.role === "toolResult"
        ? [{ text: textOf(message.content), isError: message.isError }]
        : [],
    );
}

// An attachment note names its saved file on a line of its own as a JSON string.
function attachmentPathOf(messages: TranscriptContext["messages"]): string | undefined {
  for (const message of messages) {
    const path =
      message.role === "user" ? /^Path: (".*")$/m.exec(textOf(message.content))?.[1] : undefined;
    if (path !== undefined) {
      return JSON.parse(path) as string;
    }
  }
  return undefined;
}

function textOf(content: string | readonly { type: string; text?: string }[]): string {
  return typeof content === "string"
    ? content
    : content.map((block) => (block.type === "text" ? (block.text ?? "") : "")).join("");
}
