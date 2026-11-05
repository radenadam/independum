import { createHash, randomUUID } from "node:crypto";
import { dirname, join } from "node:path";
import type { Approvals, PermissionApprovalSave } from "./create-approvals.ts";
import {
  canonicalPermissionPath,
  containsPermissionPath,
  evaluatePermission,
  hasSavedPermissionApproval,
  type PathAccess,
  type PermissionPolicy,
  permissionApprovalState,
  permissionPathIdentity,
} from "./permission-policy.ts";

/** Permission dependencies for one chat's context discovery. */
interface ContextPermissionsOptions {
  project: string;
  directory: string;
  chatId: string;
  approvals: Approvals;
  policy: () => PermissionPolicy;
  profileName: () => string;
  revision: () => string;
  branch: () => string | null;
  onChange: () => void;
  audit: (data: unknown) => void;
  saveApproval?: (approval: PermissionApprovalSave) => Promise<PermissionPolicy>;
}

/** Read and edit grants for context sources, bound to their identities and profile. */
export interface ContextPermissions {
  check(path: string, scope: "file" | "tree", access?: "read" | "write"): boolean;
  request(
    path: string,
    scope: "file" | "tree",
    access: "read" | "write",
    signal?: AbortSignal,
  ): Promise<boolean>;
}

/** Connects context reads and edits to the same policy and approval store as tools. */
export function createContextPermissions(options: ContextPermissionsOptions): ContextPermissions {
  const grants: { resource: PathAccess; binding: string }[] = [];

  function resourceOf(path: string, scope: "file" | "tree", access: "read" | "write"): PathAccess {
    return { kind: "path", path: canonicalPermissionPath(path, options.project), scope, access };
  }

  function binding(resource: PathAccess): string {
    let ancestor = resource.path;
    while (permissionPathIdentity(ancestor) === undefined) {
      ancestor = dirname(ancestor);
    }
    const information = permissionPathIdentity(ancestor);
    return JSON.stringify({
      resource,
      canonical: canonicalPermissionPath(resource.path, options.project),
      ancestor,
      device: information?.dev,
      inode: information?.ino,
      created: information?.birthtimeMs,
      revision: options.revision(),
      branch: options.branch(),
    });
  }

  function evaluation(resource: PathAccess): ReturnType<typeof evaluatePermission> {
    return evaluatePermission(options.policy(), options.project, resource, [
      canonicalPermissionPath(options.directory, options.project),
      canonicalPermissionPath(join(options.project, ".independum"), options.project),
    ]);
  }

  function check(path: string, scope: "file" | "tree", access: "read" | "write" = "read"): boolean {
    const resource = resourceOf(path, scope, access);
    const result = evaluation(resource);
    if (result.decision === "deny") {
      throw new Error("A permission rule denies access to this context resource.");
    }
    if (result.decision !== "ask") {
      return result.decision === "allow";
    }
    if (
      hasSavedPermissionApproval(options.policy(), options.project, resource) ||
      options.approvals.allows(options.chatId, options.revision(), resource)
    ) {
      return true;
    }
    return grants.some(
      (grant) =>
        grant.binding === binding(grant.resource) &&
        (grant.resource.access === "write" || access === "read") &&
        (grant.resource.path === resource.path
          ? grant.resource.scope === "tree" || scope === "file"
          : grant.resource.scope === "tree" &&
            containsPermissionPath(grant.resource.path, resource.path)),
    );
  }

  return {
    check,
    async request(path, scope, access, signal) {
      signal?.throwIfAborted();
      const resource = resourceOf(path, scope, access);
      const result = evaluation(resource);
      if (result.decision === "deny") {
        return false;
      }
      if (check(path, scope, access)) {
        return true;
      }
      const captured = binding(resource);
      let approvalState = permissionApprovalState(options.policy());
      let chatApprovalState = JSON.stringify(options.approvals.saved(options.chatId));
      const revision = createHash("sha256").update(captured).digest("hex");
      function isCurrent(): boolean {
        try {
          return (
            signal?.aborted !== true &&
            permissionApprovalState(options.policy()) === approvalState &&
            JSON.stringify(options.approvals.saved(options.chatId)) === chatApprovalState &&
            binding(resource) === captured &&
            evaluation(resource).decision !== "deny"
          );
        } catch {
          return false;
        }
      }
      const toolCallId = randomUUID();
      let isOneUse = true;
      const pending = options.approvals.request(
        {
          revision,
          chatId: options.chatId,
          toolCallId,
          toolName: "Context",
          profileName: options.profileName(),
          project: options.project,
          input: { path, scope, access },
          resources: [resource],
          requiredResources: [resource],
          persistences: options.saveApproval === undefined ? ["once"] : ["once", "chat", "project"],
          matchingRules: result.matches,
          reasons: [result.reason],
        },
        signal,
        (approval) => {
          options.audit({ state: "waiting", approval });
          options.onChange();
        },
        isCurrent,
        async (persistence) => {
          isOneUse = persistence === "once";
          if (persistence === "project") {
            const saved = await options.saveApproval?.({
              chatId: options.chatId,
              folder: options.project,
              binding: options.revision(),
              project: options.project,
              resources: [resource],
              isCurrent,
            });
            if (saved !== undefined) {
              approvalState = permissionApprovalState(saved);
            }
          } else if (persistence === "chat") {
            options.approvals.remember(options.chatId, options.revision(), options.project, [
              resource,
            ]);
            chatApprovalState = JSON.stringify(options.approvals.saved(options.chatId));
          }
        },
      );
      const isAllowed = await pending;
      const isCancelled = signal?.aborted === true;
      const isValid = isCurrent();
      if (isAllowed && isValid && !isCancelled && isOneUse) {
        grants.push({ resource, binding: captured });
      }
      options.audit({
        state: isCancelled
          ? "cancelled"
          : !isValid
            ? "invalidated"
            : isAllowed
              ? "allowed"
              : "denied",
        toolCallId,
        revision,
      });
      options.onChange();
      signal?.throwIfAborted();
      return isAllowed && isValid;
    },
  };
}
