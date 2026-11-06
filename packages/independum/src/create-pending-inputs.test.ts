import { randomUUID } from "node:crypto";
import { mkdirSync, readdirSync, readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { SessionManager } from "@earendil-works/pi-coding-agent";
import { expect, test } from "vitest";
import type { PendingInput } from "./api-types.ts";
import {
  createPendingInputs,
  inputFingerprint,
  listPendingChats,
} from "./create-pending-inputs.ts";
import { createTestFolder } from "./tools/create-test-folder.ts";

const directory = createTestFolder("pending-inputs");

function input(
  text = "A prompt",
): Omit<PendingInput, "sequence" | "createdAt" | "state" | "reason"> {
  return {
    id: randomUUID(),
    text,
    delivery: "queue",
    model: { providerId: "faux", modelId: "first", thinkingLevel: "off" },
    hasBrowserApprovals: false,
    command: null,
  };
}

test("acceptance is durable and returned snapshots cannot change saved inputs", () => {
  const chatId = randomUUID();
  const pending = createPendingInputs(directory, chatId, [], directory);
  const submitted = input();
  const fingerprint = inputFingerprint(submitted);
  pending.accept(submitted, fingerprint);
  pending.state().items.splice(0);
  const restored = createPendingInputs(directory, chatId, [], directory);
  expect(restored.state()).toMatchObject({
    revision: 2,
    isPaused: true,
    items: [{ id: submitted.id, state: "held", text: submitted.text }],
  });
  expect(restored.receipt(submitted.id, fingerprint)?.status).toBe("accepted");
  expect(() => restored.receipt(submitted.id, inputFingerprint("other"))).toThrow(
    "different content",
  );
  restored.resume();
  expect(restored.state().items[0]?.state).toBe("waiting");
});

test("removal before handoff wins and removal after handoff conflicts", () => {
  const pending = createPendingInputs(directory, randomUUID(), [], directory);
  const first = input();
  const second = input();
  pending.accept(first, inputFingerprint(first));
  pending.accept(second, inputFingerprint(second));
  expect(pending.remove(first.id)).toBe(true);
  expect(pending.status(first.id)).toBe("cancelled");
  expect(() => pending.handoff(first.id)).toThrow("not waiting");
  pending.handoff(second.id);
  expect(() => pending.remove(second.id)).toThrow("entered delivery");
  expect(pending.state().items).toMatchObject([{ id: second.id, state: "handingOff" }]);
});

test("recovery matches input markers instead of duplicate text or timestamps", () => {
  const manager = SessionManager.inMemory(directory);
  const first = input();
  const second = input();
  const pending = createPendingInputs(directory, manager.getSessionId(), [], directory);
  for (const submitted of [first, second]) {
    pending.accept(submitted, inputFingerprint(submitted));
  }
  pending.handoff(first.id);
  manager.appendCustomEntry("independum-input", { inputId: first.id });
  const userEntryId = manager.appendMessage({ role: "user", content: first.text, timestamp: 1 });
  pending.handoff(second.id);
  manager.appendCustomEntry("independum-input", { inputId: second.id });
  const restored = createPendingInputs(
    directory,
    manager.getSessionId(),
    manager.getEntries(),
    directory,
  );
  expect(restored.state().items).toMatchObject([{ id: second.id, state: "held" }]);
  expect(restored.receipt(first.id, inputFingerprint(first))).toMatchObject({
    status: "delivered",
    userEntryId,
  });
  expect(() => restored.remove(first.id)).toThrow("entered delivery");
});

test("invalid pending files stay visible and cannot be overwritten as an empty queue", () => {
  const id = randomUUID();
  const path = join(directory, `${id}.json`);
  writeFileSync(path, '{"version":17}');
  const pending = createPendingInputs(directory, id, [], directory);
  expect(pending.state()).toMatchObject({
    isPaused: true,
    error: expect.stringContaining("need repair"),
  });
  expect(() => pending.resume()).toThrow("need repair");
  expect(readFileSync(path, "utf8")).toBe('{"version":17}');
  pending.delete();
});

test("a failed atomic replacement acknowledges no input and leaves no staging file", () => {
  const id = randomUUID();
  const path = join(directory, `${id}.json`);
  const pending = createPendingInputs(directory, id, [], directory);
  mkdirSync(path);
  const submitted = input();
  expect(() => pending.accept(submitted, inputFingerprint(submitted))).toThrow(
    "could not be saved",
  );
  expect(pending.status(submitted.id)).toBeUndefined();
  expect(pending.state().items).toEqual([]);
  expect(readdirSync(directory).some((name) => name.endsWith(".tmp"))).toBe(false);
});

test("accepted unsent chats retain their folder, name, and archive choice", () => {
  const target = join(directory, randomUUID());
  const id = randomUUID();
  const pending = createPendingInputs(target, id, [], directory);
  const submitted = input();
  pending.accept(submitted, inputFingerprint(submitted));
  pending.rename("Held work");
  pending.archive(true);
  expect(listPendingChats(target, new Set())).toEqual([
    { id, folder: directory, name: "Held work", modified: expect.any(Number), isArchived: true },
  ]);
  expect(listPendingChats(target, new Set([id]))).toEqual([]);
  pending.delete();
  expect(listPendingChats(target, new Set())).toEqual([]);
});
