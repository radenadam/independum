import { readFileSync, renameSync, writeFileSync } from "node:fs";
import { writeFile } from "node:fs/promises";
import { join } from "node:path";
import { expect, test, vi } from "vitest";
import { waitFor } from "../../../scripts/wait-for.ts";
import { systemPromptText } from "./agent-texts.ts";
import type { ProfileBundle, ProfileReference } from "./api-types.ts";
import {
  configurationRevision,
  jsonConfiguration,
  withConfigurationLock,
  writeConfigurationFiles,
} from "./configuration-files.ts";
import {
  parseConfigurationJson,
  validateProfileBundle,
  validateProfileId,
} from "./configuration-schema.ts";
import { createProfileStore, projectIdOf } from "./create-profile-store.ts";
import { builtInSettings } from "./read-settings-change.ts";
import { createTestFolder, createTestProject } from "./tools/create-test-folder.ts";

vi.mock("node:fs/promises", { spy: true });

const folder = createTestFolder("profiles");
const defaultReference: ProfileReference = { scope: "user", id: "default" };

function bundle(name = "Research"): ProfileBundle {
  return { profile: { formatVersion: 1, name }, systemPrompt: null, modelTexts: null };
}

async function setup() {
  const { directory, project } = createTestProject(folder);
  const store = await createProfileStore(directory, [project], []);
  return { store, directory, project, projectId: projectIdOf(project) };
}

test("fresh settings create real files and resolve explicit, project, and user defaults", async () => {
  const { store, project, projectId } = await setup();
  try {
    expect(store.user().document).toEqual({ formatVersion: 1, defaultProfile: defaultReference });
    const reference: ProfileReference = { scope: "project", id: "default" };
    await store.putProfile(reference, projectId, bundle(), "*");
    await chooseProjectDefault(store, projectId, reference);
    expect(store.newChoices(project).profile).toEqual(reference);
    expect(store.newChoices(project, defaultReference).profile).toEqual(defaultReference);
    expect(store.profile(defaultReference, projectId).document?.profile.name).toBe("Default");
    expect(store.profile(reference, projectId).document?.profile.name).toBe("Research");
    expect(() => store.newChoices(project, { scope: "user", id: "missing" })).toThrow("missing");
  } finally {
    store.close();
  }
});

test("startup approvals migrate out of user and project profiles without changing other files", async () => {
  const { store, project, directory, projectId } = await setup();
  const references: ProfileReference[] = [defaultReference, { scope: "project", id: "research" }];
  const paths: string[] = [];
  for (const reference of references) {
    if (reference.scope === "project") {
      await store.putProfile(reference, projectId, bundle(), "*");
    }
    const resource = store.profile(reference, projectId);
    const path = join(resource.path, "profile.json");
    const profile = {
      ...resource.document?.profile,
      settings: {
        environment: { example: "kept" },
        disabledTools: ["Edit"],
        permissions: {
          ...builtInSettings.permissions,
          version: 1,
          environment: "inherit",
          runtimeApprovals: [
            {
              backend: "processcontainer",
              runtimeHash: `sha256:${"a".repeat(64)}`,
              approvedAt: "2026-11-06T00:00:00Z",
            },
          ],
          savedApprovals: [
            {
              id: "network",
              project,
              resource: { kind: "network" },
              identity: '{"kind":"network"}',
              approvedAt: "2026-11-06T00:00:00Z",
            },
          ],
          rules: [
            {
              id: "private",
              effect: "deny",
              project: "*",
              resource: {
                kind: "path",
                path: join(project, "private"),
                scope: "tree",
                access: "read",
              },
            },
          ],
        },
      },
    };
    writeFileSync(path, JSON.stringify(profile));
    writeFileSync(join(resource.path, "SYSTEM.md"), "Exact system prompt.\n");
    paths.push(path);
  }
  store.close();
  const reopened = await createProfileStore(directory, [project], []);
  try {
    for (const [index, reference] of references.entries()) {
      const resource = reopened.profile(reference, projectId);
      expect(resource.issues).toEqual([]);
      expect(resource.document?.profile.settings).toMatchObject({
        environment: { example: "kept" },
        disabledTools: ["Edit"],
        permissions: {
          version: 2,
          environment: "inherit",
          savedApprovals: [{ id: "network" }],
          rules: [{ id: "private" }],
        },
      });
      expect(resource.document?.systemPrompt).toBe("Exact system prompt.\n");
      expect(readFileSync(paths[index] ?? "", "utf8")).not.toContain("runtimeApprovals");
    }
  } finally {
    reopened.close();
  }
});

