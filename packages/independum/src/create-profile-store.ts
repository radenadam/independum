import { createHash } from "node:crypto";
import { existsSync, type FSWatcher, readdirSync, watch } from "node:fs";
import { dirname, join } from "node:path";
import { allTexts, systemPromptText } from "./agent-texts.ts";
import type {
  ChatOverrides,
  ChatSettingsDocument,
  ConfigurationIssue,
  ConfigurationResource,
  ProfileBundle,
  ProfileReference,
  ProfileResource,
  ProjectSettingsDocument,
  Settings,
  UserSettingsDocument,
} from "./api-types.ts";
import {
  type ConfigurationWrite,
  checkConfigurationPath,
  configurationRevision,
  configurationValueRevision,
  jsonConfiguration,
  readConfigurationFile,
  withConfigurationLock,
  writeConfigurationFiles,
} from "./configuration-files.ts";
import {
  ConfigurationError,
  parseConfigurationJson,
  validateChatSettings,
  validateLegacySettings,
  validateProfileBundle,
  validateProfileId,
  validateProjectSettings,
  validateUserSettings,
} from "./configuration-schema.ts";
import { serializePermissionPath } from "./permission-policy.ts";
import { readAttachmentSettings } from "./read-attachment-settings.ts";
import { readContextSettings } from "./read-context-settings.ts";
import { builtInSettings } from "./read-settings-change.ts";
import { subscribeTo } from "./subscribe-to.ts";

/** A saved chat's choices read through Pi before settings migration. */
export interface ProfileChat {
  id: string;
  folder: string;
  overrides: ChatOverrides;
}

/** A resolved profile with complete values and separate disk and effective revisions. */
export interface ResolvedProfile {
  profile: ProfileResource;
  choices: ConfigurationResource<ChatSettingsDocument>;
  settings: Settings;
  model: ChatOverrides["model"];
  thinkingLevel: ChatOverrides["thinkingLevel"];
  effectiveRevision: string;
  issues: ConfigurationIssue[];
  sources: NonNullable<import("./api-types.ts").ChatConfiguration["sources"]>;
  userSettings: ConfigurationResource<UserSettingsDocument>;
}

/** Plain authoritative configuration files and profile resolution. */
export interface ProfileStore {
  user(): ConfigurationResource<UserSettingsDocument>;
  project(projectId: string): ConfigurationResource<ProjectSettingsDocument>;
  projects(): { id: string; folder: string }[];
  profile(reference: ProfileReference, projectId: string): ProfileResource;
  profiles(projectId: string): ProfileResource[];
  putUser(value: unknown, revision: string | undefined): Promise<void>;
  putProject(projectId: string, value: unknown, revision: string | undefined): Promise<void>;
  putProfile(
    reference: ProfileReference,
    projectId: string,
    value: unknown,
    revision: string | undefined,
    isCurrent?: () => boolean,
  ): Promise<void>;
  newChoices(folder: string, reference?: ProfileReference): ChatSettingsDocument;
  choices(id: string): ConfigurationResource<ChatSettingsDocument>;
  resolve(id: string, folder: string): ResolvedProfile;
  preview(reference: ProfileReference, projectId: string): ResolvedProfile;
  putChoices(change: ProfileChoiceWrite): Promise<void>;
  keepChoices(id: string, value: ChatSettingsDocument): void;
  saveChoices(id: string): Promise<void>;
  removeChoices(id: string): Promise<void>;
  subscribe(listener: () => void): () => void;
  close(): void;
}

interface ProfileChoiceWrite {
  id: string;
  folder: string;
  value: unknown;
  revision: string | undefined;
  isDurable: boolean;
}

