import { createHash } from "node:crypto";
import { lstatSync, readdirSync, readFileSync, realpathSync, statSync } from "node:fs";
import { writeFile } from "node:fs/promises";
import { basename, dirname, isAbsolute, join, relative, resolve, sep } from "node:path";
import { parseFrontmatter, withFileMutationQueue } from "@earendil-works/pi-coding-agent";
import type { ContextResource, ContextRevision, ContextSettings } from "./api-types.ts";
import { instructionText, skillCatalogText, skillText } from "./context-texts.ts";
import { escapeContextMetadata } from "./escape-context-metadata.ts";
import type { ModelTexts } from "./model-texts.ts";
import { builtInSlashCommands } from "./read-context-settings.ts";

const resourceName = /^[a-z0-9]+(?:-[a-z0-9]+)*$/;

/** Explicit discovery boundaries and profile-owned settings for a chat. */
export interface ContextScope {
  projectRoot: string;
  folder: string;
  userDirectory: string;
  profileDirectory: string;
  settings: ContextSettings;
  texts: ModelTexts;
}

/** Saves a known source only while its exact captured fingerprint still matches. */
export async function saveContextResource(
  options: ContextScope,
  id: string,
  fingerprint: string,
  content: string,
): Promise<ContextRevision> {
  const captured = resolveContext(options).resources.find((resource) => resource.id === id);
  if (captured === undefined) {
    throw new Error("This resource is unknown.");
  }
  return withFileMutationQueue(captured.path, async () => {
    const current = resolveContext(options).resources.find((resource) => resource.id === id);
    if (current === undefined || current.fingerprint !== fingerprint) {
      throw new Error("The source changed on disk. Reload it before saving.");
    }
    if (current.state === "needsPermission" || current.fingerprint === "") {
      throw new Error("This resource cannot be edited without permission.");
    }
    if (Buffer.from(content, "utf8").toString("utf8") !== content) {
      throw new Error("The source must contain valid Unicode text.");
    }
    await writeFile(current.path, content, "utf8");
    return resolveContext(options);
  });
}