test("a saved chat keeps its profile after either default changes", async () => {
  const { store, project, projectId } = await setup();
  try {
    const choices = store.newChoices(project);
    store.keepChoices("saved", choices);
    await store.saveChoices("saved");
    const reference: ProfileReference = { scope: "user", id: "other" };
    await store.putProfile(reference, projectId, bundle("Other"), "*");
    await store.putUser({ formatVersion: 1, defaultProfile: reference }, store.user().revision);
    await chooseProjectDefault(store, projectId, reference);
    expect(store.newChoices(project).profile).toEqual(reference);
    expect(store.resolve("saved", project).profile.reference).toEqual(defaultReference);
    expect(store.profile(defaultReference, projectId).usedBy).toEqual(["saved"]);
  } finally {
    store.close();
  }
});

test("settings start from their defaults and keep each change across a restart", async () => {
  const { store, directory, project, projectId } = await setup();
  expect(store.preview(defaultReference, projectId).settings).toEqual(builtInSettings);
  const edited = bundle();
  edited.profile.settings = {
    shell: "bash",
    disabledTools: ["Shell"],
    disabledFacts: ["facts.pi"],
    modelOverrides: { provider: { model: { contextWindow: 200_000, temperature: 0.4 } } },
    compaction: { isEnabled: false, reserveTokens: 600, keepRecentTokens: 300 },
  };
  edited.modelTexts = {
    formatVersion: 1,
    texts: { "shell.description": { text: "Runs it.", builtIn: "Runs a command." } },
  };
  try {
    await saveDefaultProfile(store, projectId, edited);
    await store.putUser(
      { ...store.user().document, knowledgeCutoffs: { provider: { model: "2026-04" } } },
      store.user().revision,
    );
  } finally {
    store.close();
  }
  const restarted = await createProfileStore(directory, [project], []);
  try {
    expect(restarted.preview(defaultReference, projectId).settings).toMatchObject({
      ...edited.profile.settings,
      texts: edited.modelTexts.texts,
      knowledgeCutoffs: { provider: { model: "2026-04" } },
    });
  } finally {
    restarted.close();
  }
});

test("overlapping saves persist in order and a failed save does not block the next one", async () => {
  const { store, directory, project, projectId } = await setup();
  const other: ProfileReference = { scope: "user", id: "other" };
  await store.putProfile(other, projectId, bundle("Other"), "*");
  const original = await vi.importActual<typeof import("node:fs/promises")>("node:fs/promises");
  const started = Promise.withResolvers<void>();
  const release = Promise.withResolvers<void>();
  const writeCount = vi.mocked(writeFile).mock.calls.length;
  vi.mocked(writeFile).mockImplementationOnce(async (...arguments_) => {
    started.resolve();
    await release.promise;
    await original.writeFile(...arguments_);
  });
  try {
    const first = saveDefaultProfile(store, projectId, bundle("First"));
    await started.promise;
    const second = store.putProfile(
      other,
      projectId,
      bundle("Second"),
      store.profile(other, projectId).revision,
    );
    try {
      expect(writeFile).toHaveBeenCalledTimes(writeCount + 1);
    } finally {
      release.resolve();
      await Promise.all([first, second]);
    }
    expect(store.profile(defaultReference, projectId).document?.profile.name).toBe("First");
    vi.mocked(writeFile).mockRejectedValueOnce(new Error("The disk is full."));
    await expect(saveDefaultProfile(store, projectId, bundle("Failed"))).rejects.toThrow(
      "The disk is full.",
    );
    expect(store.profile(defaultReference, projectId).document?.profile.name).toBe("First");
    await saveDefaultProfile(store, projectId, bundle("Recovered"));
  } finally {
    release.resolve();
    vi.mocked(writeFile).mockRestore();
    store.close();
  }
  const restarted = await createProfileStore(directory, [project], []);
  try {
    expect(restarted.profile(defaultReference, projectId).document?.profile.name).toBe("Recovered");
    expect(restarted.profile(other, projectId).document?.profile.name).toBe("Second");
  } finally {
    restarted.close();
  }
});