/** Creates and migrates plain settings, then reconciles edits from text editors. */
export async function createProfileStore(
  directory: string,
  folders: string[],
  chats: ProfileChat[],
): Promise<ProfileStore> {
  const projectFolders = new Map(folders.map((folder) => [projectIdOf(folder), folder]));
  const drafts = new Map<string, ChatSettingsDocument>();
  const listeners = new Set<() => void>();
  const watched = new Map<string, string>();
  const watchers = new Map<string, FSWatcher>();
  let initializationIssues: ConfigurationIssue[] = [];
  let timer: ReturnType<typeof setTimeout> | undefined;
  let isClosed = false;

  function observe(path: string, contents: (string | null)[]): string {
    const revision = configurationRevision(contents);
    if (!watched.has(path)) {
      watched.set(path, revision);
    }
    let parent = dirname(path);
    while (!existsSync(parent) && dirname(parent) !== parent) {
      parent = dirname(parent);
    }
    if (!watchers.has(parent) && !isClosed) {
      const watcher = watch(parent, { persistent: false }, schedule);
      watcher.on("error", schedule);
      watchers.set(parent, watcher);
    }
    return revision;
  }

  function schedule(): void {
    if (isClosed) {
      return;
    }
    clearTimeout(timer);
    timer = setTimeout(() => {
      timer = undefined;
      const before = diskRevisions();
      timer = setTimeout(() => {
        const after = diskRevisions();
        if (JSON.stringify(before) !== JSON.stringify(after)) {
          schedule();
          return;
        }
        let hasChanged = false;
        for (const [path, revision] of after) {
          if (watched.get(path) !== revision) {
            watched.set(path, revision);
            hasChanged = true;
          }
        }
        if (hasChanged) {
          for (const listener of listeners) {
            listener();
          }
        }
      }, 25);
      timer.unref();
    }, 200);
    timer.unref();
  }

  function diskRevisions(): [string, string][] {
    return [...watched.keys()].map((path) => {
      try {
        return [path, configurationRevision([readConfigurationFile(path)])];
      } catch (error) {
        return [path, String(error)];
      }
    });
  }

  function fileResource<Document>(
    path: string,
    validate: (value: unknown, file: string) => Document,
    missing?: Document,
  ): ConfigurationResource<Document> {
    let contents: string | null = null;
    let document: Document | null = null;
    let issues: ConfigurationIssue[] = [];
    try {
      contents = readConfigurationFile(path);
      if (contents === null && missing === undefined) {
        throw new ConfigurationError("The configuration file is missing.", path, "", 409);
      }
      document =
        contents === null
          ? (missing ?? null)
          : validate(parseConfigurationJson(contents, path), path);
    } catch (error) {
      issues = issuesOf(error, path);
    }
    return { path, document, issues, revision: observe(path, [contents]) };
  }

  function user(): ConfigurationResource<UserSettingsDocument> {
    const resource = fileResource(join(directory, "settings.json"), validateUserSettings);
    return {
      ...resource,
      issues: [
        ...resource.issues,
        ...initializationIssues.filter((issue) => dirname(issue.file) === directory),
      ],
    };
  }

  function folderOf(projectId: string): string {
    const folder = projectFolders.get(projectId);
    if (folder === undefined) {
      throw new ConfigurationError(
        "This project is not known to the server.",
        "Project",
        "/id",
        409,
      );
    }
    return folder;
  }

  function project(projectId: string): ConfigurationResource<ProjectSettingsDocument> {
    return fileResource(
      join(folderOf(projectId), ".independum", "settings.json"),
      validateProjectSettings,
      { formatVersion: 1 },
    );
  }

  function profileFolder(reference: ProfileReference, projectId: string): string {
    validateProfileId(reference.id);
    if (reference.scope !== "user" && reference.scope !== "project") {
      throw new ConfigurationError("Expected user or project.", "Profile", "/scope");
    }
    const root = reference.scope === "user" ? directory : join(folderOf(projectId), ".independum");
    const path = join(root, "profiles", reference.id);
    checkConfigurationPath(root, path);
    return path;
  }

  function profile(reference: ProfileReference, projectId: string): ProfileResource {
    const path = profileFolder(reference, projectId);
    const files = ["profile.json", "SYSTEM.md", "model-texts.json"];
    const contents: (string | null)[] = [];
    let document: ProfileBundle | null = null;
    let issues: ConfigurationIssue[] = [];
    try {
      for (const file of files) {
        const target = join(path, file);
        checkConfigurationPath(
          reference.scope === "user" ? directory : join(folderOf(projectId), ".independum"),
          target,
        );
        const text = readConfigurationFile(target);
        observe(target, [text]);
        contents.push(text);
      }
      if (
        files.some((file, index) => readConfigurationFile(join(path, file)) !== contents[index])
      ) {
        throw new ConfigurationError(
          "The profile files changed while they were being read. Wait for the editor to finish saving.",
          path,
          "",
          409,
        );
      }
      const [settings, prompt, texts] = contents;
      if (settings === null || settings === undefined) {
        throw new ConfigurationError(
          "This profile is missing.",
          join(path, "profile.json"),
          "",
          409,
        );
      }
      document = validateProfileBundle(
        {
          profile: parseConfigurationJson(settings, join(path, "profile.json")),
          systemPrompt: prompt?.replace(/^\uFEFF/, "") ?? null,
          modelTexts:
            texts === null || texts === undefined
              ? null
              : parseConfigurationJson(texts, join(path, "model-texts.json")),
        },
        path,
      );
    } catch (error) {
      issues = issuesOf(error, path);
    }
    issues.push(
      ...initializationIssues.filter(
        (issue) => issue.file === path || dirname(issue.file) === path,
      ),
    );
    const usedBy = chats
      .filter((chat) => {
        const selected = choices(chat.id).document?.profile;
        return (
          selected?.id === reference.id &&
          selected.scope === reference.scope &&
          (reference.scope === "user" || projectIdOf(chat.folder) === projectId)
        );
      })
      .map((chat) => chat.id);
    return {
      path,
      reference,
      projectId,
      document,
      issues,
      usedBy,
      revision: configurationRevision(contents),
      files: Object.fromEntries(files.map((file, index) => [file, contents[index] ?? null])),
    };
  }

  function profiles(projectId: string): ProfileResource[] {
    const result: ProfileResource[] = [];
    for (const scope of projectId === "" ? (["user"] as const) : (["user", "project"] as const)) {
      const root = scope === "user" ? directory : join(folderOf(projectId), ".independum");
      const path = join(root, "profiles");
      checkConfigurationPath(root, path);
      if (!existsSync(path)) {
        observe(join(path, "profile.json"), [null]);
        continue;
      }
      for (const entry of readdirSync(path, { withFileTypes: true })) {
        if (entry.isDirectory() || entry.isSymbolicLink()) {
          try {
            result.push(profile({ scope, id: entry.name }, projectId));
          } catch (error) {
            result.push({
              path: join(path, entry.name),
              reference: { scope, id: entry.name },
              projectId,
              document: null,
              issues: issuesOf(error, path),
              revision: configurationRevision([null]),
              usedBy: [],
            });
          }
        }
      }
    }
    return result;
  }

  function choices(id: string): ConfigurationResource<ChatSettingsDocument> {
    const path = chatPath(id);
    const draft = drafts.get(id);
    return draft === undefined
      ? fileResource(path, validateChatSettings)
      : {
          path,
          document: structuredClone(draft),
          issues: [],
          revision: configurationRevision([jsonConfiguration(draft)]),
        };
  }

  function chatPath(id: string): string {
    if (!/^[a-zA-Z0-9-]+$/.test(id)) {
      throw new ConfigurationError("This chat id cannot name a settings file.", "Chat", "/id");
    }
    return join(directory, "chat-settings", `${id}.json`);
  }

  function newChoices(folder: string, reference?: ProfileReference): ChatSettingsDocument {
    let selected = reference;
    if (selected === undefined) {
      const defaults = requireDocument(project(projectIdOf(folder)));
      selected = defaults.profile ?? requireDocument(user()).defaultProfile;
    }
    requireDocument(profile(selected, projectIdOf(folder)));
    return { formatVersion: 1, profile: selected };
  }

  function resolveProfile(id: string, folder: string): ResolvedProfile {
    if (!chats.some((chat) => chat.id === id)) {
      chats.push({ id, folder, overrides: {} });
    }
    const selection = choices(id);
    return resolveSelection(selection, folder);
  }

  function resolveSelection(
    selection: ConfigurationResource<ChatSettingsDocument>,
    folder: string,
  ): ResolvedProfile {
    const selected = selection.document?.profile ?? { scope: "user", id: "default" };
    const resource = profile(selected, projectIdOf(folder));
    const document = resource.document;
    const settings = {
      ...structuredClone(builtInSettings),
      ...document?.profile.settings,
      texts: { ...document?.modelTexts?.texts },
    };
    settings.compaction = {
      ...builtInSettings.compaction,
      ...document?.profile.settings?.compaction,
    };
    settings.context = readContextSettings(document?.profile.settings?.context ?? {});
    settings.attachments = readAttachmentSettings(document?.profile.settings?.attachments ?? {});
    if (document?.systemPrompt !== null && document?.systemPrompt !== undefined) {
      settings.texts.systemPrompt = {
        text: document.systemPrompt,
        ...(document.modelTexts?.systemPromptBuiltIn === undefined
          ? {}
          : { builtIn: document.modelTexts.systemPromptBuiltIn }),
      };
    }
    const userResource = user();
    settings.knowledgeCutoffs = userResource.document?.knowledgeCutoffs ?? {};
    const overrides = selection.document?.overrides ?? {};
    const model = Object.hasOwn(overrides, "model")
      ? overrides.model
      : (document?.profile.settings?.model ?? null);
    const thinkingLevel = Object.hasOwn(overrides, "thinkingLevel")
      ? overrides.thinkingLevel
      : (document?.profile.settings?.thinkingLevel ?? null);
    const issues = [...selection.issues, ...resource.issues];
    if (userResource.issues.length > 0) {
      issues.push(...userResource.issues);
    }
    const sources: ResolvedProfile["sources"] = {};
    for (const [key, value] of [
      ...Object.entries(settings),
      ["model", model],
      ["thinkingLevel", thinkingLevel],
    ] as [string, unknown][]) {
      if (key === "texts" || key === "knowledgeCutoffs") {
        continue;
      }
      const isChatValue = Object.hasOwn(overrides, key);
      const hasProfileValue =
        document?.profile.settings !== undefined && Object.hasOwn(document.profile.settings, key);
      sources[key] = {
        value,
        file: isChatValue
          ? selection.path
          : hasProfileValue
            ? join(resource.path, "profile.json")
            : null,
        pointer: ["", isChatValue ? "overrides" : "settings", key].join("/"),
      };
    }
    sources.knowledgeCutoffs = {
      value: settings.knowledgeCutoffs,
      file: userResource.path,
      pointer: "/knowledgeCutoffs",
    };
    for (const text of allTexts) {
      sources[text.id] = {
        value: settings.texts[text.id]?.text ?? text.builtIn,
        file:
          settings.texts[text.id] === undefined
            ? null
            : join(resource.path, text.id === "systemPrompt" ? "SYSTEM.md" : "model-texts.json"),
        pointer: text.id === "systemPrompt" ? "" : `/texts/${text.id}/text`,
      };
    }
    return {
      profile: resource,
      choices: selection,
      settings,
      model,
      thinkingLevel,
      issues,
      sources,
      userSettings: userResource,
      effectiveRevision: configurationValueRevision({ settings, model, thinkingLevel }),
    };
  }

  async function replace<Document>(
    root: string,
    current: () => ConfigurationResource<Document>,
    revision: string | undefined,
    writes: () => ConfigurationWrite[],
  ): Promise<void> {
    await withConfigurationLock(root, async () => {
      const resource = current();
      checkRevision(resource, revision);
      await writeConfigurationFiles(root, writes());
    });
    schedule();
  }

  async function putProfile(...parameters: Parameters<ProfileStore["putProfile"]>): Promise<void> {
    const [reference, projectId, value, revision, isCurrent] = parameters;
    const path = profileFolder(reference, projectId);
    const bundle = normalizeBundle(validateProfileBundle(value, path));
    const root = reference.scope === "user" ? directory : join(folderOf(projectId), ".independum");
    await replace(
      root,
      () => profile(reference, projectId),
      revision,
      () => {
        if (isCurrent?.() === false) {
          throw new ConfigurationError(
            "The approval changed before it could be saved.",
            path,
            "",
            409,
          );
        }
        return bundleWrites(path, bundle);
      },
    );
  }

  async function putChoices({
    id,
    folder,
    value,
    revision,
    isDurable,
  }: ProfileChoiceWrite): Promise<void> {
    const document = validateChatSettings(value, chatPath(id));
    requireDocument(profile(document.profile, projectIdOf(folder)));
    if (isDurable) {
      await replace(
        directory,
        () => choices(id),
        revision,
        () => [{ path: chatPath(id), content: jsonConfiguration(document) }],
      );
      drafts.delete(id);
    } else {
      checkRevision(choices(id), revision);
      drafts.set(id, structuredClone(document));
      schedule();
    }
  }

  await withConfigurationLock(directory, async () => {
    const path = join(directory, "settings.json");
    const original = readConfigurationFile(path);
    const parsed = original === null ? null : parseConfigurationJson(original, path);
    if (parsed !== null && typeof parsed === "object" && Object.hasOwn(parsed, "formatVersion")) {
      validateUserSettings(parsed, path);
      return;
    }
    const legacy = parsed === null ? {} : validateLegacySettings(parsed, path);
    const { texts, knowledgeCutoffs, ...runtime } = legacy;
    let id = "default";
    let suffix = 0;
    while (existsSync(join(directory, "profiles", id))) {
      suffix += 1;
      id = suffix === 1 ? "migrated-settings" : `migrated-settings-${suffix}`;
    }
    const reference: ProfileReference = { scope: "user", id };
    const edits = (texts ?? {}) as Settings["texts"];
    const { systemPrompt, ...otherTexts } = edits;
    const bundle = normalizeBundle(
      validateProfileBundle(
        {
          profile: { formatVersion: 1, name: "Default", settings: runtime },
          systemPrompt: systemPrompt?.text ?? null,
          modelTexts: {
            formatVersion: 1,
            texts: otherTexts,
            ...(systemPrompt?.builtIn === undefined
              ? {}
              : { systemPromptBuiltIn: systemPrompt.builtIn }),
          },
        },
        join(directory, "profiles", id),
      ),
    );
    const writes = bundleWrites(join(directory, "profiles", id), bundle);
    if (original !== null) {
      const backup = join(directory, "migrations", "settings-before-profiles.json");
      if (readConfigurationFile(backup) !== null) {
        throw new ConfigurationError(
          "A migration backup already exists while settings are unversioned. Review the files before migration.",
          backup,
          "",
          409,
        );
      }
      writes.unshift({ path: backup, content: original });
    }
    for (const chat of chats) {
      const document: ChatSettingsDocument = {
        formatVersion: 1,
        profile: reference,
        overrides: chat.overrides,
      };
      const target = chatPath(chat.id);
      if (readConfigurationFile(target) !== null) {
        throw new ConfigurationError(
          "A chat settings file already exists before migration.",
          target,
          "",
          409,
        );
      }
      writes.push({ path: target, content: jsonConfiguration(document) });
    }
    writes.push({
      path,
      content: jsonConfiguration({
        formatVersion: 1,
        defaultProfile: reference,
        ...(knowledgeCutoffs === undefined ? {} : { knowledgeCutoffs }),
      }),
    });
    await writeConfigurationFiles(directory, writes);
  }).catch((error: unknown) => {
    if (!(error instanceof ConfigurationError)) {
      throw error;
    }
    initializationIssues = error.issues;
  });

  const migrated = new Set<string>();
  for (const projectId of ["", ...projectFolders.keys()]) {
    for (const resource of profiles(projectId)) {
      if (migrated.has(resource.path) || resource.document === null || resource.issues.length > 0) {
        continue;
      }
      migrated.add(resource.path);
      const original = parseConfigurationJson(
        resource.files?.["profile.json"] ?? "{}",
        join(resource.path, "profile.json"),
      ) as { settings?: { permissions?: { version?: unknown } } };
      if (original.settings?.permissions?.version !== 1) {
        continue;
      }
      const root =
        resource.reference.scope === "user" ? directory : join(folderOf(projectId), ".independum");
      await replace(
        root,
        () => profile(resource.reference, projectId),
        resource.revision,
        () => [
          {
            path: join(resource.path, "profile.json"),
            content: jsonConfiguration(resource.document?.profile),
          },
        ],
      );
    }
  }

  return {
    user,
    project,
    profile,
    profiles,
    choices,
    newChoices,
    resolve: resolveProfile,
    preview(reference, projectId) {
      return resolveSelection(
        { path: "", revision: "", issues: [], document: { formatVersion: 1, profile: reference } },
        folderOf(projectId),
      );
    },
    projects: () => [...projectFolders].map(([id, folder]) => ({ id, folder })),
    async putUser(value, revision) {
      const document = validateUserSettings(value, join(directory, "settings.json"));
      requireDocument(profile(document.defaultProfile, ""));
      await replace(directory, user, revision, () => [
        { path: join(directory, "settings.json"), content: jsonConfiguration(document) },
      ]);
    },
    async putProject(projectId, value, revision) {
      const current = project(projectId);
      const document = validateProjectSettings(value, current.path);
      if (document.profile !== undefined) {
        requireDocument(profile(document.profile, projectId));
      }
      await replace(
        join(folderOf(projectId), ".independum"),
        () => project(projectId),
        revision,
        () => [{ path: current.path, content: jsonConfiguration(document) }],
      );
    },
    putProfile,
    putChoices,
    keepChoices(id, value) {
      drafts.set(id, structuredClone(value));
    },
    async saveChoices(id) {
      const draft = drafts.get(id);
      if (draft !== undefined) {
        await withConfigurationLock(directory, async () => {
          const path = chatPath(id);
          if (readConfigurationFile(path) !== null) {
            throw new ConfigurationError(
              "This chat already has a saved profile choice.",
              path,
              "",
              412,
            );
          }
          await writeConfigurationFiles(directory, [{ path, content: jsonConfiguration(draft) }]);
        });
        drafts.delete(id);
      }
    },
    async removeChoices(id) {
      drafts.delete(id);
      await withConfigurationLock(directory, () =>
        writeConfigurationFiles(directory, [{ path: chatPath(id), content: null }]),
      );
    },
    subscribe(listener) {
      return subscribeTo(listeners, listener);
    },
    close() {
      isClosed = true;
      clearTimeout(timer);
      for (const watcher of watchers.values()) {
        watcher.close();
      }
    },
  };
}

