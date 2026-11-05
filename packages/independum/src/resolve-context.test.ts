import {
  linkSync,
  mkdirSync,
  mkdtempSync,
  readFileSync,
  realpathSync,
  symlinkSync,
  writeFileSync,
} from "node:fs";
import { basename, dirname, join } from "node:path";
import { expect, test } from "vitest";
import { createModelTexts } from "./model-texts.ts";
import { builtInContext } from "./read-context-settings.ts";
import { type ContextScope, resolveContext, saveContextResource } from "./resolve-context.ts";
import { createTestFolder } from "./tools/create-test-folder.ts";

const parent = createTestFolder("context-discovery");

function setup(isLinked = false): ContextScope {
  const root = mkdtempSync(join(parent, "case-"));
  const location = isLinked ? join(parent, `linked-${basename(root)}`) : root;
  if (isLinked) {
    symlinkSync(root, location, "junction");
  }
  const projectRoot = join(location, "project");
  const userDirectory = join(location, "state");
  const profileDirectory = join(userDirectory, "profiles", "research");
  mkdirSync(projectRoot);
  mkdirSync(profileDirectory, { recursive: true });
  return {
    projectRoot,
    folder: projectRoot,
    userDirectory,
    profileDirectory,
    settings: structuredClone(builtInContext),
    texts: createModelTexts(() => ({})),
  };
}

function skill(root: string, description = "Review supplied data.", metadata = ""): void {
  mkdirSync(join(root, "review"), { recursive: true });
  writeFileSync(
    join(root, "review", "SKILL.md"),
    `---\nname: review\ndescription: ${description}\n${metadata}---\n\nBody with exact spacing.\n\n`,
  );
}

test("instructions use every configured name from project root through the folder without imports", () => {
  const options = setup();
  writeFileSync(join(parent, "AGENTS.md"), "Outside ancestor.");
  options.folder = join(options.projectRoot, "nested");
  mkdirSync(options.folder);
  writeFileSync(join(options.projectRoot, "AGENTS.md"), "Root facts.");
  writeFileSync(join(options.projectRoot, "CLAUDE.md"), "@another.md");
  writeFileSync(join(options.folder, "AGENTS.md"), "Nested facts.");
  const captured = resolveContext(options);
  expect(captured.resources.map((resource) => resource.source)).toEqual([
    "Root facts.",
    "@another.md",
    "Nested facts.",
  ]);
  expect(captured.renderedInstructions).not.toContain("Outside ancestor.");
});

test("a project reached through a linked folder reads its instructions", () => {
  const options = setup();
  writeFileSync(join(options.projectRoot, "AGENTS.md"), "Linked facts.");
  const link = join(parent, `link-${Date.now()}`);
  symlinkSync(dirname(options.projectRoot), link, "junction");
  options.projectRoot = join(link, "project");
  options.folder = options.projectRoot;
  options.userDirectory = join(link, "state");
  options.profileDirectory = join(link, "state", "profiles", "research");
  const captured = resolveContext(options);
  expect(captured.resources.map((resource) => [resource.source, resource.state])).toEqual([
    ["Linked facts.", "enabled"],
  ]);
  expect(captured.resources[0]?.path).toBe(join(options.projectRoot, "AGENTS.md"));
});

test("linked chat folders use their real project ancestors and preserve their paths", () => {
  const options = setup(true);
  const nested = join(options.projectRoot, "nested");
  const folder = join(nested, "chat");
  mkdirSync(folder, { recursive: true });
  writeFileSync(join(options.projectRoot, "AGENTS.md"), "Root facts.");
  writeFileSync(join(nested, "CLAUDE.md"), "Nested facts.");
  writeFileSync(join(folder, "AGENTS.md"), "Chat facts.");
  options.folder = join(parent, `chat-${basename(dirname(options.projectRoot))}`);
  symlinkSync(folder, options.folder, "junction");
  expect(
    resolveContext(options).resources.map((resource) => [resource.path, resource.source]),
  ).toEqual([
    [join(options.projectRoot, "AGENTS.md"), "Root facts."],
    [join(nested, "CLAUDE.md"), "Nested facts."],
    [join(options.folder, "AGENTS.md"), "Chat facts."],
  ]);
});

test.each([false, true])(
  "byte equality preserves line endings and the first file supplies identical content with junction %s",
  (isLinked) => {
    const options = setup(isLinked);
    writeFileSync(join(options.projectRoot, "AGENTS.md"), "Same\r\n");
    writeFileSync(join(options.projectRoot, "CLAUDE.md"), "Same\r\n");
    let captured = resolveContext(options);
    expect(captured.resources.map((resource) => resource.state)).toEqual(["enabled", "duplicate"]);
    expect(captured.resources[0]?.aliases).toEqual([join(options.projectRoot, "CLAUDE.md")]);
    writeFileSync(join(options.projectRoot, "CLAUDE.md"), "Same\n");
    captured = resolveContext(options);
    expect(captured.resources.map((resource) => resource.state)).toEqual(["enabled", "enabled"]);
    expect(captured.renderedInstructions).toContain("Same\r\n");
    expect(captured.renderedInstructions).toContain("Same\n");
  },
);

