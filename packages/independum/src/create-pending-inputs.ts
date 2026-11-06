import { createHash, randomUUID } from "node:crypto";
import { mkdirSync, readdirSync, readFileSync, renameSync, rmSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import type { SessionEntry } from "@earendil-works/pi-coding-agent";
import type { PendingInput, PendingInputsState } from "./api-types.ts";
import { isMissingFile } from "./is-missing-file.ts";

/** An input mutation that cannot apply to the current durable state. */
export class InputError extends Error {
  code: string;
  status: 400 | 404 | 409 | 413 | 422 | 500;

  constructor(message: string, code: string, status: InputError["status"] = 409) {
    super(message);
    this.code = code;
    this.status = status;
  }
}

interface Receipt {
  fingerprint: string;
  status: "accepted" | "delivered" | "cancelled" | "handled";
  userEntryId: string | null;
}

interface PendingFile {
  version: 1;
  chatId: string;
  folder: string;
  name: string | null;
  isArchived: boolean;
  revision: number;
  isPaused: boolean;
  nextSequence: number;
  items: PendingInput[];
  receipts: Record<string, Receipt>;
}

/** Durable pending inputs that remain removable until handoff starts. */
export interface PendingInputs {
  archive(isArchived: boolean): void;
  rename(name: string): void;
  status(id: string): Receipt["status"] | undefined;
  state(): PendingInputsState;
  receipt(id: string, fingerprint: string): Receipt | undefined;
  accept(
    input: Omit<PendingInput, "sequence" | "createdAt" | "state" | "reason">,
    fingerprint: string,
  ): void;
  pause(reason: string): void;
  resume(): void;
  remove(id: string): boolean;
  handoff(id: string): PendingInput;
  handled(id: string): void;
  reconcile(entries: SessionEntry[]): void;
  delete(): void;
}

/** Hashes the exact submitted values for idempotent acceptance. */
export function inputFingerprint(value: unknown): string {
  return createHash("sha256").update(JSON.stringify(value)).digest("hex");
}

/** Opens one chat's pending inputs and holds work restored after a restart. */
export function createPendingInputs(
  directory: string,
  chatId: string,
  entries: SessionEntry[],
  folder: string,
): PendingInputs {
  const path = join(directory, `${chatId}.json`);
  let file: PendingFile = {
    version: 1,
    chatId,
    folder,
    name: null,
    isArchived: false,
    revision: 0,
    isPaused: false,
    nextSequence: 1,
    items: [],
    receipts: {},
  };
  let failure: string | null = null;
  let saveFailure: string | null = null;
  try {
    const parsed: unknown = JSON.parse(readFileSync(path, "utf8"));
    if (!isPendingFile(parsed, chatId)) {
      throw new Error("The file of waiting messages is invalid.");
    }
    file = parsed;
  } catch (error) {
    if (!isMissingFile(error)) {
      failure = `The waiting messages at ${path} need repair. ${error instanceof Error ? error.message : "The file cannot be read."}`;
    }
  }

  function change(update: (next: PendingFile) => void): void {
    if (failure !== null) {
      throw new InputError(failure, "pendingInvalid", 500);
    }
    const next = structuredClone(file);
    update(next);
    next.revision += 1;
    const temporary = join(directory, `${chatId}.${randomUUID()}.tmp`);
    try {
      mkdirSync(directory, { recursive: true });
      writeFileSync(temporary, `${JSON.stringify(next, null, 2)}\n`, { flag: "wx" });
      renameSync(temporary, path);
    } catch {
      saveFailure = "The waiting messages could not be saved.";
      throw new InputError("The waiting messages could not be saved.", "pendingSaveFailed", 500);
    } finally {
      rmSync(temporary, { force: true });
    }
    file = next;
    saveFailure = null;
  }

  function reconcile(saved: SessionEntry[]): void {
    const delivered = new Map<string, string>();
    let inputId: string | undefined;
    for (const entry of saved) {
      if (entry.type === "custom" && entry.customType === "independum-input") {
        const data = entry.data as { inputId?: string } | undefined;
        inputId = data?.inputId;
      } else if (
        entry.type === "message" &&
        entry.message.role === "user" &&
        inputId !== undefined
      ) {
        delivered.set(inputId, entry.id);
        inputId = undefined;
      }
    }
    const completed = file.items.filter((input) => delivered.has(input.id));
    if (completed.length === 0 || failure !== null) {
      return;
    }
    change((next) => {
      for (const input of completed) {
        const receipt = next.receipts[input.id];
        if (receipt !== undefined) {
          receipt.status = "delivered";
          receipt.userEntryId = delivered.get(input.id) ?? null;
        }
      }
      next.items = next.items.filter((input) => !delivered.has(input.id));
    });
  }

  const pending: PendingInputs = {
    archive(isArchived) {
      change((next) => {
        next.isArchived = isArchived;
      });
    },
    rename(name) {
      change((next) => {
        next.name = name;
      });
    },
    status: (id) => (Object.hasOwn(file.receipts, id) ? file.receipts[id]?.status : undefined),
    state: () =>
      structuredClone({
        revision: file.revision,
        isPaused: failure !== null || saveFailure !== null || file.isPaused,
        items: file.items,
        error: failure ?? saveFailure,
      }),
    receipt(id, fingerprint) {
      const receipt = Object.hasOwn(file.receipts, id) ? file.receipts[id] : undefined;
      if (receipt !== undefined && receipt.fingerprint !== fingerprint) {
        throw new InputError("This input id already has different content.", "inputConflict");
      }
      return receipt === undefined ? undefined : structuredClone(receipt);
    },
    accept(input, fingerprint) {
      if (pending.receipt(input.id, fingerprint) !== undefined) {
        return;
      }
      change((next) => {
        next.items.push({
          ...input,
          sequence: next.nextSequence++,
          createdAt: Date.now(),
          state: next.isPaused ? "held" : "waiting",
          reason: next.isPaused ? "Held because sending is held in this chat." : null,
        });
        next.receipts[input.id] = { fingerprint, status: "accepted", userEntryId: null };
      });
    },
    pause(reason) {
      if (
        failure !== null ||
        (file.isPaused && file.items.every((input) => input.state === "held"))
      ) {
        return;
      }
      change((next) => {
        next.isPaused = true;
        for (const input of next.items) {
          const wasHandingOff = input.state === "handingOff";
          input.state = "held";
          input.reason = wasHandingOff
            ? "Held while sending had started, so this message may already be in the chat."
            : reason;
        }
      });
    },
    resume() {
      change((next) => {
        next.isPaused = false;
        for (const input of next.items) {
          input.state = "waiting";
          input.reason = null;
        }
      });
    },
    remove(id) {
      const input = file.items.find((item) => item.id === id);
      if (file.receipts[id]?.status === "cancelled") {
        return true;
      }
      if (
        input?.state === "handingOff" ||
        (input === undefined && file.receipts[id] !== undefined)
      ) {
        throw new InputError("This input has already entered delivery.", "inputSending");
      }
      if (input === undefined) {
        return false;
      }
      change((next) => {
        next.items = next.items.filter((item) => item.id !== id);
        const receipt = next.receipts[id];
        if (receipt !== undefined) {
          receipt.status = "cancelled";
        }
      });
      return true;
    },
    handoff(id) {
      const input = file.items.find((item) => item.id === id);
      if (input === undefined || input.state !== "waiting" || file.isPaused) {
        throw new InputError("This input is not waiting for delivery.", "inputUnavailable");
      }
      change((next) => {
        const item = next.items.find((candidate) => candidate.id === id);
        if (item !== undefined) {
          item.state = "handingOff";
        }
      });
      return structuredClone(input);
    },
    handled(id) {
      change((next) => {
        next.items = next.items.filter((input) => input.id !== id);
        const receipt = next.receipts[id];
        if (receipt !== undefined) {
          receipt.status = "handled";
        }
      });
    },
    reconcile,
    delete() {
      rmSync(path, { force: true });
    },
  };
  reconcile(entries);
  if (file.items.length > 0) {
    try {
      pending.pause("Held when the server restarted.");
    } catch {
      saveFailure = "The restored waiting messages could not be held on disk.";
    }
  }
  return pending;
}

/** Lists accepted chats that Pi has not yet saved, without opening or replaying their inputs. */
export function listPendingChats(
  directory: string,
  savedIds: Set<string>,
): { id: string; folder: string; name: string; modified: number; isArchived: boolean }[] {
  return pendingNames(directory)
    .filter((name) => !savedIds.has(name.slice(0, -5)))
    .flatMap((name) => {
      const path = join(directory, name);
      let file: unknown;
      try {
        file = JSON.parse(readFileSync(path, "utf8"));
      } catch {
        throw new InputError(
          `The file of waiting messages at ${path} needs repair.`,
          "pendingInvalid",
          500,
        );
      }
      if (!isPendingFile(file, name.slice(0, -5))) {
        throw new InputError(
          `The file of waiting messages at ${path} is invalid.`,
          "pendingInvalid",
          500,
        );
      }
      const first = file.items[0];
      return first === undefined
        ? []
        : [
            {
              id: file.chatId,
              folder: file.folder,
              name: file.name ?? first.text,
              modified: first.createdAt,
              isArchived: file.isArchived,
            },
          ];
    });
}

/** Collects retained attachment references and refuses cleanup when pending data needs repair. */
export function pendingAttachmentIds(directory: string): Set<string> {
  const retained = new Set<string>();
  for (const name of pendingNames(directory)) {
    const value: unknown = JSON.parse(readFileSync(join(directory, name), "utf8"));
    if (!isPendingFile(value, name.slice(0, -5))) {
      throw new InputError(
        "Waiting messages need repair before attachment cleanup.",
        "pendingInvalid",
        500,
      );
    }
    for (const input of value.items) {
      for (const id of input.attachmentIds ?? []) {
        retained.add(id);
      }
    }
  }
  return retained;
}

function pendingNames(directory: string): string[] {
  try {
    return readdirSync(directory).filter((name) => /^[a-f0-9-]+\.json$/i.test(name));
  } catch (error) {
    if (isMissingFile(error)) {
      return [];
    }
    throw error;
  }
}

function isPendingFile(value: unknown, chatId: string): value is PendingFile {
  if (typeof value !== "object" || value === null) {
    return false;
  }
  const file = value as PendingFile;
  return (
    file.version === 1 &&
    file.chatId === chatId &&
    typeof file.folder === "string" &&
    (file.name === null || typeof file.name === "string") &&
    typeof file.isArchived === "boolean" &&
    Number.isSafeInteger(file.revision) &&
    file.revision >= 0 &&
    typeof file.isPaused === "boolean" &&
    Number.isSafeInteger(file.nextSequence) &&
    file.nextSequence > 0 &&
    Array.isArray(file.items) &&
    file.items.every(
      (input) =>
        typeof input === "object" &&
        input !== null &&
        typeof input.id === "string" &&
        Number.isSafeInteger(input.sequence) &&
        input.sequence > 0 &&
        input.sequence < file.nextSequence &&
        Number.isSafeInteger(input.createdAt) &&
        input.createdAt >= 0 &&
        ["queue", "steer"].includes(input.delivery) &&
        ["waiting", "handingOff", "held"].includes(input.state) &&
        (input.reason === null || typeof input.reason === "string") &&
        typeof input.text === "string" &&
        (input.text.trim() !== "" ||
          (input.attachmentIds?.length ?? 0) > 0 ||
          input.branch !== undefined) &&
        (input.attachmentIds === undefined ||
          (Array.isArray(input.attachmentIds) &&
            input.attachmentIds.every((id) => typeof id === "string"))) &&
        (input.fileAttachmentIds === undefined ||
          (Array.isArray(input.fileAttachmentIds) &&
            input.fileAttachmentIds.every((id) => typeof id === "string"))) &&
        (input.attachments === undefined ||
          (Array.isArray(input.attachments) &&
            input.attachments.every(
              (source) =>
                typeof source === "object" &&
                source !== null &&
                typeof source.id === "string" &&
                typeof source.name === "string" &&
                typeof source.mimeType === "string" &&
                ["text", "image", "file"].includes(source.kind) &&
                Number.isSafeInteger(source.bytes) &&
                source.bytes >= 0 &&
                Number.isSafeInteger(source.textBytes) &&
                source.textBytes >= 0 &&
                (source.encoding === null ||
                  ["utf-8", "utf-16le", "utf-16be"].includes(source.encoding)),
            ))) &&
        (input.branch === undefined ||
          (typeof input.branch === "object" &&
            input.branch !== null &&
            (input.branch.kind === "edit" || input.branch.kind === "retry") &&
            typeof input.branch.sourceUserEntryId === "string" &&
            (input.branch.sourceAssistantEntryId === undefined ||
              typeof input.branch.sourceAssistantEntryId === "string"))) &&
        typeof input.hasBrowserApprovals === "boolean" &&
        (input.submission === undefined ||
          (typeof input.submission === "object" &&
            input.submission !== null &&
            typeof input.submission.operationId === "string" &&
            input.submission.submissionId === input.id)) &&
        typeof input.model?.providerId === "string" &&
        typeof input.model?.modelId === "string" &&
        (input.model?.thinkingLevel === null || typeof input.model?.thinkingLevel === "string") &&
        (input.command === null ||
          (typeof input.command === "object" &&
            input.command.kind === "preview" &&
            typeof input.command.id === "string")),
    ) &&
    new Set(file.items.map((input) => input.id)).size === file.items.length &&
    new Set(file.items.map((input) => input.sequence)).size === file.items.length &&
    typeof file.receipts === "object" &&
    file.receipts !== null &&
    !Array.isArray(file.receipts) &&
    Object.values(file.receipts).every(
      (receipt) =>
        receipt !== null &&
        typeof receipt === "object" &&
        typeof receipt.fingerprint === "string" &&
        /^[a-f0-9]{64}$/.test(receipt.fingerprint) &&
        ["accepted", "delivered", "cancelled", "handled"].includes(receipt.status) &&
        (receipt.userEntryId === null || typeof receipt.userEntryId === "string"),
    ) &&
    file.items.every(
      (input) =>
        Object.hasOwn(file.receipts, input.id) && file.receipts[input.id]?.status === "accepted",
    )
  );
}