test("overlapping tool choices reject a stale save and keep both choices after rereading", async () => {
  const { store, projectId } = await setup();
  try {
    const revision = store.profile(defaultReference, projectId).revision;
    const read = bundle();
    read.profile.settings = { disabledTools: ["Read"] };
    const write = bundle();
    write.profile.settings = { disabledTools: ["Write"] };
    const first = store.putProfile(defaultReference, projectId, read, revision);
    const second = store.putProfile(defaultReference, projectId, write, revision);
    await expect(first).resolves.toBeUndefined();
    await expect(second).rejects.toMatchObject({ status: 412 });
    const current = store.profile(defaultReference, projectId);
    expect(current.document?.profile.settings?.disabledTools).toEqual(["Read"]);
    write.profile.settings.disabledTools = ["Read", "Write"];
    await store.putProfile(defaultReference, projectId, write, current.revision);
    expect(store.preview(defaultReference, projectId).settings.disabledTools).toEqual([
      "Read",
      "Write",
    ]);
    write.profile.settings.disabledTools = ["Write"];
    await saveDefaultProfile(store, projectId, write);
    expect(store.preview(defaultReference, projectId).settings.disabledTools).toEqual(["Write"]);
  } finally {
    store.close();
  }
});

test("profile settings and chat choices resolve whole values without inheritance", async () => {
  const { store, project, projectId } = await setup();
  try {
    const edited = bundle();
    edited.profile.settings = {
      model: { providerId: "provider", modelId: "model" },
      thinkingLevel: "high",
      environment: { example: "one" },
      compaction: { isEnabled: false, reserveTokens: 0, keepRecentTokens: 0 },
    };
    await saveDefaultProfile(store, projectId, edited);
    store.keepChoices("chat", {
      ...store.newChoices(project),
      overrides: { model: null, thinkingLevel: null },
    });
    const resolved = store.resolve("chat", project);
    expect(resolved.model).toBeNull();
    expect(resolved.thinkingLevel).toBeNull();
    expect(resolved.settings.environment).toEqual({ example: "one" });
    expect(resolved.settings.outputLimits).toEqual({ maxLines: 2000, maxBytes: 51200 });
    expect(resolved.settings.compaction.reserveTokens).toBe(0);
  } finally {
    store.close();
  }
});

test("migration preserves every runtime field and text baseline with its original backup", async () => {
  const { directory, project, store } = await setup();
  store.close();
  const legacy = {
    shell: "bash",
    disabledTools: ["Write"],
    disabledFacts: ["facts.pi"],
    outputLimits: { maxLines: 50, maxBytes: 4096 },
    handBackSeconds: 5,
    environment: { example: "value" },
    knowledgeCutoffs: { provider: { model: "2026-04" } },
    modelOverrides: {
      provider: { model: { contextWindow: 80000, maxOutput: 1000, temperature: 0 } },
    },
    compaction: { isEnabled: false, reserveTokens: 0, keepRecentTokens: 0 },
    texts: {
      systemPrompt: { text: "Exact\r\nprompt\n", builtIn: "Old base." },
      "shell.exited": { text: "Done {code}.", builtIn: "Old result." },
    },
  };
  const original = `\uFEFF${JSON.stringify(legacy)}`;
  writeFileSync(join(directory, "settings.json"), original);
  const migrated = await createProfileStore(
    directory,
    [project],
    [
      {
        id: "archived",
        folder: project,
        overrides: { model: { providerId: "gone", modelId: "saved" }, thinkingLevel: "low" },
      },
    ],
  );
  try {
    expect(migrated.user().document?.defaultProfile.id).toBe("migrated-settings");
    expect(
      readFileSync(join(directory, "migrations", "settings-before-profiles.json"), "utf8"),
    ).toBe(original);
    const resolved = migrated.resolve("archived", project);
    expect(resolved.model).toEqual({ providerId: "gone", modelId: "saved" });
    expect(resolved.settings.texts.systemPrompt).toEqual(legacy.texts.systemPrompt);
    expect(resolved.settings.texts["shell.exited"]).toEqual(legacy.texts["shell.exited"]);
    expect(resolved.settings.knowledgeCutoffs).toEqual(legacy.knowledgeCutoffs);
    expect(resolved.settings.modelOverrides).toEqual(legacy.modelOverrides);
    expect(resolved.settings.environment).toEqual(legacy.environment);
    expect(resolved.settings.outputLimits).toEqual(legacy.outputLimits);
    expect(resolved.settings.compaction).toEqual(legacy.compaction);
    expect(resolved.settings.disabledTools).toEqual(legacy.disabledTools);
    expect(resolved.settings.disabledFacts).toEqual(legacy.disabledFacts);
    expect(resolved.settings.handBackSeconds).toBe(5);
  } finally {
    migrated.close();
  }
  const restarted = await createProfileStore(directory, [project], []);
  expect(restarted.user().document?.defaultProfile.id).toBe("migrated-settings");
  restarted.close();
});