test.each([false, true])(
  "filesystem identity aliases contribute once and disabled files do not suppress enabled ones with junction %s",
  (isLinked) => {
    const options = setup(isLinked);
    const first = join(options.projectRoot, "AGENTS.md");
    writeFileSync(first, "One physical file.");
    linkSync(first, join(options.projectRoot, "CLAUDE.md"));
    expect(resolveContext(options).resources.map((resource) => resource.state)).toEqual([
      "enabled",
      "duplicate",
    ]);
    options.settings.instructions.disabledPaths = [first];
    expect(resolveContext(options).resources.map((resource) => resource.state)).toEqual([
      "off",
      "enabled",
    ]);
  },
);

test("linked user and profile scopes preserve resource paths and disabled settings", () => {
  const options = setup(true);
  const userSkill = join(options.userDirectory, "skills", "review", "SKILL.md");
  const profileSkill = join(options.profileDirectory, "skills", "review", "SKILL.md");
  skill(join(options.userDirectory, "skills"), "User description.");
  skill(join(options.profileDirectory, "skills"), "Profile description.");
  const userCommand = join(options.userDirectory, "commands", "review.md");
  const profileCommand = join(options.profileDirectory, "commands", "review.md");
  for (const path of [userCommand, profileCommand]) {
    mkdirSync(dirname(path));
    writeFileSync(path, "---\ndescription: Review data.\n---\nReview $1.");
  }
  options.settings.skills.disabledPaths = [userSkill];
  options.settings.slashCommands.disabledPaths = [profileCommand];
  const captured = resolveContext(options);
  expect(captured.resources.map((resource) => [resource.path, resource.state])).toEqual([
    [userSkill, "off"],
    [userCommand, "enabled"],
    [profileSkill, "enabled"],
    [profileCommand, "off"],
  ]);
  expect(captured.renderedSkills).toContain(profileSkill);
});

test("missing resource roots under linked parents remain absent", () => {
  const options = setup(true);
  options.userDirectory = join(dirname(options.userDirectory), "missing", "state");
  options.profileDirectory = join(options.userDirectory, "profiles", "research");
  options.settings.skills.paths = [join("extra", "skills")];
  options.settings.slashCommands.paths = [join("extra", "commands")];
  expect(resolveContext(options).resources).toEqual([]);
});

test("empty files, byte order marks, and large instructions stay exact without truncation", () => {
  const options = setup();
  const text = "Large content.\r\n".repeat(10_000);
  writeFileSync(join(options.projectRoot, "AGENTS.md"), `\uFEFF${text}`);
  writeFileSync(join(options.projectRoot, "CLAUDE.md"), "");
  const captured = resolveContext(options);
  expect(captured.resources[0]?.bytes).toBe(Buffer.byteLength(text) + 3);
  expect(captured.resources[0]?.source.startsWith("\uFEFF")).toBe(true);
  expect(captured.resources[0]?.insertedText).not.toContain("\uFEFF");
  expect(captured.resources[0]?.insertedText).toContain(text);
  expect(captured.resources[1]).toMatchObject({ bytes: 0, source: "", state: "enabled" });
});

test("invalid utf8 and directories become diagnostics while missing filenames do not", () => {
  const options = setup();
  writeFileSync(join(options.projectRoot, "AGENTS.md"), Buffer.from([255]));
  mkdirSync(join(options.projectRoot, "CLAUDE.md"));
  options.settings.instructions.names.push("MISSING.md");
  expect(resolveContext(options).resources.map((resource) => resource.state)).toEqual([
    "invalid",
    "invalid",
  ]);
  options.folder = parent;
  expect(() => resolveContext(options)).toThrow("outside its registered project");
});

test("deeper skills override profile and user declarations while all sources remain visible", () => {
  const options = setup();
  skill(join(options.userDirectory, "skills"), "User description.");
  skill(join(options.profileDirectory, "skills"), "Profile description.");
  skill(join(options.projectRoot, ".agents", "skills"), "Project description.");
  const captured = resolveContext(options);
  expect(captured.resources.map((resource) => resource.state)).toEqual([
    "overridden",
    "overridden",
    "enabled",
  ]);
  expect(captured.renderedSkills).toContain("Project description.");
  expect(captured.renderedSkills).not.toContain("Body with exact spacing.");
  expect(captured.renderedSkills).not.toContain("User description.");
});

