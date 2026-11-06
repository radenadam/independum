import { createHash, randomUUID } from "node:crypto";
import {
  appendFileSync,
  closeSync,
  fsyncSync,
  mkdirSync,
  openSync,
  readFileSync,
  truncateSync,
} from "node:fs";
import { join } from "node:path";
import type { ChatEvent, ComposePreview } from "./api-types.ts";
import type { Chat, OpenChat } from "./create-chat.ts";
import {
  HeadlessError,
  type HeadlessPrompt,
  type Operation,
  type OperationResult,
} from "./headless-types.ts";
import { isMissingFile } from "./is-missing-file.ts";

/** The compact public state and optional final output of an operation. */
export interface OperationView {
  chatId: string;
  operationId: string;
  submissionId: string;
  status: Operation["status"];
  finalEntryId: string | null;
  text?: string;
  code?: string;
  message?: string;
  questionId?: string;
  toolCallId?: string;
}

/** Durable submissions with independent, cancellable observers. */
export interface Operations {
  prompt(input: HeadlessPrompt): Promise<OperationView>;
  show(id: string): Promise<OperationView>;
  wait(
    id: string,
    onQuestion: "fail" | "wait",
    signal?: AbortSignal,
    timeoutMs?: number,
  ): Promise<OperationView>;
  close(): void;
}

