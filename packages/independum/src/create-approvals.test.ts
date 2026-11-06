import { expect, test, vi } from "vitest";
import {
  type ApprovalPersistence,
  type ApprovalRequest,
  type Approvals,
  createApprovals,
} from "./create-approvals.ts";

const request: Omit<ApprovalRequest, "id" | "createdAt"> = {
  revision: "bound-input-policy-and-runtime",
  chatId: "chat",
  toolCallId: "call",
  toolName: "Shell",
  profileName: "Default",
  input: { command: "exact command", access: { network: true } },
  resources: [{ kind: "network" }],
  reasons: ["The command wants to connect to the network."],
  runtime: {
    backend: "bubblewrap",
    support: { isSupported: true, availableMethods: ["bubblewrap"] },
    readonlyPaths: [],
    implicitAccess: "Test baseline.",
    environment: "minimal",
    environmentNames: [],
    runtimeHash: `sha256:${"a".repeat(64)}`,
    unavailable: null,
  },
};

test("reconnecting sees the same approval and the first valid answer wins", async () => {
  const approvals = createApprovals();
  const waiting = vi.fn();
  const answer = approvals.request(request, undefined, waiting);
  const pending = approvals.pending("chat")[0] as ApprovalRequest;
  expect(waiting).toHaveBeenCalledOnce();
  expect(approvals.pending("chat")).toEqual([pending]);
  expect(await approvals.resolve(pending.id, "stale", "allow")).toBe(409);
  expect(await approvals.resolve(pending.id, pending.revision, "allow")).toBe(200);
  expect(await approvals.resolve(pending.id, pending.revision, "allow")).toBe(200);
  expect(await approvals.resolve(pending.id, pending.revision, "deny")).toBe(409);
  expect(await answer).toBe(true);
  expect(approvals.pending()).toEqual([]);
});

test("cancellation leaves another chat pending and restart grants no authority", async () => {
  const approvals = createApprovals();
  const signal = new AbortController();
  const first = approvals.request(request, signal.signal, vi.fn());
  const second = approvals.request({ ...request, chatId: "other" }, undefined, vi.fn());
  const pending = approvals.pending("chat")[0] as ApprovalRequest;
  signal.abort();
  expect(await first).toBe(false);
  expect(await approvals.resolve(pending.id, pending.revision, "allow")).toBe(409);
  const other = approvals.pending("other")[0] as ApprovalRequest;
  expect(await createApprovals().resolve(other.id, other.revision, "allow")).toBe(404);
  await approvals.resolve(other.id, other.revision, "deny");
  expect(await second).toBe(false);
});

test("changed bindings invalidate pending requests and stale answers cannot execute", async () => {
  const approvals = createApprovals();
  let isCurrent = true;
  const answer = approvals.request(request, undefined, vi.fn(), () => isCurrent);
  const pending = approvals.pending()[0] as ApprovalRequest;
  isCurrent = false;
  expect(await approvals.resolve(pending.id, pending.revision, "allow")).toBe(409);
  expect(await answer).toBe(false);
  const next = approvals.request(request, undefined, vi.fn(), () => isCurrent);
  approvals.invalidate();
  expect(await next).toBe(false);
  expect(approvals.pending()).toEqual([]);
});

test("persistent answers save once before allowing and conflicts cannot widen the chosen lifetime", async () => {
  const approvals = createApprovals();
  const saved = Promise.withResolvers<void>();
  const save = vi.fn(() => saved.promise);
  const waiting = requestProjectApproval(approvals, save);
  const pending = approvals.pending()[0] as ApprovalRequest;
  const first = approvals.resolve(pending.id, pending.revision, "allow", "project");
  const duplicate = approvals.resolve(pending.id, pending.revision, "allow", "project");
  expect(await approvals.resolve(pending.id, pending.revision, "allow", "once")).toBe(409);
  expect(approvals.pending()).toHaveLength(1);
  saved.resolve();
  expect(await first).toBe(200);
  expect(await duplicate).toBe(200);
  expect(save).toHaveBeenCalledExactlyOnceWith("project");
  expect(await waiting).toBe(true);
});

test("failed saves leave the request pending without granting access", async () => {
  const approvals = createApprovals();
  const save = vi
    .fn()
    .mockRejectedValueOnce(new Error("The profile changed."))
    .mockResolvedValue(undefined);
  const waiting = requestProjectApproval(approvals, save);
  const pending = approvals.pending()[0] as ApprovalRequest;
  expect(await approvals.resolve(pending.id, pending.revision, "allow", "chat")).toBe(400);
  expect(await approvals.resolve(pending.id, pending.revision, "deny", "project")).toBe(400);
  await expect(approvals.resolve(pending.id, pending.revision, "allow", "project")).rejects.toThrow(
    "profile changed",
  );
  expect(approvals.pending()).toHaveLength(1);
  expect(await approvals.resolve(pending.id, pending.revision, "allow", "project")).toBe(200);
  expect(await waiting).toBe(true);
});

test("chat grants stay in their chat and profile binding and removal revokes them", () => {
  const approvals = createApprovals();
  const resource = { kind: "network" } as const;
  approvals.remember("chat", "profile", "project", [resource]);
  expect(approvals.allows("chat", "profile", resource)).toBe(true);
  expect(approvals.allows("other", "profile", resource)).toBe(false);
  expect(approvals.allows("chat", "changed-profile", resource)).toBe(false);
  const saved = approvals.saved("chat")[0];
  expect(approvals.remove("other", saved?.id ?? "")).toBe(false);
  expect(approvals.remove("chat", saved?.id ?? "")).toBe(true);
  expect(approvals.allows("chat", "profile", resource)).toBe(false);
  expect(createApprovals().saved("chat")).toEqual([]);
});

function requestProjectApproval(
  approvals: Approvals,
  save: (persistence: ApprovalPersistence) => Promise<void>,
): Promise<boolean> {
  return approvals.request(
    { ...request, persistences: ["once", "project"] },
    undefined,
    vi.fn(),
    () => true,
    save,
  );
}