test("skill validation is strict and unsupported metadata remains visible without effects", () => {
  const options = setup();
  const root = join(options.profileDirectory, "skills");
  skill(
    root,
    "Valid metadata.",
    "disable-model-invocation: true\nlicense: MIT\nallowed-tools: Shell\n",
  );
  let captured = resolveContext(options);
  expect(captured.renderedSkills).toBe("");
  expect(captured.resources[0]?.metadata).toMatchObject({
    license: "MIT",
    "allowed-tools": "Shell",
  });
  expect(captured.resources[0]?.body).toBe("\nBody with exact spacing.\n\n");
  writeFileSync(
    join(root, "review", "SKILL.md"),
    "---\nname: other\ndescription: Mismatch.\n---\nBody",
  );
  captured = resolveContext(options);
  expect(captured.resources[0]?.state).toBe("invalid");
  expect(captured.renderedSkills).toBe("");
});

test("outside configured resources need permission before metadata or content is read", () => {
  const options = setup();
  options.settings.skills.paths = [join(parent, "outside")];
  const resource = resolveContext(options).resources[0];
  expect(resource).toMatchObject({
    state: "needsPermission",
    source: "",
    bytes: 0,
    fingerprint: "",
  });
});

test.each([false, true])(
  "external directory links stay unread and a missing working folder fails explicitly with junction %s",
  (isLinked) => {
    const options = setup(isLinked);
    const external = mkdtempSync(join(parent, "external-"));
    skill(external);
    const agents = join(options.projectRoot, ".agents");
    mkdirSync(agents);
    symlinkSync(external, join(agents, "skills"), "junction");
    expect(resolveContext(options).resources[0]).toMatchObject({
      state: "needsPermission",
      source: "",
      fingerprint: "",
    });
    options.folder = join(options.projectRoot, "deleted-folder");
    expect(() => resolveContext(options)).toThrow("does not exist");
    options.folder = join(external, "missing", "deleted-folder");
    expect(() => resolveContext(options)).toThrow("does not exist");
  },
);

test.each([false, true])(
  "source editing preserves exact supplied bytes and rejects a stale fingerprint with junction %s",
  async (isLinked) => {
    const options = setup(isLinked);
    const path = join(options.projectRoot, "AGENTS.md");
    writeFileSync(path, "\uFEFFOriginal.\r\n");
    const resource = resolveContext(options).resources[0];
    if (resource === undefined) {
      throw new Error("The source is missing.");
    }
    const saved = await saveContextResource(
      options,
      resource.id,
      resource.fingerprint,
      "\uFEFFEdited.\r\n",
    );
    expect(saved.resources[0]).toMatchObject({ id: resource.id, path });
    expect(readFileSync(path, "utf8")).toBe("\uFEFFEdited.\r\n");
    await expect(
      saveContextResource(options, resource.id, resource.fingerprint, "Overwrite."),
    ).rejects.toThrow("changed on disk");
    expect(readFileSync(path, "utf8")).toBe("\uFEFFEdited.\r\n");
  },
);

test("source saves through directory aliases share one fingerprint check", async () => {
  const options = setup(true);
  writeFileSync(join(options.projectRoot, "AGENTS.md"), "Original.");
  const direct = {
    ...options,
    projectRoot: realpathSync(options.projectRoot),
    folder: realpathSync(options.folder),
  };
  const outcomes = await Promise.allSettled(
    [options, direct].map((scope) => {
      const resource = resolveContext(scope).resources[0];
      if (resource === undefined) {
        throw new Error("The source is missing.");
      }
      return saveContextResource(scope, resource.id, resource.fingerprint, "Edited.");
    }),
  );
  expect(outcomes.filter((outcome) => outcome.status === "fulfilled")).toHaveLength(1);
  expect(outcomes.find((outcome) => outcome.status === "rejected")).toMatchObject({
    reason: new Error("The source changed on disk. Reload it before saving."),
  });
  expect(readFileSync(join(options.projectRoot, "AGENTS.md"), "utf8")).toBe("Edited.");
});

test("resource switches remove inserted sections and leave sources inspectable", () => {
  const options = setup();
  writeFileSync(join(options.projectRoot, "AGENTS.md"), "Project instructions.");
  skill(join(options.profileDirectory, "skills"));
  options.settings.instructions.isEnabled = false;
  options.settings.skills.isAdvertised = false;
  const captured = resolveContext(options);
  expect(captured.renderedInstructions).toBe("");
  expect(captured.renderedSkills).toBe("");
  expect(captured.resources.map((resource) => resource.state)).toEqual(["off", "enabled"]);
});

test("reserved commands are invalid and source revisions stay immutable after disk changes", () => {
  const options = setup();
  const root = join(options.profileDirectory, "commands");
  mkdirSync(root);
  writeFileSync(join(root, "help.md"), "---\ndescription: Reserved.\n---\nBody");
  writeFileSync(join(root, "review.md"), "---\ndescription: Review data.\n---\nReview $1.");
  const first = resolveContext(options);
  expect(first.resources.find((resource) => resource.name === "help")?.state).toBe("invalid");
  writeFileSync(join(root, "review.md"), "---\ndescription: Review data.\n---\nChanged.");
  const second = resolveContext(options);
  expect(first.revision).not.toBe(second.revision);
  expect(first.resources.find((resource) => resource.name === "review")?.body).toBe("Review $1.");
});
