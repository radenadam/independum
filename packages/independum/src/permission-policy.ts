import { lstatSync, realpathSync, type Stats } from "node:fs";
import { dirname, isAbsolute, join, parse, relative, resolve, sep } from "node:path";
import { isMissingFile } from "./is-missing-file.ts";

/** Filesystem authority requested by one invocation. */
export interface PathAccess {
  kind: "path";
  path: string;
  scope: "file" | "tree";
  access: "read" | "write";
}

/** One filesystem or network grant. */
export type PermissionResource = PathAccess | { kind: "network" };

/** A rule evaluated independently of its position in the policy. */
export interface PermissionRule {
  id: string;
  effect: "allow" | "ask" | "deny";
  project: string;
  resource: PermissionResource;
}

/** Explicit access saved for one project and the approved resource identity. */
export interface SavedPermissionApproval {
  id: string;
  project: string;
  resource: PermissionResource;
  identity: string;
  approvedAt: string;
}

/** The complete permission policy stored in a profile. */
export interface PermissionPolicy {
  version: 1;
  mode: "project" | "unrestricted";
  environment: "minimal" | "inherit";
  runtimeApprovals: { backend: string; runtimeHash: string; approvedAt: string }[];
  savedApprovals: SavedPermissionApproval[];
  rules: PermissionRule[];
}

/** The default authority for each profile. */
export const builtInPermissions: PermissionPolicy = {
  version: 1,
  mode: "project",
  environment: "minimal",
  runtimeApprovals: [],
  savedApprovals: [],
  rules: [],
};

/** Identifies saved decisions independently of the profile settings they authorize. */
export function permissionApprovalState(policy: PermissionPolicy): string {
  return JSON.stringify({
    runtime: policy.runtimeApprovals,
    resources: policy.savedApprovals.map((approval) => ({
      ...approval,
      project: serializePermissionPath(approval.project),
      resource:
        approval.resource.kind === "network"
          ? approval.resource
          : { ...approval.resource, path: serializePermissionPath(approval.resource.path) },
    })),
  });
}

/** Rejects incomplete policies, unknown fields, and unsupported combinations. */
export function validatePermissionPolicy(value: unknown): PermissionPolicy {
  const fields = objectOf(value, [
    "version",
    "mode",
    "environment",
    "runtimeApprovals",
    "savedApprovals",
    "rules",
  ]);
  if (
    fields.version !== 1 ||
    !["project", "unrestricted"].includes(String(fields.mode)) ||
    !["minimal", "inherit"].includes(String(fields.environment)) ||
    !Array.isArray(fields.runtimeApprovals) ||
    !Array.isArray(fields.savedApprovals) ||
    !Array.isArray(fields.rules)
  ) {
    throw new Error(
      "Expected permission version 1, mode, environment, runtimeApprovals, savedApprovals, and rules.",
    );
  }
  const ids = new Set<string>();
  for (const entry of fields.rules) {
    const rule = objectOf(entry, ["id", "effect", "project", "resource"]);
    if (
      typeof rule.id !== "string" ||
      rule.id === "" ||
      ids.has(rule.id) ||
      !["allow", "ask", "deny"].includes(String(rule.effect)) ||
      typeof rule.project !== "string" ||
      (rule.project !== "*" && !isAbsolute(rule.project))
    ) {
      throw new Error("Expected a unique rule id, effect, and absolute project or *.");
    }
    ids.add(rule.id);
    validatePermissionResource(rule.resource);
  }
  if (fields.mode === "unrestricted" && fields.rules.length !== 0) {
    throw new Error("Unrestricted mode cannot contain resource rules.");
  }
  for (const entry of fields.runtimeApprovals) {
    const approval = objectOf(entry, ["backend", "runtimeHash", "approvedAt"]);
    if (
      typeof approval.backend !== "string" ||
      approval.backend === "" ||
      typeof approval.runtimeHash !== "string" ||
      !/^sha256:[a-f0-9]{64}$/.test(approval.runtimeHash) ||
      typeof approval.approvedAt !== "string" ||
      !Number.isFinite(Date.parse(approval.approvedAt))
    ) {
      throw new Error("Expected a backend, SHA-256 runtime hash, and approval date.");
    }
  }
  for (const entry of fields.savedApprovals) {
    const approval = objectOf(entry, ["id", "project", "resource", "identity", "approvedAt"]);
    if (
      typeof approval.id !== "string" ||
      approval.id === "" ||
      ids.has(approval.id) ||
      typeof approval.project !== "string" ||
      !isAbsolute(approval.project) ||
      typeof approval.identity !== "string" ||
      approval.identity === "" ||
      typeof approval.approvedAt !== "string" ||
      !Number.isFinite(Date.parse(approval.approvedAt))
    ) {
      throw new Error(
        "Expected a unique approval id, absolute project, resource identity, and approval date.",
      );
    }
    ids.add(approval.id);
    validatePermissionResource(approval.resource);
  }
  return value as PermissionPolicy;
}