/** Returns the name that a person gave a profile, or its id when its file cannot be read. */
export function profileNameOf(profile: ProfileResource): string {
  return profile.document?.profile.name ?? profile.reference.id;
}

/** Returns the stable server id for an exact known project folder. */
export function projectIdOf(folder: string): string {
  return createHash("sha256").update(folder).digest("hex").slice(0, 24);
}

function normalizeBundle(bundle: ProfileBundle): ProfileBundle {
  const result = structuredClone(bundle);
  const permissions = result.profile.settings?.permissions;
  if (permissions !== undefined) {
    for (const approval of permissions.savedApprovals) {
      approval.project = serializePermissionPath(approval.project);
      if (approval.resource.kind === "path") {
        approval.resource.path = serializePermissionPath(approval.resource.path);
      }
    }
    for (const rule of permissions.rules) {
      rule.project = serializePermissionPath(rule.project);
      if (rule.resource.kind === "path") {
        rule.resource.path = serializePermissionPath(rule.resource.path);
      }
    }
  }
  if (result.systemPrompt === systemPromptText.builtIn) {
    result.systemPrompt = null;
    if (result.modelTexts !== null) {
      delete result.modelTexts.systemPromptBuiltIn;
    }
  }
  for (const text of allTexts) {
    if (result.modelTexts?.texts?.[text.id]?.text === text.builtIn) {
      delete result.modelTexts.texts[text.id];
    }
  }
  return result;
}