test("invalid legacy settings remain unchanged and never migrate dropped content", async () => {
  for (const text of [
    '{"shell":"fish"}',
    '{"unknown":1}',
    '{"shell":"bash","shell":null}',
    '{"shell":',
  ]) {
    const { directory, project, store } = await setup();
    store.close();
    writeFileSync(join(directory, "settings.json"), text);
    const broken = await createProfileStore(directory, [project], []);
    try {
      expect(broken.user().issues.length).toBeGreaterThan(0);
      expect(readFileSync(join(directory, "settings.json"), "utf8")).toBe(text);
      expect(() => broken.newChoices(project)).toThrow();
    } finally {
      broken.close();
    }
  }
});

test("a text editor replacement reaches the watcher and changes disk revision without rebuilding for formatting", async () => {
  const { store, project, projectId } = await setup();
  try {
    store.keepChoices("chat", store.newChoices(project));
    const before = store.resolve("chat", project);
    let changes = 0;
    const stop = store.subscribe(() => {
      changes += 1;
    });
    const path = join(before.profile.path, "profile.json");
    const staged = join(before.profile.path, "editor-save.json");
    writeFileSync(staged, JSON.stringify(before.profile.document?.profile));
    renameSync(staged, path);
    await waitFor(() => expect(changes).toBeGreaterThan(0));
    const after = store.resolve("chat", project);
    expect(after.profile.revision).not.toBe(before.profile.revision);
    expect(after.effectiveRevision).toBe(before.effectiveRevision);
    const bundle = store.profile(defaultReference, projectId).document;
    if (bundle === null) {
      throw new Error("The profile is missing.");
    }
    bundle.systemPrompt = "An external prompt.\r\n";
    writeFileSync(join(before.profile.path, "SYSTEM.md"), `\uFEFF${bundle.systemPrompt}`);
    expect(store.resolve("chat", project).settings.texts.systemPrompt?.text).toBe(
      bundle.systemPrompt,
    );
    stop();
  } finally {
    store.close();
  }
});

test("invalid used profiles block resolution and leave unrelated profiles usable", async () => {
  const { store, project, projectId } = await setup();
  try {
    const other: ProfileReference = { scope: "user", id: "other" };
    await store.putProfile(other, projectId, bundle(), "*");
    store.keepChoices("broken", store.newChoices(project));
    store.keepChoices("working", store.newChoices(project, other));
    const path = join(store.profile(defaultReference, projectId).path, "profile.json");
    writeFileSync(path, '{"formatVersion":1,"name":"Broken","settings":{"handBackSeconds":2}}');
    const broken = store.resolve("broken", project);
    expect(broken.issues[0]?.pointer).toBe("/settings/handBackSeconds");
    expect(store.resolve("working", project).issues).toEqual([]);
  } finally {
    store.close();
  }
});

test("concurrent and stale profile saves require their original revision", async () => {
  const { store, projectId } = await setup();
  try {
    const revision = store.profile(defaultReference, projectId).revision;
    const results = await Promise.allSettled([
      store.putProfile(defaultReference, projectId, bundle("First"), revision),
      store.putProfile(defaultReference, projectId, bundle("Second"), revision),
    ]);
    expect(results.map((result) => result.status).sort()).toEqual(["fulfilled", "rejected"]);
    await expect(
      store.putProfile(defaultReference, projectId, bundle(), revision),
    ).rejects.toMatchObject({ status: 412 });
    await expect(
      store.putProfile(defaultReference, projectId, bundle(), undefined),
    ).rejects.toMatchObject({ status: 428 });
    await expect(
      store.putProfile(defaultReference, projectId, bundle(), "*"),
    ).rejects.toMatchObject({ status: 412 });
  } finally {
    store.close();
  }
});