/** Identifies a resource through its canonical path and nearest existing ancestor. */
export function permissionResourceIdentity(resource: PermissionResource): string {
  if (resource.kind === "network") {
    return JSON.stringify(resource);
  }
  const canonical = canonicalPermissionPath(resource.path, resource.path);
  let ancestor = canonical;
  let information = permissionPathIdentity(ancestor);
  while (information === undefined) {
    const parent = dirname(ancestor);
    if (parent === ancestor) {
      throw new Error("The resource identity cannot be resolved.");
    }
    ancestor = parent;
    information = permissionPathIdentity(ancestor);
  }
  return JSON.stringify({
    resource: { kind: "path", path: canonical, scope: resource.scope, access: resource.access },
    canonical,
    ancestor,
    device: information.dev,
    inode: information.ino,
    created: information.birthtimeMs,
  });
}

/** Checks an explicit saved grant without changing rule precedence or requested access. */
export function hasSavedPermissionApproval(
  policy: PermissionPolicy,
  project: string,
  resource: PermissionResource,
): boolean {
  const identity = permissionResourceIdentity(resource);
  const location = canonicalPermissionPath(project, project);
  return policy.savedApprovals.some(
    (approval) =>
      canonicalPermissionPath(approval.project, project) === location &&
      approval.identity === identity &&
      permissionResourceIdentity(approval.resource) === identity,
  );
}

/** Validates one requested resource without reading its contents. */
export function validatePermissionResource(value: unknown): PermissionResource {
  const resource = objectOf(value, ["kind", "path", "scope", "access"]);
  if (resource.kind === "network") {
    objectOf(value, ["kind"]);
  } else if (
    resource.kind !== "path" ||
    typeof resource.path !== "string" ||
    resource.path === "" ||
    !["file", "tree"].includes(String(resource.scope)) ||
    !["read", "write"].includes(String(resource.access))
  ) {
    throw new Error("Expected a path, file or tree scope, and read or write access.");
  }
  return value as PermissionResource;
}

/** Resolves links and the nearest existing ancestor of a new path. */
export function canonicalPermissionPath(path: string, project: string): string {
  const absolute = resolve(project, path);
  if (
    process.platform === "win32" &&
    (path.startsWith("\\\\?\\") ||
      path.startsWith("\\\\.\\") ||
      absolute.slice(parse(absolute).root.length).includes(":") ||
      path.split(/[\\/]/).some((part) => part !== "." && part !== ".." && /[. ]$/.test(part)))
  ) {
    throw new Error(
      "Device paths, alternate data streams, and trailing dots or spaces are not supported.",
    );
  }
  const tail: string[] = [];
  let current = absolute;
  for (;;) {
    try {
      return join(realpathSync.native(current), ...tail);
    } catch (error) {
      if (!isMissingFile(error)) {
        throw error;
      }
      if (permissionPathIdentity(current)?.isSymbolicLink()) {
        throw new Error("A symbolic link target cannot be resolved safely.");
      }
      const parent = dirname(current);
      if (parent === current) {
        throw new Error("The resource identity cannot be resolved.");
      }
      tail.unshift(relative(parent, current));
      current = parent;
    }
  }
}

/** Reads path metadata without reading contents or suppressing identity errors. */
export function permissionPathIdentity(path: string): Stats | undefined {
  try {
    return lstatSync(path);
  } catch (error) {
    if (!isMissingFile(error)) {
      throw error;
    }
    return undefined;
  }
}