/** Captures resources without imports, implicit ancestors, or external link reads. */
export function resolveContext(options: ContextScope): ContextRevision {
  const { settings, texts } = options;
  const resources: ContextResource[] = [];
  if (!statSync(options.folder, { throwIfNoEntry: false })?.isDirectory()) {
    throw new Error("The chat folder does not exist or is not a directory.");
  }
  const projectRoot = realLocation(options.projectRoot);
  const roots = [
    projectRoot,
    realLocation(options.userDirectory),
    realLocation(options.profileDirectory),
  ];
  let location = realLocation(options.folder);
  if (!isInside(projectRoot, location)) {
    throw new Error("The chat folder is outside its registered project.");
  }
  const directories: string[] = [];
  let directory = resolve(options.folder);
  while (true) {
    directories.unshift(directory);
    if (relative(projectRoot, location) === "") {
      break;
    }
    location = dirname(location);
    const parent = dirname(directory);
    directory =
      relative(realLocation(parent), location) === ""
        ? parent
        : join(options.projectRoot, relative(projectRoot, location));
  }
  const identities = new Map<string, ContextResource>();
  const fingerprints = new Map<string, ContextResource>();

  function isAllowed(path: string, scope: ContextResource["scope"]): boolean {
    const location = realLocation(path);
    return (scope === "project" ? roots.slice(0, 1) : roots).some((root) =>
      isInside(root, location),
    );
  }

  function read(
    kind: ContextResource["kind"],
    scope: ContextResource["scope"],
    path: string,
    name: string,
    isEnabled: boolean,
  ): ContextResource | undefined {
    const resource: ContextResource = {
      id: digest(`${kind}:${path}`),
      kind,
      scope,
      path,
      name,
      state: isEnabled ? "enabled" : "off",
      reason: "Discovered in the configured scope.",
      aliases: [],
      bytes: 0,
      fingerprint: "",
      source: "",
      insertedText: "",
      body: "",
      description: "",
      metadata: {},
    };
    try {
      if (!isAllowed(path, scope)) {
        resource.state = "needsPermission";
        resource.reason =
          "This path needs permission. The permission service is not available yet.";
        resources.push(resource);
        return resource;
      }
      let physical: string;
      try {
        lstatSync(path);
      } catch (error) {
        if (hasCode(error, "ENOENT")) {
          return undefined;
        }
        throw error;
      }
      physical = realpathSync(path);
      if (!isAllowed(physical, scope)) {
        resource.state = "needsPermission";
        resource.reason = "The link target needs permission. Its contents are not read.";
      } else if (["auth.json", "models.json", ".env"].includes(basename(physical).toLowerCase())) {
        resource.state = "invalid";
        resource.reason = "Credential files are not context resources.";
      } else {
        const information = statSync(physical, { bigint: true });
        if (!information.isFile()) {
          throw new Error("The resource is not a regular file.");
        }
        const identity = `${kind}:${information.dev}:${information.ino}`;
        const existing = identities.get(identity);
        if (existing !== undefined && existing.state === "enabled" && isEnabled) {
          resource.state = "duplicate";
          resource.bytes = existing.bytes;
          resource.fingerprint = existing.fingerprint;
          resource.source = existing.source;
          resource.body = existing.body;
          resource.metadata = existing.metadata;
          resource.description = existing.description;
          resource.reason = `The same file is already listed at ${existing.path}.`;
          existing.aliases.push(path);
        } else {
          const bytes = readFileSync(physical);
          resource.bytes = bytes.length;
          resource.fingerprint = digest(bytes);
          // TextDecoder names this standard option with an uppercase acronym.
          // biome-ignore lint/style/useNamingConvention: This is the standard TextDecoder option.
          resource.source = new TextDecoder("utf-8", { fatal: true, ignoreBOM: true }).decode(
            bytes,
          );
          resource.body = resource.source.replace(/^\uFEFF/, "");
          if (isEnabled) {
            identities.set(identity, resource);
          }
          if (kind === "instructions") {
            const duplicate = fingerprints.get(resource.fingerprint);
            if (duplicate !== undefined && isEnabled) {
              resource.state = "duplicate";
              resource.reason = `Identical bytes are already listed at ${duplicate.path}.`;
              duplicate.aliases.push(path);
            } else if (isEnabled) {
              fingerprints.set(resource.fingerprint, resource);
              resource.insertedText = texts.fill(instructionText, {
                path: escapeContextMetadata(path),
                content: resource.body,
              });
            }
          } else {
            const parsed = parseFrontmatter<Record<string, unknown>>(resource.body);
            resource.metadata = parsed.frontmatter;
            resource.body = sourceBody(resource.body);
            const description = parsed.frontmatter.description;
            if (!resourceName.test(name) || name.length > 64) {
              throw new Error(
                "Use at most 64 lowercase letters, digits, and single hyphens for the name.",
              );
            }
            if (
              typeof description !== "string" ||
              !description.trim() ||
              description.length > 1024
            ) {
              throw new Error("The description needs from 1 through 1024 characters.");
            }
            resource.description = description;
            if (kind === "skill") {
              if (parsed.frontmatter.name !== name) {
                throw new Error("The skill name must match its folder name.");
              }
              if (
                parsed.frontmatter["disable-model-invocation"] !== undefined &&
                typeof parsed.frontmatter["disable-model-invocation"] !== "boolean"
              ) {
                throw new Error("The disable-model-invocation field must be a boolean.");
              }
              if (
                isEnabled &&
                settings.skills.isAdvertised &&
                parsed.frontmatter["disable-model-invocation"] !== true
              ) {
                resource.insertedText = texts.fill(skillText, {
                  name: escapeContextMetadata(name),
                  path: escapeContextMetadata(path),
                  directory: escapeContextMetadata(dirname(path)),
                  description: escapeContextMetadata(description),
                });
              }
            } else {
              if (builtInSlashCommands.some((command) => command.name === name)) {
                throw new Error("This command name is reserved by Independum.");
              }
              if (
                parsed.frontmatter["argument-hint"] !== undefined &&
                typeof parsed.frontmatter["argument-hint"] !== "string"
              ) {
                throw new Error("The argument-hint field must be text.");
              }
            }
          }
        }
      }
    } catch (error) {
      resource.state = "invalid";
      resource.reason =
        error instanceof Error && !hasCode(error, "ENOENT")
          ? error.message
          : "The link target does not exist.";
      resource.insertedText = "";
    }
    resources.push(resource);
    return resource;
  }

  for (const folder of directories) {
    for (const name of settings.instructions.names) {
      const path = join(folder, name);
      read(
        "instructions",
        "project",
        path,
        name,
        settings.instructions.isEnabled && !settings.instructions.disabledPaths.includes(path),
      );
    }
  }

  function scan(
    kind: "skill" | "command",
    scope: ContextResource["scope"],
    path: string,
    isExplicit: boolean,
  ): void {
    const feature = kind === "skill" ? settings.skills : settings.slashCommands;
    function add(file: string, name: string): void {
      read(kind, scope, file, name, feature.isEnabled && !feature.disabledPaths.includes(file));
    }
    try {
      if (!isAllowed(path, scope)) {
        add(path, basename(path));
        return;
      }
      const physical = realpathSync(path);
      if (!isAllowed(physical, scope)) {
        add(path, basename(path));
        return;
      }
      if (
        isExplicit &&
        (basename(path) === "SKILL.md" || (kind === "command" && path.endsWith(".md")))
      ) {
        add(path, kind === "skill" ? basename(dirname(path)) : basename(path, ".md"));
      } else if (
        kind === "skill" &&
        isExplicit &&
        statSync(join(path, "SKILL.md"), { throwIfNoEntry: false })?.isFile()
      ) {
        add(join(path, "SKILL.md"), basename(path));
      } else {
        for (const entry of readdirSync(path, { withFileTypes: true }).sort((first, second) =>
          first.name.localeCompare(second.name),
        )) {
          if (kind === "skill" && (entry.isDirectory() || entry.isSymbolicLink())) {
            add(join(path, entry.name, "SKILL.md"), entry.name);
          }
          if (kind === "command" && entry.name.endsWith(".md")) {
            add(join(path, entry.name), basename(entry.name, ".md"));
          }
        }
      }
    } catch (error) {
      if (!hasCode(error, "ENOENT")) {
        const resource = read(kind, scope, path, basename(path), feature.isEnabled);
        if (resource !== undefined) {
          resource.state = "invalid";
          resource.reason = "The resource root cannot be read.";
        }
      }
    }
  }
  const scopes: {
    scope: ContextResource["scope"];
    directory: string;
    skills: string;
    commands: string;
  }[] = [
    {
      scope: "user",
      directory: options.userDirectory,
      skills: join(options.userDirectory, "skills"),
      commands: join(options.userDirectory, "commands"),
    },
    {
      scope: "profile",
      directory: options.profileDirectory,
      skills: join(options.profileDirectory, "skills"),
      commands: join(options.profileDirectory, "commands"),
    },
    ...directories.map((folder) => ({
      scope: "project" as const,
      directory: folder,
      skills: join(folder, ".agents", "skills"),
      commands: join(folder, ".independum", "commands"),
    })),
  ];
  for (const scope of scopes) {
    scan("skill", scope.scope, scope.skills, false);
    scan("command", scope.scope, scope.commands, false);
    if (scope.scope === "profile") {
      for (const path of settings.skills.paths) {
        scan("skill", scope.scope, resolve(scope.directory, path), true);
      }
      for (const path of settings.slashCommands.paths) {
        scan("command", scope.scope, resolve(scope.directory, path), true);
      }
    }
  }
  const winners = new Map<string, ContextResource>();
  for (const resource of resources) {
    if (resource.kind === "instructions" || resource.state !== "enabled") {
      continue;
    }
    const key = `${resource.kind}:${resource.name}`;
    const previous = winners.get(key);
    if (previous !== undefined) {
      previous.state = "overridden";
      previous.reason = `Overridden by ${resource.path}.`;
      previous.insertedText = "";
    }
    winners.set(key, resource);
  }
  const advertised = resources
    .filter((resource) => resource.state === "enabled" && resource.kind === "skill")
    .map((resource) => resource.insertedText)
    .filter(Boolean);
  const revision = {
    version: 1 as const,
    settings: structuredClone(settings),
    resources,
    renderedInstructions: resources
      .filter((resource) => resource.state === "enabled" && resource.kind === "instructions")
      .map((resource) => resource.insertedText)
      .join("\n\n"),
    renderedSkills:
      advertised.length === 0
        ? ""
        : texts.fill(skillCatalogText, { content: advertised.join("\n") }),
  };
  return { ...revision, revision: digest(JSON.stringify(revision)) };
}

function sourceBody(source: string): string {
  return source.replace(/^---[^\S\r\n]*\r?\n[\s\S]*?\r?\n---[^\S\r\n]*(?:\r?\n|$)/, "");
}

function digest(value: string | Buffer): string {
  return createHash("sha256").update(value).digest("hex");
}

function realLocation(path: string): string {
  const absolute = resolve(path);
  try {
    return realpathSync(absolute);
  } catch (error) {
    const parent = dirname(absolute);
    if (!hasCode(error, "ENOENT") || parent === absolute) {
      throw error;
    }
    return join(realLocation(parent), basename(absolute));
  }
}

function isInside(root: string, path: string): boolean {
  const tail = relative(resolve(root), resolve(path));
  return tail === "" || (!isAbsolute(tail) && tail !== ".." && !tail.startsWith(`..${sep}`));
}

function hasCode(error: unknown, code: string): boolean {
  return typeof error === "object" && error !== null && "code" in error && error.code === code;
}