/** Tracks work through settlement without saving prompt or assistant text in its journal. */
export function createOperations(chat: Chat, directory: string, serverId: string): Operations {
  mkdirSync(directory, { recursive: true });
  const path = join(directory, "operations.jsonl");
  const operations = new Map<string, Operation>();
  const requests = new Map<string, string>();
  const listeners = new Map<string, Set<() => void>>();
  const followers = new Set<() => void>();
  let mutations = Promise.resolve();

  function record(value: unknown): void {
    const descriptor = openSync(path, "a", 0o600);
    try {
      appendFileSync(descriptor, `${JSON.stringify(value)}\n`);
      fsyncSync(descriptor);
    } finally {
      closeSync(descriptor);
    }
  }

  try {
    const content = readFileSync(path, "utf8");
    const boundary = content.lastIndexOf("\n") + 1;
    for (const line of content.slice(0, boundary).split("\n").filter(Boolean)) {
      const saved = JSON.parse(line) as { version: number; type: string; operation: Operation };
      const operation = saved.operation;
      if (
        saved.version !== 1 ||
        !["accepted", "settled"].includes(saved.type) ||
        typeof operation?.operationId !== "string" ||
        typeof operation.requestId !== "string"
      ) {
        throw new Error("The operation journal contains an invalid record.");
      }
      operations.set(operation.operationId, operation);
      requests.set(operation.requestId, operation.operationId);
    }
    if (boundary < content.length) {
      truncateSync(path, Buffer.byteLength(content.slice(0, boundary)));
    }
  } catch (error) {
    if (!isMissingFile(error)) {
      throw error;
    }
  }
  for (const operation of operations.values()) {
    if (operation.status === "running" || operation.status === "waitingForInput") {
      finish(operation, {
        status: "interrupted",
        finalEntryId: null,
        code: "serverRestarted",
        message: "The server stopped before the operation settled. Its effect is indeterminate.",
      });
    }
  }

  function notify(operation: Operation): void {
    for (const listener of listeners.get(operation.operationId) ?? []) {
      listener();
    }
  }

  function finish(operation: Operation, result: OperationResult): void {
    const next = { ...operation, ...result };
    delete next.questionId;
    if (
      operation.code === "approvalRequired" &&
      (result.status === "completed" || result.status === "failed")
    ) {
      next.code = operation.code;
      next.message = operation.message ?? "The tool call requires approval.";
    } else if (result.status === "completed") {
      delete next.code;
      delete next.message;
      delete next.questionId;
      delete next.toolCallId;
    } else if (result.status !== "failed") {
      if (result.code === undefined) {
        delete next.code;
      }
      if (result.message === undefined) {
        delete next.message;
      }
      delete next.toolCallId;
    }
    record({ version: 1, type: "settled", operation: next });
    Object.assign(operation, next);
    if (next.code === undefined) {
      delete operation.code;
    }
    if (next.message === undefined) {
      delete operation.message;
    }
    if (next.questionId === undefined) {
      delete operation.questionId;
    }
    if (next.toolCallId === undefined) {
      delete operation.toolCallId;
    }
    notify(operation);
  }

  function find(id: string): Operation {
    const operation = operations.get(id);
    if (operation === undefined) {
      throw new HeadlessError("No operation has that id.", "operationMissing", 3);
    }
    return operation;
  }

  async function view(operation: Operation): Promise<OperationView> {
    const {
      chatId,
      operationId,
      submissionId,
      status,
      finalEntryId,
      code,
      message,
      questionId,
      toolCallId,
    } = operation;
    let text: string | undefined;
    if (finalEntryId !== null) {
      const opened = await chat.open(chatId);
      try {
        text = opened?.entryText(finalEntryId);
        if (text === undefined) {
          throw new HeadlessError(
            "The saved operation output is no longer available.",
            "outputMissing",
            3,
          );
        }
      } finally {
        opened?.close();
      }
    }
    return {
      chatId,
      operationId,
      submissionId,
      status,
      finalEntryId,
      ...(text === undefined ? {} : { text }),
      ...(code === undefined ? {} : { code }),
      ...(message === undefined ? {} : { message }),
      ...(questionId === undefined ? {} : { questionId }),
      ...(toolCallId === undefined ? {} : { toolCallId }),
    };
  }

  function follow(opened: OpenChat, operation: Operation): { release: () => void } {
    let priorEntryId: string | null = null;
    let hasStarted = false;
    let errorMessage: string | undefined;
    const unsubscribe = opened.subscribe((event: ChatEvent) => {
      if (event.type === "pending") {
        const state = opened.inputState(operation.submissionId);
        if (!hasStarted && state === "handingOff") {
          priorEntryId = opened.outcome().finalEntryId;
          hasStarted = true;
        }
        if (state === "cancelled" || state === "handled") {
          try {
            finish(operation, {
              status: state === "cancelled" ? "cancelled" : "completed",
              finalEntryId: null,
            });
          } finally {
            release();
          }
          return;
        }
      }
      if (!hasStarted) {
        return;
      }
      if (event.type === "contextChanged") {
        const question = chat.approvals.pending(operation.chatId)[0];
        if (question !== undefined) {
          operation.status = "waitingForInput";
          operation.questionId = question.id;
          notify(operation);
        } else if (operation.status === "waitingForInput" && operation.toolCallId === undefined) {
          operation.status = "running";
          delete operation.questionId;
          notify(operation);
        }
      }
      if (event.type === "message" && event.message.role === "assistant") {
        errorMessage = event.message.error ?? undefined;
      }
      const details =
        event.type === "toolResult"
          ? event.result.details
          : event.type === "toolProgress"
            ? event.details
            : undefined;
      if (typeof details === "object" && details !== null) {
        if (
          operation.status === "waitingForInput" &&
          "id" in event &&
          event.id === operation.toolCallId &&
          (event.type === "toolResult" || "permissionExecutionStartedAt" in details)
        ) {
          operation.status = "running";
          delete operation.questionId;
          delete operation.toolCallId;
          notify(operation);
        }
        if ("outcome" in details && details.outcome === "approvalRequired") {
          operation.code = "approvalRequired";
          operation.message = "The tool call requires approval.";
          if ("id" in event) {
            operation.toolCallId = event.id;
          }
          notify(operation);
        }
        if (
          "approval" in details &&
          typeof details.approval === "object" &&
          details.approval !== null &&
          "id" in details.approval &&
          typeof details.approval.id === "string"
        ) {
          operation.status = "waitingForInput";
          operation.questionId = details.approval.id;
          if ("id" in event) {
            operation.toolCallId = event.id;
          }
          notify(operation);
        }
      }
      if (hasStarted && event.type === "replying" && !event.isReplying) {
        const outcome = opened.outcome();
        if (outcome.finalEntryId === priorEntryId) {
          outcome.finalEntryId = null;
        }
        try {
          finish(
            operation,
            errorMessage === undefined ||
              outcome.status === "cancelled" ||
              outcome.code === "approvalRequired"
              ? outcome
              : { ...outcome, status: "failed", message: errorMessage },
          );
        } finally {
          release();
        }
      }
    });
    function release(): void {
      unsubscribe();
      opened.close();
      followers.delete(release);
    }
    followers.add(release);
    return {
      release,
    };
  }

  async function submit(input: HeadlessPrompt): Promise<OperationView> {
    const hash = createHash("sha256")
      .update(
        JSON.stringify([
          input.text,
          input.chatId,
          input.project,
          input.profile?.scope,
          input.profile?.id,
          input.isLiteral ?? false,
          input.onQuestion ?? "fail",
        ]),
      )
      .digest("hex");
    const previous = requests.get(input.requestId);
    if (previous !== undefined) {
      const operation = find(previous);
      if (operation.argumentsHash !== hash) {
        throw new HeadlessError(
          "The request id already has different arguments.",
          "requestConflict",
          6,
        );
      }
      return view(operation);
    }
    const chatId = input.chatId ?? (await chat.create(input.project ?? "", input.profile));
    if (chatId === undefined) {
      throw new HeadlessError("The folder is not a known project.", "projectMissing", 3);
    }
    const opened = await chat.open(chatId);
    if (opened === undefined) {
      throw new HeadlessError("No active chat has that id.", "chatMissing", 3);
    }
    const state = opened.getState();
    if (state.isCompacting || state.model === null) {
      opened.close();
      throw new HeadlessError(
        "The chat needs a model and cannot receive a message during compaction.",
        "chatUnavailable",
        6,
      );
    }
    let preview: ComposePreview | undefined;
    try {
      if (!input.isLiteral) {
        preview = opened.compose(input.text, "commands");
        if (preview.kind === "action") {
          throw new HeadlessError(
            "Executable slash actions are not available through headless prompts yet.",
            "unsupportedAction",
            2,
          );
        }
      }
    } catch (error) {
      opened.close();
      if (error instanceof HeadlessError) {
        throw error;
      }
      throw new HeadlessError(
        error instanceof Error ? error.message : "The prompt cannot expand.",
        "invalidPrompt",
        2,
      );
    }
    const operation: Operation = {
      version: 1,
      requestId: input.requestId,
      operationId: randomUUID(),
      submissionId: randomUUID(),
      chatId,
      serverId,
      argumentsHash: hash,
      timestamp: new Date().toISOString(),
      status: "running",
      finalEntryId: null,
    };
    try {
      record({ version: 1, type: "accepted", operation });
    } catch (error) {
      opened.close();
      throw error;
    }
    operations.set(operation.operationId, operation);
    requests.set(input.requestId, operation.operationId);
    const observer = follow(opened, operation);
    try {
      if (
        !(await opened.send(
          preview?.text ?? input.text,
          input.isLiteral ? "literal" : "commands",
          preview?.id,
          input.onQuestion === "wait",
          undefined,
          { operationId: operation.operationId, submissionId: operation.submissionId },
        ))
      ) {
        throw new HeadlessError("The chat cannot accept this message.", "chatUnavailable", 6);
      }
    } catch (error) {
      finish(operation, {
        status: "failed",
        finalEntryId: null,
        code: error instanceof HeadlessError ? error.code : "submissionFailed",
        message: error instanceof Error ? error.message : "The message cannot be sent.",
      });
      observer.release();
    }
    return view(operation);
  }

  return {
    prompt(input) {
      const result = mutations.then(() => submit(input));
      mutations = result.then(
        () => undefined,
        () => undefined,
      );
      return result;
    },
    async show(id) {
      return view(find(id));
    },
    async wait(id, onQuestion, signal, timeoutMs = 55000) {
      const operation = find(id);
      await new Promise<void>((resolve, reject) => {
        const observers = listeners.get(id) ?? new Set<() => void>();
        listeners.set(id, observers);
        const timer = setTimeout(done, timeoutMs);
        function cleanup(): void {
          clearTimeout(timer);
          observers.delete(check);
          if (observers.size === 0) {
            listeners.delete(id);
          }
          signal?.removeEventListener("abort", abort);
        }
        function done(): void {
          cleanup();
          resolve();
        }
        function abort(): void {
          cleanup();
          reject(
            new HeadlessError("The client detached from the operation.", "clientDetached", 130),
          );
        }
        function check(): void {
          if (
            (operation.status !== "running" && operation.status !== "waitingForInput") ||
            (onQuestion === "fail" &&
              (operation.status === "waitingForInput" || operation.code === "approvalRequired"))
          ) {
            done();
          }
        }
        observers.add(check);
        signal?.addEventListener("abort", abort, { once: true });
        if (signal?.aborted) {
          abort();
        } else {
          check();
        }
      });
      return view(operation);
    },
    close() {
      for (const release of followers) {
        release();
      }
    },
  };
}
