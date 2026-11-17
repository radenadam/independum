import { lstatSync, mkdirSync, renameSync, symlinkSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { expect, test } from "vitest";
import { validateProfileBundle } from "./configuration-schema.ts";
import { fileIdentity } from "./file-identity.ts";
import {
  builtInPermissions,
  canonicalPermissionPath,
  containsPermissionPath,
  deniedPermissionPaths,
  evaluatePermission,
  hasSavedPermissionApproval,
  type PathAccess,
  type PermissionPolicy,
  type PermissionResource,
  type PermissionRule,
  permissionResourceIdentity,
  validatePermissionPolicy,
} from "./permission-policy.ts";
import { createTestFolder, createTestProject } from "./tools/create-test-folder.ts";

const folder = canonicalPermissionPath(createTestFolder("permission-policy"), process.cwd());
const project = join(folder, "project");
mkdirSync(project);
const inside = {
  kind: "path",
  path: join(project, "file.txt"),
  scope: "file",
  access: "write",
} as const;

function approvedPolicy(
  approvedProject: string,
  resource: PermissionResource,
  identity = permissionResourceIdentity(resource),
): PermissionPolicy {
  return {
    ...builtInPermissions,
    savedApprovals: [
      {
        id: resource.kind,
        project: approvedProject,
        resource,
        identity,
        approvedAt: new Date().toISOString(),
      },
    ],
  };
}

test("project defaults allow reads everywhere and ask for outside writes and network", () => {
  expect(evaluatePermission(builtInPermissions, project, inside, []).decision).toBe("allow");
  expect(containsPermissionPath(project, `${project}-neighbor`)).toBe(false);
  expect(
    evaluatePermission(
      builtInPermissions,
      project,
      { ...inside, access: "read", path: `${project}-neighbor` },
      [],
    ).decision,
  ).toBe("allow");
  for (const resource of [
    { ...inside, path: `${project}-neighbor` },
    { kind: "network" } as const,
  ]) {
    expect(evaluatePermission(builtInPermissions, project, resource, []).decision).toBe("ask");
  }
});

test("project rules and protected paths compare real locations without changing saved paths", () => {
  const { project } = createTestProject(folder, true);
  const physical = canonicalPermissionPath(project, project);
  const protectedPath = join(project, ".independum");
  const rule: PermissionRule = {
    id: "project-rule",
    project,
    effect: "deny",
    resource: { ...inside, path: join(project, "new.txt") },
  };
  const policy = { ...builtInPermissions, rules: [rule] };
  for (const root of [project, physical]) {
    for (const path of [rule.resource, { ...inside, path: join(physical, "new.txt") }]) {
      expect(evaluatePermission(policy, root, path, []).decision).toBe("deny");
    }
    expect(containsPermissionPath(root, join(project, "missing", "file.txt"))).toBe(true);
    expect(containsPermissionPath(root, join(physical, "missing", "file.txt"))).toBe(true);
    expect(
      evaluatePermission(builtInPermissions, root, { ...inside, path: "new.txt" }, []).decision,
    ).toBe("allow");
    expect(
      evaluatePermission(
        builtInPermissions,
        root,
        { ...inside, path: join(physical, ".independum", "profile.json") },
        [protectedPath],
      ).decision,
    ).toBe("ask");
  }
  expect(policy.rules[0]).toBe(rule);
  expect(rule.project).toBe(project);
  expect(rule.resource).toMatchObject({ path: join(project, "new.txt") });
});

test("saved approvals match either project spelling and retain their identity limits", () => {
  const { project, directory } = createTestProject(folder, true);
  const path = join(directory, "outside.txt");
  writeFileSync(path, "sentinel");
  const resource: PathAccess = { kind: "path", path, scope: "file", access: "read" };
  const policy = approvedPolicy(project, resource);
  for (const root of [project, canonicalPermissionPath(project, project)]) {
    expect(hasSavedPermissionApproval(policy, root, resource)).toBe(true);
    expect(
      hasSavedPermissionApproval(policy, root, {
        ...resource,
        path: canonicalPermissionPath(path, project),
      }),
    ).toBe(true);
    expect(hasSavedPermissionApproval(policy, root, { ...resource, access: "write" })).toBe(false);
    expect(hasSavedPermissionApproval(policy, root, { ...resource, scope: "tree" })).toBe(false);
  }
  expect(policy.savedApprovals[0]).toMatchObject({ project, resource: { path } });
});

test("saved path approvals ignore parameter order but never widen access or follow replaced identities", () => {
  const target = join(folder, "approved.txt");
  writeFileSync(target, "Original.");
  const resource: PathAccess = { kind: "path", path: target, scope: "file", access: "read" };
  const policy = approvedPolicy(project, resource);
  expect(
    hasSavedPermissionApproval(policy, project, {
      access: "read",
      scope: "file",
      path: target,
      kind: "path",
    }),
  ).toBe(true);
  expect(hasSavedPermissionApproval(policy, project, { ...resource, access: "write" })).toBe(false);
  expect(hasSavedPermissionApproval(policy, project, { ...resource, scope: "tree" })).toBe(false);
  expect(hasSavedPermissionApproval(policy, join(folder, "other-project"), resource)).toBe(false);
  // A rounded file index lets a replacement match only for some pairs of indexes, so the
  // replacement repeats many times in a row.
  for (let round = 0; round < 200; round += 1) {
    const current = approvedPolicy(project, resource);
    renameSync(target, join(folder, `original-${round}.txt`));
    writeFileSync(target, "Replacement.");
    expect(hasSavedPermissionApproval(current, project, resource)).toBe(false);
  }
});

test("a replacement with the creation time of the file it replaces needs approval again", () => {
  const target = join(folder, "tunneled.txt");
  writeFileSync(target, "Original.");
  const original = lstatSync(target, { bigint: true });
  const resource: PathAccess = { kind: "path", path: target, scope: "file", access: "write" };
  const policy = approvedPolicy(project, resource);
  renameSync(target, join(folder, "tunneled-original.txt"));
  writeFileSync(target, "Replacement.");
  const replacement = lstatSync(target, { bigint: true });
  // Windows copies the creation time to a file recreated under the same name within 15 seconds.
  if (process.platform === "win32") {
    expect(replacement.birthtimeNs).toBe(original.birthtimeNs);
  }
  expect(JSON.parse(permissionResourceIdentity(resource))).toMatchObject({
    file: fileIdentity(replacement),
  });
  expect(hasSavedPermissionApproval(policy, project, resource)).toBe(false);
});

test("path approvals saved with rounded identities no longer match, while network approvals do", () => {
  const target = join(folder, "rounded.txt");
  writeFileSync(target, "Approved before exact identities.");
  const resource: PathAccess = { kind: "path", path: target, scope: "file", access: "read" };
  const information = lstatSync(target);
  // This is the identity that approvals saved before exact identities hold, with rounded numbers.
  const rounded = JSON.stringify({
    resource,
    canonical: target,
    ancestor: target,
    device: information.dev,
    inode: information.ino,
    created: information.birthtimeMs,
  });
  expect(
    hasSavedPermissionApproval(approvedPolicy(project, resource, rounded), project, resource),
  ).toBe(false);
  expect(hasSavedPermissionApproval(approvedPolicy(project, resource), project, resource)).toBe(
    true,
  );
  const network = { kind: "network" } as const;
  expect(hasSavedPermissionApproval(approvedPolicy(project, network), project, network)).toBe(true);
});

test("a file allow rule never authorizes a tree grant at the same path", () => {
  const path = join(folder, "outside");
  const rule: PermissionRule = {
    id: "one-file",
    effect: "allow",
    project: "*",
    resource: { ...inside, path },
  };
  const result = evaluatePermission(
    { ...builtInPermissions, rules: [rule] },
    project,
    { ...inside, path, scope: "tree" },
    [],
  );
  expect(result.decision).toBe("ask");
  expect(result.matches).toEqual([]);
});

test("all matching rules apply with deny before ask before allow", () => {
  const rules: PermissionRule[] = ["allow", "ask", "deny"].map((effect) => ({
    id: effect,
    project: "*",
    effect: effect as PermissionRule["effect"],
    resource: { ...inside, path: ".", scope: "tree" },
  }));
  for (const order of [rules, rules.toReversed()]) {
    const result = evaluatePermission({ ...builtInPermissions, rules: order }, project, inside, []);
    expect(result.decision).toBe("deny");
    expect(result.matches).toHaveLength(3);
  }
  expect(
    evaluatePermission({ ...builtInPermissions, rules: rules.slice(0, 2) }, project, inside, [])
      .decision,
  ).toBe("ask");
});

test("private denial precedes allow rules and active profile denials use real project paths", () => {
  const directory = join(folder, ".independum");
  const privateFolder = join(directory, "private");
  const denied = { ...inside, path: join(privateFolder, "secret.txt"), access: "read" } as const;
  const policy: PermissionPolicy = {
    ...builtInPermissions,
    rules: [
      { id: "allow", project: "*", effect: "allow", resource: denied },
      { id: "deny", project, effect: "deny", resource: { ...inside, access: "read" } },
      { id: "other-project", project: `${project}-other`, effect: "deny", resource: denied },
      { id: "write-only", project, effect: "deny", resource: inside },
    ],
  };
  for (const access of ["read", "write"] as const) {
    expect(
      evaluatePermission(policy, project, { ...denied, access }, [directory], [privateFolder])
        .decision,
    ).toBe("deny");
  }
  expect(deniedPermissionPaths(policy, project, directory)).toEqual([privateFolder, inside.path]);
});

test("state reads stay ordinary and every state write asks despite an allow rule", () => {
  const directory = join(project, "state");
  const denied = deniedPermissionPaths(builtInPermissions, project, directory);
  const policy: PermissionPolicy = {
    ...builtInPermissions,
    rules: [
      {
        id: "allow-state",
        project: "*",
        effect: "allow",
        resource: {
          ...inside,
          path: directory,
          scope: "tree",
        },
      },
    ],
  };
  for (const name of [
    "sessions/chat.jsonl",
    "outputs/chat/output.txt",
    "attachments/source/content",
    "profiles/default/observer.mjs",
    "settings.json",
  ]) {
    const resource = { ...inside, path: join(directory, name) };
    expect(
      evaluatePermission(policy, project, { ...resource, access: "read" }, [directory], denied)
        .decision,
    ).toBe("allow");
    expect(evaluatePermission(policy, project, resource, [directory], denied).decision).toBe("ask");
    expect(
      evaluatePermission(
        { ...policy, mode: "unrestricted", rules: [] },
        project,
        resource,
        [directory],
        denied,
      ).decision,
    ).toBe("allow");
  }
  const secret = { ...inside, path: join(directory, "private", "secret.txt") };
  expect(evaluatePermission(policy, project, secret, [directory], denied)).toMatchObject({
    decision: "deny",
    reason: `Independum's private folder is denied: ${join(directory, "private")}.`,
  });
});

test("version one permissions migrate without losing other policy settings", () => {
  const policy = {
    ...builtInPermissions,
    environment: "inherit" as const,
    rules: [{ id: "ask", project, effect: "ask" as const, resource: inside }],
  };
  expect(
    validatePermissionPolicy({
      ...policy,
      version: 1,
      runtimeApprovals: [
        {
          backend: "processcontainer",
          runtimeHash: `sha256:${"a".repeat(64)}`,
          approvedAt: "2026-11-06T00:00:00Z",
        },
      ],
    }),
  ).toEqual(policy);
  for (const value of ["2", null, true]) {
    expect(() => validatePermissionPolicy({ ...policy, version: value })).toThrow();
  }
});

test("write denial allows a separately permitted read and read denial prevents writes", () => {
  const policy: PermissionPolicy = {
    ...builtInPermissions,
    rules: [{ id: "block", project, effect: "deny", resource: inside }],
  };
  expect(evaluatePermission(policy, project, { ...inside, access: "read" }, []).decision).toBe(
    "allow",
  );
  policy.rules[0] = {
    ...(policy.rules[0] as PermissionRule),
    resource: { ...inside, access: "read" },
  };
  expect(evaluatePermission(policy, project, inside, []).decision).toBe("deny");
});

test("protected configuration asks even under allow rules and never overrides a denial", () => {
  const protectedPath = join(project, ".independum");
  const resource = { ...inside, path: join(protectedPath, "profile.json") };
  const allow: PermissionRule = {
    id: "allow",
    effect: "allow",
    project,
    resource: { ...inside, path: project, scope: "tree" },
  };
  const policy = { ...builtInPermissions, rules: [allow] };
  expect(evaluatePermission(policy, project, resource, [protectedPath]).decision).toBe("ask");
  expect(
    evaluatePermission(policy, project, { ...inside, path: project, scope: "tree" }, [
      protectedPath,
    ]).decision,
  ).toBe("ask");
  expect(
    evaluatePermission({ ...policy, rules: [{ ...allow, effect: "deny" }] }, project, resource, [
      protectedPath,
    ]).decision,
  ).toBe("deny");
});

test("policies reject malformed documents and profiles do not discard invalid denials", () => {
  const rule: PermissionRule = { id: "one", effect: "deny", project, resource: inside };
  for (const value of [
    null,
    {},
    { ...builtInPermissions, version: 3 },
    { ...builtInPermissions, extra: true },
    { ...builtInPermissions, rules: [rule, rule] },
    { ...builtInPermissions, rules: [{ ...rule, resource: { ...inside, extra: true } }] },
    { ...builtInPermissions, mode: "unrestricted", rules: [rule] },
    {
      ...builtInPermissions,
      runtimeApprovals: [
        { project, backend: "bubblewrap", runtimeHash: "wrong", approvedAt: "today" },
      ],
    },
  ]) {
    expect(() => validatePermissionPolicy(value)).toThrow();
    expect(() =>
      validateProfileBundle(
        {
          profile: { formatVersion: 1, name: "Test", settings: { permissions: value } },
          systemPrompt: null,
          modelTexts: null,
        },
        folder,
      ),
    ).toThrow();
  }
  expect(validatePermissionPolicy(structuredClone(builtInPermissions))).toEqual(builtInPermissions);
  expect(
    validateProfileBundle(
      {
        profile: { formatVersion: 1, name: "Test", settings: { permissions: builtInPermissions } },
        systemPrompt: null,
        modelTexts: null,
      },
      folder,
    ).profile.settings?.permissions,
  ).toEqual(builtInPermissions);
});

test("canonical paths resolve junctions and missing tails before policy matching", () => {
  const outside = join(folder, "reference");
  mkdirSync(outside);
  writeFileSync(join(outside, "sentinel.txt"), "sentinel");
  const linked = join(project, "linked");
  symlinkSync(outside, linked, process.platform === "win32" ? "junction" : "dir");
  expect(canonicalPermissionPath(join(linked, "new", "file.txt"), project)).toBe(
    join(outside, "new", "file.txt"),
  );
  expect(
    evaluatePermission(
      builtInPermissions,
      project,
      { ...inside, path: canonicalPermissionPath(join(linked, "sentinel.txt"), project) },
      [],
    ).decision,
  ).toBe("ask");
  if (process.platform === "win32") {
    expect(canonicalPermissionPath("./a/../file.txt", project)).toBe(inside.path);
    for (const path of ["file.txt:stream", "file.txt.", "\\\\?\\C:\\device"]) {
      expect(() => canonicalPermissionPath(path, project)).toThrow();
    }
  }
});
