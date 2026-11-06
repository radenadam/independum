import { randomUUID } from "node:crypto";
import type { SandboxRuntime } from "./create-sandbox.ts";
import {
  type PermissionResource,
  type PermissionRule,
  permissionResourceIdentity,
  type SavedPermissionApproval,
} from "./permission-policy.ts";

/** The lifetime explicitly chosen for an approval. */
export type ApprovalPersistence = "once" | "chat" | "project" | "runtime";

/** An explicit approval ready for a conditional profile save. */
export interface PermissionApprovalSave {
  chatId: string;
  folder: string;
  binding: string;
  project: string;
  resources: PermissionResource[];
  runtime?: SandboxRuntime;
  isCurrent: () => boolean;
}

/** An access grant retained while this server runs. */
export interface ChatPermissionApproval extends SavedPermissionApproval {
  chatId: string;
  binding: string;
}

/** An approval bound to one validated resource or tool invocation. */
export interface ApprovalRequest {
  requiredResources?: PermissionResource[];
  needsRuntimeApproval?: boolean;
  persistences?: ApprovalPersistence[];
  readonlyPaths?: string[];
  project?: string;
  restrictions?: string[];
  matchingRules?: PermissionRule[];
  id: string;
  revision: string;
  chatId: string;
  toolCallId: string;
  toolName: string;
  profileName: string;
  input: Record<string, unknown>;
  resources: PermissionResource[];
  reasons: string[];
  runtime?: SandboxRuntime;
  createdAt: number;
}

/** Pending approvals and their first terminal decisions for this server launch. */
export interface Approvals {
  saved(chatId: string): ChatPermissionApproval[];
  allows(chatId: string, binding: string, resource: PermissionResource): boolean;
  remember(chatId: string, binding: string, project: string, resources: PermissionResource[]): void;
  remove(chatId: string, id: string): boolean;
  pending(chatId?: string): ApprovalRequest[];
  request(
    request: Omit<ApprovalRequest, "id" | "createdAt">,
    signal: AbortSignal | undefined,
    onWaiting: (request: ApprovalRequest) => void,
    isCurrent?: () => boolean,
    onAllow?: (persistence: ApprovalPersistence) => Promise<void>,
  ): Promise<boolean>;
  resolve(
    id: string,
    revision: string,
    decision: "allow" | "deny",
    persistence?: ApprovalPersistence,
  ): Promise<200 | 400 | 404 | 409>;
  invalidate(): void;
}

/** Keeps authorization in memory and never replays an interrupted operation. */
export function createApprovals(): Approvals {
  const grants = new Map<string, ChatPermissionApproval>();
  const waiting = new Map<
    string,
    {
      request: ApprovalRequest;
      finish: (isAllowed: boolean) => void;
      isCurrent: () => boolean;
      onAllow?: (persistence: ApprovalPersistence) => Promise<void>;
      answer?: {
        decision: "allow" | "deny";
        persistence: ApprovalPersistence;
        result: Promise<200 | 409>;
      };
    }
  >();
  const resolved = new Map<
    string,
    {
      revision: string;
      decision: "allow" | "deny" | "cancelled" | "invalidated";
      persistence?: ApprovalPersistence;
    }
  >();
  function invalidate(): void {
    for (const [id, entry] of waiting) {
      // A persistent answer changes its own profile, so its final check follows the save.
      if (entry.answer === undefined && !entry.isCurrent()) {
        resolved.set(id, { revision: entry.request.revision, decision: "invalidated" });
        entry.finish(false);
      }
    }
  }
  return {
    saved: (chatId) =>
      structuredClone([...grants.values()].filter((grant) => grant.chatId === chatId)),
    allows: (chatId, binding, resource) =>
      [...grants.values()].some(
        (grant) =>
          grant.chatId === chatId &&
          grant.binding === binding &&
          grant.identity === permissionResourceIdentity(resource),
      ),
    remember(chatId, binding, project, resources) {
      for (const resource of resources) {
        const id = randomUUID();
        grants.set(id, {
          id,
          chatId,
          binding,
          project,
          resource: structuredClone(resource),
          identity: permissionResourceIdentity(resource),
          approvedAt: new Date().toISOString(),
        });
      }
    },
    remove(chatId, id) {
      const isRemoved = grants.get(id)?.chatId === chatId && grants.delete(id);
      if (isRemoved) {
        invalidate();
      }
      return isRemoved;
    },
    pending: (chatId) =>
      structuredClone(
        [...waiting.values()]
          .map((entry) => entry.request)
          .filter((request) => chatId === undefined || request.chatId === chatId),
      ),
    request: (input, signal, onWaiting, isCurrent = () => true, onAllow) =>
      new Promise<boolean>((resolve, reject) => {
        if (signal?.aborted === true) {
          resolve(false);
          return;
        }
        const request = structuredClone({ ...input, id: randomUUID(), createdAt: Date.now() });
        function cancel(): void {
          resolved.set(request.id, { revision: request.revision, decision: "cancelled" });
          finish(false);
        }
        function finish(isAllowed: boolean): void {
          waiting.delete(request.id);
          signal?.removeEventListener("abort", cancel);
          resolve(isAllowed);
        }
        waiting.set(request.id, {
          request,
          finish,
          isCurrent,
          ...(onAllow === undefined ? {} : { onAllow }),
        });
        signal?.addEventListener("abort", cancel, { once: true });
        try {
          onWaiting(structuredClone(request));
        } catch (error) {
          resolved.set(request.id, { revision: request.revision, decision: "cancelled" });
          waiting.delete(request.id);
          signal?.removeEventListener("abort", cancel);
          reject(error);
        }
      }),
    async resolve(id, revision, decision, persistence = "once") {
      const previous = resolved.get(id);
      if (previous !== undefined) {
        return previous.revision === revision &&
          previous.decision === decision &&
          previous.persistence === persistence
          ? 200
          : 409;
      }
      const entry = waiting.get(id);
      if (entry === undefined) {
        return 404;
      }
      if (entry.request.revision !== revision) {
        return 409;
      }
      if (
        (decision === "deny" && persistence !== "once") ||
        (persistence !== "once" &&
          (entry.onAllow === undefined || !entry.request.persistences?.includes(persistence)))
      ) {
        return 400;
      }
      if (entry.answer !== undefined) {
        return entry.answer.decision === decision && entry.answer.persistence === persistence
          ? entry.answer.result
          : 409;
      }
      if (!entry.isCurrent()) {
        resolved.set(id, { revision, decision: "invalidated" });
        entry.finish(false);
        return 409;
      }
      async function finishAnswer(): Promise<200 | 409> {
        try {
          if (entry === undefined || !waiting.has(id) || !entry.isCurrent()) {
            resolved.set(id, { revision, decision: "invalidated" });
            entry?.finish(false);
            return 409;
          }
          if (decision === "allow") {
            await entry?.onAllow?.(persistence);
          }
          if (entry === undefined || !waiting.has(id) || !entry.isCurrent()) {
            if (!resolved.has(id)) {
              resolved.set(id, { revision, decision: "invalidated" });
            }
            entry?.finish(false);
            return 409;
          }
          resolved.set(id, { revision, decision, persistence });
          entry.finish(decision === "allow");
          return 200;
        } catch (error) {
          if (entry !== undefined) {
            delete entry.answer;
          }
          throw error;
        }
      }
      const result = Promise.resolve().then(finishAnswer);
      entry.answer = { decision, persistence, result };
      return result;
    },
    invalidate,
  };
}
