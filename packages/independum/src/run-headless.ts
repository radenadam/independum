import { randomUUID } from "node:crypto";
import { readFile } from "node:fs/promises";
import { join, resolve } from "node:path";
import { parseArgs } from "node:util";
import type { ProfileReference } from "./api-types.ts";
import { connectHeadless } from "./connect-headless.ts";
import type { OperationView } from "./create-operations.ts";
import { HeadlessError } from "./headless-types.ts";
import { operationExitCode } from "./operation-exit-code.ts";

/** IO and lifecycle dependencies of the command line client. */
export interface HeadlessClientOptions {
  directory: string;
  folder: string;
  token?: string;
  signal?: AbortSignal;
  request?: typeof fetch;
  launch?: () => void;
  serve?: () => Promise<void>;
  stdin(): Promise<string>;
  stdout(text: string): void;
  stderr(text: string): void;
}

const operationFields = [
  "chatId",
  "operationId",
  "submissionId",
  "status",
  "finalEntryId",
  "text",
  "code",
  "message",
  "questionId",
  "toolCallId",
  "disposition",
];
const serverFields = ["serverId", "url", "version", "protocolVersion", "status"];

/** Executes one finite headless command without a banner, catalog, or transcript. */
export async function runHeadless(
  argumentsList: string[],
  options: HeadlessClientOptions,
): Promise<number> {
  let sensitiveToken = options.token;
  function writeOutput(value: string): void {
    options.stdout(sensitiveToken ? value.replaceAll(sensitiveToken, "[redacted]") : value);
  }
  function writeError(value: string): void {
    options.stderr(sensitiveToken ? value.replaceAll(sensitiveToken, "[redacted]") : value);
  }
  let format = "text";
  let requestId = randomUUID() as string;
  let operationId: string | undefined;
  let deadline: NodeJS.Timeout | undefined;
  const controller = new AbortController();
  const signal =
    options.signal === undefined
      ? controller.signal
      : AbortSignal.any([controller.signal, options.signal]);
  let hasExpired = false;
  async function readInput(): Promise<string> {
    return new Promise<string>((resolve, reject) => {
      function abort(): void {
        reject(new Error("The input read is interrupted."));
      }
      signal.addEventListener("abort", abort, { once: true });
      if (signal.aborted) {
        abort();
        return;
      }
      options
        .stdin()
        .then(resolve, () =>
          reject(new HeadlessError("The input must be valid UTF-8 text.", "invalidInput", 2)),
        )
        .finally(() => signal.removeEventListener("abort", abort));
    });
  }
  try {
    let parsed: ReturnType<typeof parseArgs>;
    try {
      parsed = parseArgs({
        args: argumentsList,
        allowPositionals: true,
        options: {
          format: { type: "string" },
          server: { type: "string" },
          start: { type: "string" },
          "timeout-ms": { type: "string" },
          fields: { type: "string" },
          "request-id": { type: "string" },
          "access-token-stdin": { type: "boolean" },
          help: { type: "boolean" },
          version: { type: "boolean" },
          chat: { type: "string" },
          project: { type: "string" },
          profile: { type: "string" },
          "text-file": { type: "string" },
          literal: { type: "boolean" },
          "no-wait": { type: "boolean" },
          "on-question": { type: "string" },
          foreground: { type: "boolean" },
          force: { type: "boolean" },
        },
        tokens: true,
      });
    } catch {
      throw new HeadlessError("The command or one of its flags is invalid.", "invalidCommand", 2);
    }
    const values = parsed.values;
    const positionals = parsed.positionals;
    const seen = new Set<string>();
    for (const token of parsed.tokens ?? []) {
      if (token.kind === "option") {
        if (seen.has(token.name)) {
          throw new HeadlessError("A flag cannot appear more than once.", "invalidCommand", 2);
        }
        seen.add(token.name);
      }
    }
    function stringValue(name: string): string | undefined {
      const value = values[name];
      return typeof value === "string" ? value : undefined;
    }
    format = stringValue("format") ?? "text";
    if (format !== "text" && format !== "jsonl") {
      throw new HeadlessError("Output format must be text or jsonl.", "invalidFormat", 2);
    }
    requestId = stringValue("request-id") ?? requestId;
    if (!/^[A-Za-z0-9._-]{1,128}$/.test(requestId)) {
      throw new HeadlessError(
        "The request id must contain at most 128 letters, digits, dots, underscores, or hyphens.",
        "invalidInput",
        2,
      );
    }
    const version = (
      JSON.parse(await readFile(join(import.meta.dirname, "..", "package.json"), "utf8")) as {
        version: string;
      }
    ).version;
    if (values.version) {
      writeOutput(`${version}\n`);
      return 0;
    }
    const command = positionals[0];
    const serverAction = command === "server" ? positionals[1] : undefined;
    if (values.help) {
      writeOutput(
        command === "prompt"
          ? "Usage: independum prompt [TEXT] [--text-file PATH] [--chat ID | --project PATH [--profile ID]] [--literal] [--no-wait] [--on-question fail|wait]\n"
          : command === "wait"
            ? "Usage: independum wait OPERATION_ID [--on-question fail|wait]\n"
            : command === "server"
              ? "Usage: independum server start [--foreground] | status | stop [--force]\n"
              : "Usage: independum prompt | wait | server [--format text|jsonl] [--start auto|never] [--timeout-ms N] [--fields NAME,...] [--request-id ID] [--server URL --access-token-stdin]\n",
      );
      return 0;
    }
    if (
      command !== "prompt" &&
      command !== "wait" &&
      !(command === "server" && ["start", "status", "stop"].includes(serverAction ?? ""))
    ) {
      throw new HeadlessError(
        "This command is not available. Use prompt, wait, or server.",
        "unsupportedCommand",
        2,
      );
    }
    const common = [
      "format",
      "server",
      "start",
      "timeout-ms",
      "fields",
      "request-id",
      "access-token-stdin",
      "help",
      "version",
    ];
    const allowed =
      command === "prompt"
        ? ["chat", "project", "profile", "text-file", "literal", "no-wait", "on-question"]
        : command === "wait"
          ? ["on-question"]
          : serverAction === "start"
            ? ["foreground"]
            : serverAction === "stop"
              ? ["force"]
              : [];
    if ([...seen].some((name) => !common.includes(name) && !allowed.includes(name))) {
      throw new HeadlessError("A flag does not apply to this command.", "invalidCommand", 2);
    }
    const fields = stringValue("fields")?.split(",");
    if (
      fields?.some(
        (field) => !(command === "server" ? serverFields : operationFields).includes(field),
      )
    ) {
      throw new HeadlessError("The selected output field is unknown.", "invalidFields", 2);
    }
    const timeoutText = stringValue("timeout-ms") ?? "0";
    if (
      !/^\d+$/.test(timeoutText) ||
      !Number.isSafeInteger(Number(timeoutText)) ||
      Number(timeoutText) > 2147483647
    ) {
      throw new HeadlessError(
        "The client timeout must be a nonnegative integer within the timer range.",
        "invalidTimeout",
        2,
      );
    }
    if (Number(timeoutText) > 0) {
      deadline = setTimeout(() => {
        hasExpired = true;
        controller.abort();
      }, Number(timeoutText));
    }
    const start = stringValue("start") ?? "auto";
    if (start !== "auto" && start !== "never") {
      throw new HeadlessError("Startup must be auto or never.", "invalidStart", 2);
    }
    const onQuestion = stringValue("on-question") ?? "fail";
    if (onQuestion !== "fail" && onQuestion !== "wait") {
      throw new HeadlessError("Question handling must be fail or wait.", "invalidInput", 2);
    }
    let text: string | undefined;
    let profile: ProfileReference | undefined;
    const chatId = stringValue("chat");
    const project = stringValue("project");
    if (command === "prompt") {
      const file = stringValue("text-file");
      if (
        positionals.length > 2 ||
        (positionals[1] !== undefined && file !== undefined) ||
        (positionals[1] === undefined && file === undefined) ||
        (chatId !== undefined && (project !== undefined || values.profile !== undefined))
      ) {
        throw new HeadlessError(
          "A prompt needs exactly one text source and one compatible target.",
          "invalidInput",
          2,
        );
      }
      if (values["access-token-stdin"] && file === "-") {
        throw new HeadlessError(
          "The access token and prompt cannot both use stdin.",
          "stdinConflict",
          2,
        );
      }
      text =
        file === undefined
          ? positionals[1]
          : file === "-"
            ? await readInput()
            : await readFile(resolve(options.folder, file))
                .then((bytes) => {
                  // biome-ignore lint/style/useNamingConvention: TextDecoder names this option ignoreBOM.
                  return new TextDecoder("utf-8", { fatal: true, ignoreBOM: true }).decode(bytes);
                })
                .catch(() => {
                  throw new HeadlessError("The prompt file cannot be read.", "inputUnreadable", 2);
                });
      if (text === undefined || text.trim() === "") {
        throw new HeadlessError("A prompt needs nonempty text.", "invalidInput", 2);
      }
      const selected = stringValue("profile");
      if (selected !== undefined) {
        const parts = selected.split(":");
        const scope = parts.length === 1 ? "user" : parts[0];
        const id = parts.at(-1) ?? "";
        if (
          (scope !== "user" && scope !== "project") ||
          parts.length > 2 ||
          !/^[a-z][a-z0-9]*(?:-[a-z0-9]+)*$/.test(id) ||
          id.length > 64
        ) {
          throw new HeadlessError(
            "The profile must be an exact id with optional user or project scope.",
            "invalidInput",
            2,
          );
        }
        profile = { scope, id };
      }
    } else if (
      (command === "wait" && (positionals.length !== 2 || positionals[1] === "")) ||
      (command === "server" && positionals.length !== 2)
    ) {
      throw new HeadlessError("The command arguments are invalid.", "invalidCommand", 2);
    }
    if (values.foreground) {
      if (seen.size !== 1 || options.serve === undefined) {
        throw new HeadlessError(
          "Foreground startup accepts no connection or output flags.",
          "invalidCommand",
          2,
        );
      }
      await options.serve();
      return 0;
    }
    let token = options.token;
    if (values["access-token-stdin"]) {
      token = (await readInput()).trim();
    }
    const connection = await connectHeadless({
      directory: options.directory,
      folder: options.folder,
      start: serverAction === "status" || serverAction === "stop" ? "never" : start,
      signal,
      ...(stringValue("server") === undefined ? {} : { server: stringValue("server") as string }),
      ...(token === undefined ? {} : { token }),
      ...(options.request === undefined ? {} : { request: options.request }),
      ...(options.launch === undefined ? {} : { launch: options.launch }),
    });
    sensitiveToken = connection.accessToken;
    const request = options.request ?? fetch;
    async function call(path: string, body?: unknown): Promise<unknown> {
      let response: Response;
      try {
        response = await request(new URL(path, connection.url), {
          method: body === undefined ? "GET" : "POST",
          headers: {
            authorization: `Bearer ${connection.accessToken}`,
            ...(body === undefined ? {} : { "content-type": "application/json" }),
          },
          ...(body === undefined ? {} : { body: JSON.stringify(body) }),
          redirect: "error",
          signal,
        });
      } catch {
        throw new HeadlessError(
          "The server connection ended. Submitted work may continue.",
          "connectionLost",
          5,
        );
      }
      const value: unknown = response.status === 204 ? {} : await response.json().catch(() => null);
      if (!response.ok) {
        const failure = value as {
          code?: string;
          message?: string;
          error?: string;
          exitCode?: number;
        } | null;
        const exitCode =
          response.status === 401 || response.status === 403
            ? 4
            : response.status === 404
              ? 3
              : response.status === 409
                ? 6
                : response.status === 400
                  ? 2
                  : (failure?.exitCode ?? 1);
        throw new HeadlessError(
          (failure?.message ?? failure?.error ?? "The server request failed.").replaceAll(
            connection.accessToken,
            "[redacted]",
          ),
          failure?.code ?? "requestFailed",
          exitCode,
        );
      }
      return value;
    }
    function output(data: Record<string, unknown>, status: string): void {
      const selected =
        fields === undefined
          ? command === "server" || values["no-wait"]
            ? data
            : { chatId: data.chatId, operationId: data.operationId, text: data.text ?? "" }
          : Object.fromEntries(
              fields.filter((field) => field in data).map((field) => [field, data[field]]),
            );
      if (format === "jsonl") {
        writeOutput(
          `${JSON.stringify({ version: 1, id: requestId, type: "result", status, data: selected })}\n`,
        );
      } else if (command === "server") {
        if (serverAction !== "stop") {
          writeOutput(
            `${serverAction === "start" ? connection.serverId : JSON.stringify(selected)}\n`,
          );
        }
      } else if (command === "prompt" && values["no-wait"]) {
        writeOutput(`chat ${String(data.chatId)}\noperation ${String(data.operationId)}\n`);
      } else {
        const result = String(selected.text ?? "");
        if (result !== "") {
          writeOutput(result.endsWith("\n") ? result : `${result}\n`);
        }
      }
    }
    if (command === "server") {
      const data =
        serverAction === "stop"
          ? await call("/api/server/stop", { force: values.force === true })
          : await call("/api/health");
      output({ ...(data as Record<string, unknown>), url: connection.url }, "completed");
      return 0;
    }
    let result: OperationView;
    if (command === "prompt") {
      result = (await call("/api/prompt", {
        requestId,
        text,
        ...(chatId === undefined
          ? { project: resolve(options.folder, project ?? ".") }
          : { chatId }),
        ...(profile === undefined ? {} : { profile }),
        isLiteral: values.literal === true,
        onQuestion,
      })) as OperationView;
      operationId = result.operationId;
      if (values["no-wait"]) {
        output(
          {
            chatId: result.chatId,
            operationId,
            submissionId: result.submissionId,
            disposition: "started",
          },
          "accepted",
        );
        return 0;
      }
    } else {
      operationId = positionals[1];
      result = (await call(
        `/api/operations/${encodeURIComponent(operationId ?? "")}`,
      )) as OperationView;
    }
    while (result.status === "running" || result.status === "waitingForInput") {
      if (
        onQuestion === "fail" &&
        (result.code === "approvalRequired" || result.status === "waitingForInput")
      ) {
        break;
      }
      result = (await call(
        `/api/operations/${encodeURIComponent(operationId ?? "")}/wait?onQuestion=${onQuestion}`,
      )) as OperationView;
    }
    const exitCode = operationExitCode(result);
    if (exitCode !== 0) {
      const message = (
        result.message ??
        (exitCode === 7
          ? "The operation needs an answer or approval."
          : `The operation is ${result.status}.`)
      ).replaceAll(connection.accessToken, "[redacted]");
      if (format === "jsonl") {
        writeOutput(
          `${JSON.stringify({ version: 1, id: requestId, type: "error", status: result.status, code: result.code ?? result.status, message, data: { chatId: result.chatId, operationId, ...(result.questionId === undefined ? {} : { questionId: result.questionId }), ...(result.toolCallId === undefined ? {} : { toolCallId: result.toolCallId }) } })}\n`,
        );
      } else {
        writeError(
          `${message}\noperation ${operationId}\n${result.questionId === undefined ? "" : `question ${result.questionId}\n`}${result.toolCallId === undefined ? "" : `tool call ${result.toolCallId}\n`}`,
        );
      }
      return exitCode;
    }
    output(result as unknown as Record<string, unknown>, result.status);
    return 0;
  } catch (error) {
    const failure = signal.aborted
      ? new HeadlessError(
          hasExpired
            ? "The client deadline expired. Server work may continue."
            : "The client detached. Server work may continue.",
          hasExpired ? "deadlineExpired" : "clientDetached",
          hasExpired ? 8 : 130,
        )
      : error instanceof HeadlessError
        ? error
        : new HeadlessError("The headless command failed.", "clientFailed", 5);
    if (format === "jsonl") {
      writeOutput(
        `${JSON.stringify({ version: 1, id: requestId, type: "error", status: "failed", code: failure.code, message: failure.message, ...(operationId === undefined ? {} : { data: { operationId } }) })}\n`,
      );
    } else {
      writeError(
        `${failure.message}\n${operationId === undefined ? "" : `operation ${operationId}\n`}`,
      );
    }
    return failure.exitCode;
  } finally {
    clearTimeout(deadline);
  }
}