/** Compares whole components after canonicalization. */
export function containsPermissionPath(parent: string, child: string): boolean {
  const difference = relative(
    canonicalPermissionPath(parent, parent),
    canonicalPermissionPath(child, child),
  );
  return (
    difference === "" ||
    (difference !== ".." && !difference.startsWith(`..${sep}`) && !isAbsolute(difference))
  );
}

/** Serializes Windows separators without changing path characters on other systems. */
export function serializePermissionPath(path: string): string {
  return process.platform === "win32" ? path.replaceAll("\\", "/") : path;
}

/** Returns a policy whose saved paths use the separators of the system, as a person reads them. */
export function readablePermissionPolicy(policy: PermissionPolicy): PermissionPolicy {
  return {
    ...policy,
    savedApprovals: policy.savedApprovals.map((approval) => ({
      ...approval,
      project: systemPath(approval.project),
      resource: readableResource(approval.resource),
    })),
    rules: policy.rules.map((rule) => ({
      ...rule,
      project: systemPath(rule.project),
      resource: readableResource(rule.resource),
    })),
  };
}

function readableResource(resource: PermissionResource): PermissionResource {
  return resource.kind === "network" ? resource : { ...resource, path: systemPath(resource.path) };
}

function systemPath(path: string): string {
  return process.platform === "win32" ? path.replaceAll("/", "\\") : path;
}

/** Evaluates all matching rules with deny before ask before allow. */
export function evaluatePermission(
  policy: PermissionPolicy,
  project: string,
  resource: PermissionResource,
  protectedPaths: string[],
): { decision: "allow" | "ask" | "deny"; matches: PermissionRule[]; reason: string } {
  if (policy.mode === "unrestricted") {
    return { decision: "allow", matches: [], reason: "Unrestricted account authority." };
  }
  const location = canonicalPermissionPath(project, project);
  const requested =
    resource.kind === "network"
      ? resource
      : { ...resource, path: canonicalPermissionPath(resource.path, project) };
  const isProtected =
    requested.kind === "path" &&
    requested.access === "write" &&
    protectedPaths.some(
      (path) =>
        containsPermissionPath(canonicalPermissionPath(path, project), requested.path) ||
        containsPermissionPath(requested.path, canonicalPermissionPath(path, project)),
    );
  const matches = policy.rules.filter((rule) => {
    if (rule.project !== "*" && canonicalPermissionPath(rule.project, project) !== location) {
      return false;
    }
    const target = rule.resource;
    if (target.kind === "network" || requested.kind === "network") {
      return target.kind === requested.kind;
    }
    const path = canonicalPermissionPath(target.path, project);
    const isOverlapping =
      (path === requested.path && (target.scope === "tree" || requested.scope === "file")) ||
      (target.scope === "tree" && containsPermissionPath(path, requested.path)) ||
      (requested.scope === "tree" &&
        rule.effect !== "allow" &&
        containsPermissionPath(requested.path, path));
    return (
      isOverlapping &&
      (rule.effect === "deny"
        ? target.access === "read" || requested.access === "write"
        : target.access === "write" || requested.access === "read")
    );
  });
  const decision = ["deny", "ask", "allow"] as const;
  const selected = decision.find((effect) => matches.some((rule) => rule.effect === effect));
  if (isProtected && selected !== "deny") {
    return {
      decision: "ask",
      matches,
      reason: "This access can change Independum's saved settings.",
    };
  }
  if (selected !== undefined) {
    return {
      decision: selected,
      matches,
      reason:
        selected === "ask"
          ? "A saved rule requires approval for this access."
          : selected === "deny"
            ? "A saved rule blocks this access."
            : "A saved rule allows this access.",
    };
  }
  const isInside = requested.kind === "path" && containsPermissionPath(location, requested.path);
  return {
    decision: isInside ? "allow" : "ask",
    matches,
    reason: isInside
      ? "This path is inside the project."
      : resource.kind === "network"
        ? "The command wants to connect to the network."
        : `The command wants to ${resource.access === "write" ? "write to" : "read"} a path outside the project.`,
  };
}

function objectOf(value: unknown, keys: string[]): Record<string, unknown> {
  if (
    typeof value !== "object" ||
    value === null ||
    Array.isArray(value) ||
    Object.keys(value).some((key) => !keys.includes(key))
  ) {
    throw new Error("Expected an object with supported permission fields only.");
  }
  return value as Record<string, unknown>;
}
