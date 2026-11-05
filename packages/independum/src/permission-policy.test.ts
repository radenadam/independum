import { mkdirSync, renameSync, symlinkSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { expect, test } from "vitest";
import { validateProfileBundle } from "./configuration-schema.ts";
import {
  builtInPermissions,
  canonicalPermissionPath,
  containsPermissionPath,
  evaluatePermission,
  hasSavedPermissionApproval,
  type PathAccess,
  type PermissionPolicy,
  type PermissionRule,
  permissionResourceIdentity,
  validatePermissionPolicy,
} from "./permission-policy.ts";
import { createTestFolder } from "./tools/create-test-folder.ts";

const folder = canonicalPermissionPath(createTestFolder("permission-policy"), process.cwd());
const project = join(folder, "project");
mkdirSync(project);
const inside = {
  kind: "path",
  path: join(project, "file.txt"),
  scope: "file",
  access: "write",
} as const;

test("project defaults use components and ask for outside paths and network", () => {
  expect(evaluatePermission(builtInPermissions, project, inside, []).decision).toBe("allow");
  expect(containsPermissionPath(project, `${project}-neighbor`)).toBe(false);
  for (const resource of [
    { ...inside, path: `${project}-neighbor` },
    { kind: "network" } as const,
  ]) {
    expect(evaluatePermission(builtInPermissions, project, resource, []).decision).toBe("ask");
  }
});

test("saved path approvals ignore parameter order but never widen access or follow replaced identities", () => {
  const target = join(folder, "approved.txt");
  writeFileSync(target, "Original.");
  const resource: PathAccess = { kind: "path", path: target, scope: "file", access: "read" };
  const policy: PermissionPolicy = {
    ...builtInPermissions,
    savedApprovals: [
      {
        id: "file",
        project,
        resource,
        identity: permissionResourceIdentity(resource),
        approvedAt: new Date().toISOString(),
      },
    ],
  };
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
  renameSync(target, join(folder, "original.txt"));
  writeFileSync(target, "Replacement.");
  expect(hasSavedPermissionApproval(policy, project, resource)).toBe(false);
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
    { ...builtInPermissions, version: 2 },
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