test("empty system prompts and unknown baselines survive while built-in text removes an edit", async () => {
  const { store, projectId } = await setup();
  try {
    const edited = bundle();
    edited.systemPrompt = "";
    edited.modelTexts = {
      formatVersion: 1,
      texts: { "shell.parameters.command": { text: "Exact command." } },
    };
    await saveDefaultProfile(store, projectId, edited);
    expect(store.profile(defaultReference, projectId).document).toEqual(edited);
    edited.systemPrompt = systemPromptText.builtIn;
    await saveDefaultProfile(store, projectId, edited);
    expect(store.profile(defaultReference, projectId).document?.systemPrompt).toBeNull();
  } finally {
    store.close();
  }
});

test("strict json reports duplicate pointers, malformed syntax, and unsupported profile fields", () => {
  expect(parseConfigurationJson('\uFEFF{"name":"\\u4e00"}', "profile.json")).toEqual({
    name: "\u4e00",
  });
  expect(() =>
    parseConfigurationJson('{"settings":{"shell":null,"shell":"bash"}}', "profile.json"),
  ).toThrow("/settings/shell");
  for (const text of ['{"x":1,}', "{/* comment */}", '{"x":01}', "{} extra"]) {
    expect(() => parseConfigurationJson(text, "file.json")).toThrow("Line 1, column");
  }
  expect(() =>
    validateProfileBundle({ ...bundle(), profile: { formatVersion: 2, name: "Name" } }, folder),
  ).toThrow("/formatVersion");
  expect(() =>
    validateProfileBundle(
      { ...bundle(), profile: { formatVersion: 1, name: "Name", settings: { unsupported: true } } },
      folder,
    ),
  ).toThrow("/settings/unsupported");
  expect(() =>
    validateProfileBundle(
      {
        ...bundle(),
        profile: { formatVersion: 1, name: "Name", settings: { disabledTools: ["Read", "Read"] } },
      },
      folder,
    ),
  ).toThrow("/settings/disabledTools");
});

test("portable ids reject traversal and reserved windows names", () => {
  for (const id of ["../escape", "A", "two--words", "con", "nul", "com1", "lpt9", "a".repeat(65)]) {
    expect(() => validateProfileId(id)).toThrow();
  }
  expect(() => validateProfileId("math-research-2")).not.toThrow();
});

test("prepared transactions recover once and retain conflicting editor versions", async () => {
  const { directory, store } = await setup();
  store.close();
  const target = join(directory, "settings.json");
  writeFileSync(target, "old");
  const staged = ".configuration-abcdef-0.new";
  const backup = ".configuration-abcdef-0.old";
  writeFileSync(join(directory, staged), "new");
  writeFileSync(join(directory, backup), "old");
  const journal = join(directory, ".configuration-transaction.json");
  const entry = {
    path: "settings.json",
    before: configurationRevision(["old"]),
    after: configurationRevision(["new"]),
    staged,
    backup,
    isDeletion: false,
  };
  writeFileSync(journal, jsonConfiguration([entry]));
  await withConfigurationLock(directory, async () => undefined);
  expect(readFileSync(target, "utf8")).toBe("new");
  writeFileSync(join(directory, staged), "new");
  writeFileSync(join(directory, backup), "old");
  writeFileSync(journal, jsonConfiguration([entry]));
  writeFileSync(target, "external");
  await expect(withConfigurationLock(directory, async () => undefined)).rejects.toMatchObject({
    status: 409,
  });
  expect(readFileSync(target, "utf8")).toBe("external");
  expect(readFileSync(join(directory, staged), "utf8")).toBe("new");
  expect(readFileSync(join(directory, backup), "utf8")).toBe("old");
});

test("a write refuses escaping paths before staging them", async () => {
  const { directory, store } = await setup();
  store.close();
  await expect(
    withConfigurationLock(directory, () =>
      writeConfigurationFiles(directory, [
        { path: join(directory, "..", "escaped.json"), content: "{}" },
      ]),
    ),
  ).rejects.toThrow("leaves its managed folder");
});

async function chooseProjectDefault(
  store: import("./create-profile-store.ts").ProfileStore,
  projectId: string,
  profile: ProfileReference,
): Promise<void> {
  await store.putProject(
    projectId,
    { formatVersion: 1, profile },
    store.project(projectId).revision,
  );
}

async function saveDefaultProfile(
  store: import("./create-profile-store.ts").ProfileStore,
  projectId: string,
  value: ProfileBundle,
): Promise<void> {
  await store.putProfile(
    defaultReference,
    projectId,
    value,
    store.profile(defaultReference, projectId).revision,
  );
}