function bundleWrites(path: string, bundle: ProfileBundle): ConfigurationWrite[] {
  return [
    { path: join(path, "profile.json"), content: jsonConfiguration(bundle.profile) },
    { path: join(path, "SYSTEM.md"), content: bundle.systemPrompt },
    {
      path: join(path, "model-texts.json"),
      content: bundle.modelTexts === null ? null : jsonConfiguration(bundle.modelTexts),
    },
  ];
}

function checkRevision(
  resource: ConfigurationResource<unknown>,
  expected: string | undefined,
): void {
  if (expected === undefined) {
    throw new ConfigurationError(
      "A save requires If-Match, or If-None-Match: * for creation.",
      resource.path,
      "",
      428,
    );
  }
  const isAbsent =
    resource.revision === configurationRevision([null]) ||
    resource.revision === configurationRevision([null, null, null]);
  if (expected === "*" ? !isAbsent : expected !== resource.revision) {
    throw new ConfigurationError(
      "The files changed after this editor loaded. Reload or review the current files before saving.",
      resource.path,
      "",
      412,
    );
  }
}

function requireDocument<Document>(resource: ConfigurationResource<Document>): Document {
  if (resource.document === null || resource.issues.length > 0) {
    const issue = resource.issues[0];
    throw new ConfigurationError(
      issue?.message ?? "This configuration is unavailable.",
      issue?.file ?? resource.path,
      issue?.pointer ?? "",
      409,
    );
  }
  return resource.document;
}

function issuesOf(error: unknown, path: string): ConfigurationIssue[] {
  return error instanceof ConfigurationError
    ? error.issues
    : [
        {
          file: path,
          pointer: "",
          message: error instanceof Error ? error.message : "The file could not be read.",
        },
      ];
}
