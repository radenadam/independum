import type { ProfileReference } from "./api-types.ts";

/** A command failure with a stable process exit code. */
export class HeadlessError extends Error {
  code: string;
  exitCode: number;

  constructor(message: string, code: string, exitCode: number) {
    super(message);
    this.code = code;
    this.exitCode = exitCode;
  }
}

/** Saved terminal state without a second copy of assistant content. */
export interface OperationResult {
  status: "completed" | "failed" | "cancelled" | "outputLimited" | "interrupted";
  finalEntryId: string | null;
  code?: string;
  message?: string;
}

/** The lifecycle facts and references of a headless submission. */
export interface Operation {
  version: 1;
  requestId: string;
  operationId: string;
  submissionId: string;
  chatId: string;
  serverId: string;
  argumentsHash: string;
  timestamp: string;
  status: "running" | "waitingForInput" | OperationResult["status"];
  finalEntryId: string | null;
  code?: string;
  message?: string;
  questionId?: string;
  toolCallId?: string;
}

/** Exact prompt input and its explicit destination or new chat choices. */
export interface HeadlessPrompt {
  requestId: string;
  text: string;
  chatId?: string;
  project?: string;
  profile?: ProfileReference;
  isLiteral?: boolean;
  onQuestion?: "fail" | "wait";
}
