import { mkdirSync, renameSync, symlinkSync, unlinkSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { expect, test } from "vitest";
import { createApprovals } from "./create-approvals.ts";
import { createContextPermissions } from "./create-context-permissions.ts";
import { createModelTexts } from "./model-texts.ts";
import { builtInPermissions } from "./permission-policy.ts";
import { builtInContext } from "./read-context-settings.ts";
import { resolveContext, saveContextResource } from "./resolve-context.ts";
import { createTestFolder, createTestProject } from "./tools/create-test-folder.ts";

const parent = createTestFolder("context-permissions");

function fixture(): {
  permissions: ReturnType<typeof createContextPermissions>;
  approvals: ReturnType<typeof createApprovals>;
  options: Parameters<typeof resolveContext>[0];
  policy: typeof builtInPermissions;
  external: string;
  changeRevision: () => void;
} {
  const { directory, project } = createTestProject(parent, true);
  const external = join(directory, "external");
  mkdirSync(external);
  const policy = structuredClone(builtInPermissions);
  policy.rules.push({
    id: "ask-external",
    project,
    effect: "ask",
    resource: { kind: "path", path: external, scope: "tree", access: "read" },
  });
  const approvals = createApprovals();
  let revision = "original";
  const permissions = createContextPermissions({
    project,
    directory: join(directory, "state"),
    chatId: "chat",
    approvals,
    policy: () => policy,
    profileName: () => "Default",
    revision: () => revision,
    branch: () => "branch",
    onChange: () => undefined,
    audit: () => undefined,
  });
  return {
    permissions,
    approvals,
    policy,
    external,
    changeRevision: () => {
      revision = "changed";
    },
    options: {
      projectRoot: project,
      folder: project,
      userDirectory: join(directory, "state"),
      profileDirectory: join(directory, "profile"),
      settings: structuredClone(builtInContext),
      texts: createModelTexts(() => ({})),
      permission: permissions.check,
    },
  };
}

test("external command sources remain unread until the shared approval service allows their exact read", async () => {
  const { options, permissions, approvals, external } = fixture();
  const source = join(external, "review.md");
  const contents = "---\ndescription: Review data.\n---\nExternal instructions.";
  writeFileSync(source, contents);
  options.settings.slashCommands.paths = [source];
  const unread = resolveContext(options).resources[0];
  expect(unread?.state).toBe("needsPermission");
  expect(unread?.source).toBe("");
  expect(unread?.fingerprint).toBe("");
  const waiting = permissions.request(source, "file", "read");
  const approval = approvals.pending()[0];
  expect(approval?.resources).toEqual([
    { kind: "path", path: source, scope: "file", access: "read" },
  ]);
  expect(await approvals.resolve(approval?.id ?? "", approval?.revision ?? "", "allow")).toBe(200);
  expect(await waiting).toBe(true);
  const resource = resolveContext(options).resources[0];
  expect(resource).toMatchObject({ state: "enabled", source: contents });
  await expect(
    saveContextResource(options, resource?.id ?? "", resource?.fingerprint ?? "", "Changed."),
  ).rejects.toThrow("write permission");
});

test("default context reads outside the project need no approval and outside writes still ask", async () => {
  const { permissions, approvals, external, policy } = fixture();
  policy.rules = [];
  expect(permissions.check(external, "tree")).toBe(true);
  expect(await permissions.request(external, "tree", "read")).toBe(true);
  expect(approvals.pending()).toEqual([]);
  expect(permissions.check(external, "tree", "write")).toBe(false);
});

test("external skill directories ask for tree access before enumeration", async () => {
  const { options, permissions, approvals, external } = fixture();
  const folder = join(external, "review");
  mkdirSync(folder);
  writeFileSync(
    join(folder, "SKILL.md"),
    "---\nname: review\ndescription: Review data.\n---\nExact body.\n",
  );
  mkdirSync(options.profileDirectory, { recursive: true });
  const alias = join(options.profileDirectory, "linked-skills");
  symlinkSync(external, alias, "junction");
  options.settings.skills.paths = [alias];
  expect(resolveContext(options).resources[0]).toMatchObject({
    state: "needsPermission",
    permissionScope: "tree",
    source: "",
  });
  const waiting = permissions.request(external, "tree", "read");
  const approval = approvals.pending()[0];
  await approvals.resolve(approval?.id ?? "", approval?.revision ?? "", "allow");
  expect(await waiting).toBe(true);
  expect(resolveContext(options).resources[0]).toMatchObject({
    state: "enabled",
    name: "review",
    body: "Exact body.\n",
  });
});

test("denial cancellation and changed profile revisions grant no context access", async () => {
  for (const outcome of ["deny", "cancel", "change"] as const) {
    const { permissions, approvals, external, changeRevision } = fixture();
    const controller = new AbortController();
    const waiting = permissions.request(external, "tree", "read", controller.signal);
    const approval = approvals.pending()[0];
    if (outcome === "cancel") {
      controller.abort();
      await expect(waiting).rejects.toThrow();
    } else {
      if (outcome === "change") {
        changeRevision();
      }
      expect(
        await approvals.resolve(
          approval?.id ?? "",
          approval?.revision ?? "",
          outcome === "deny" ? "deny" : "allow",
        ),
      ).toBe(outcome === "change" ? 409 : 200);
      expect(await waiting).toBe(false);
    }
    expect(permissions.check(external, "tree")).toBe(false);
  }
});

test("context tree grants match real locations and expire when their junction changes", async () => {
  const { permissions, approvals, external, options, policy } = fixture();
  policy.rules.push({
    id: "ask-profile",
    project: "*",
    effect: "ask",
    resource: { kind: "path", path: options.profileDirectory, scope: "tree", access: "read" },
  });
  mkdirSync(options.profileDirectory);
  const alias = join(options.profileDirectory, "alias");
  symlinkSync(external, alias, "junction");
  const source = join(external, "source.md");
  writeFileSync(source, "Original.");
  const waiting = permissions.request(alias, "tree", "read");
  const approval = approvals.pending()[0];
  expect(approval?.resources).toEqual([
    { kind: "path", path: alias, scope: "tree", access: "read" },
  ]);
  expect(await approvals.resolve(approval?.id ?? "", approval?.revision ?? "", "allow")).toBe(200);
  expect(await waiting).toBe(true);
  expect(permissions.check(source, "file")).toBe(true);
  expect(permissions.check(join(alias, "source.md"), "file")).toBe(true);
  unlinkSync(alias);
  symlinkSync(options.profileDirectory, alias, "junction");
  expect(permissions.check(source, "file")).toBe(false);
  expect(permissions.check(alias, "tree")).toBe(false);
});

test("context grants expire when an approved identity is replaced and deny rules beat grants", async () => {
  const { permissions, approvals, external, policy, options } = fixture();
  const source = join(external, "source.md");
  writeFileSync(source, "Original.");
  const waiting = permissions.request(source, "file", "read");
  const approval = approvals.pending()[0];
  await approvals.resolve(approval?.id ?? "", approval?.revision ?? "", "allow");
  expect(await waiting).toBe(true);
  policy.rules.push({
    id: "deny",
    project: options.projectRoot,
    effect: "deny",
    resource: { kind: "path", path: source, scope: "file", access: "read" },
  });
  expect(() => permissions.check(source, "file")).toThrow("permission rule denies");
  policy.rules = policy.rules.filter((rule) => rule.id !== "deny");
  renameSync(source, join(external, "original.md"));
  writeFileSync(source, "Replacement.");
  expect(permissions.check(source, "file")).toBe(false);
});
