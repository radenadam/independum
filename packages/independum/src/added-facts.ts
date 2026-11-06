import { readFileSync } from "node:fs";
import { homedir, machine, release, type } from "node:os";
import { join } from "node:path";
import { type AgentSession, VERSION as piVersion } from "@earendil-works/pi-coding-agent";
import type { AddedFactSummary, Settings } from "./api-types.ts";
import { commandEnvironment } from "./command-environment.ts";
import { sandboxRuntime } from "./create-sandbox.ts";
import { createModelTexts, defineText, type ModelText } from "./model-texts.ts";
import { deniedPermissionPaths } from "./permission-policy.ts";
import { findShell } from "./tools/find-shell.ts";

type AgentMessage = AgentSession["messages"][number];

const messageTime = defineText({
  id: "facts.messageTime",
  group: "Message time",
  section: "prompt",
  label: "Before each user message and tool result in a request",
  builtIn: "Written at {time}\n\n",
  slots: {
    time: {
      meaning: "The local date and time when the message was written, with its UTC offset.",
      example: "2026-11-05 21:14 +07:00",
    },
  },
});
const harness = defineText({
  id: "facts.harness",
  group: "Harness",
  section: "prompt",
  label: "In the system prompt",
  builtIn: "Harness: Independum {version}.",
  slots: { version: { meaning: "The version of Independum.", example: "0.0.0" } },
});
const pi = defineText({
  id: "facts.pi",
  group: "Pi",
  section: "prompt",
  label: "In the system prompt",
  builtIn: "Agent SDK: Pi {version}.",
  slots: { version: { meaning: "The version of Pi.", example: "1.4.0" } },
});
const operatingSystem = defineText({
  id: "facts.operatingSystem",
  group: "Operating system",
  section: "prompt",
  label: "In the system prompt",
  builtIn: "Operating system: {name} {release}, {architecture}.",
  slots: {
    name: { meaning: "The name of the operating system.", example: "Windows_NT" },
    release: { meaning: "The release of the operating system.", example: "10.0.26200" },
    architecture: { meaning: "The architecture of the operating system.", example: "x86_64" },
  },
});
const timeZone = defineText({
  id: "facts.timeZone",
  group: "Time zone",
  section: "prompt",
  label: "In the system prompt",
  builtIn: "Time zone: {zone}.",
  slots: { zone: { meaning: "The local time zone of the server.", example: "Asia/Bangkok" } },
});
const chatFolder = defineText({
  id: "facts.chatFolder",
  group: "Chat folder",
  section: "prompt",
  label: "In the system prompt",
  builtIn: "Chat folder: {folder}",
  slots: { folder: { meaning: "The folder where the chat works.", example: "C:\\work\\project" } },
});
const knowledgeCutoff = defineText({
  id: "facts.knowledgeCutoff",
  group: "Knowledge cutoff",
  section: "prompt",
  label: "In the system prompt when set for the chosen model",
  builtIn: "Model knowledge cutoff: {cutoff}.",
  slots: {
    cutoff: { meaning: "The knowledge cutoff the user sets for this model.", example: "2026-04" },
  },
});

const permissions = defineText({
  id: "facts.permissions",
  group: "Permissions",
  section: "prompt",
  label: "In project mode when the sandbox is available",
  builtIn:
    "Permission mode: project.\nProject folder: {project}.\nTool workers require {backend}. Commands and file tools can read everywhere except denied paths, subject to permission rules. Writes are limited to the project, subject to permission rules and protected configuration paths. Writes outside the project and network access require approval unless the permission policy allows them. Shell can request access through its access parameter.\nDenied paths: {deniedPaths}. These paths are inaccessible. On Linux, bubblewrap shows denied folders as empty. That empty view does not describe their actual contents. Independum's state folder stays denied even when access is approved.\nProject .independum stays read-only unless a write is explicitly approved. Commands use the {environment} environment policy. Running commands retain their launch authority. Policies that the backend cannot enforce refuse before execution.\nRuntime access: {runtime}.\nRestrictions: {restrictions}.",
  slots: {
    project: { meaning: "The project folder.", example: "C:/work/project" },
    backend: {
      meaning: "The required concrete operating system backend.",
      example: "processcontainer",
    },
    environment: { meaning: "The environment policy.", example: "minimal" },
    runtime: {
      meaning: "The system read roots and platform access of tool workers.",
      example: "Read-only system roots and private devices.",
    },
    deniedPaths: {
      meaning: "The state folder and active folders or files denied by the profile.",
      example: '["C:/Users/person/.independum", "C:/private"]',
    },
    restrictions: {
      meaning: "The active resource rules and read-only project configuration paths.",
      example: "Project .independum.",
    },
  },
});
const unavailablePermissions = defineText({
  id: "facts.permissionsUnavailable",
  group: "Permissions",
  section: "prompt",
  label: "When project mode cannot use the required sandbox",
  builtIn:
    "Permission mode: project. The required sandbox is unavailable: {reason} Tool operations refuse before execution. No unrestricted fallback runs.",
  slots: {
    reason: { meaning: "The exact discovery failure.", example: "Bubblewrap is unavailable." },
  },
});
const unrestrictedPermissions = defineText({
  id: "facts.permissionsUnrestricted",
  group: "Permissions",
  section: "prompt",
  label: "In unrestricted mode",
  builtIn:
    "Permission mode: unrestricted. Tools use the ordinary authority of the account that starts Independum. No filesystem or network sandbox restricts tool operations. Commands use the {environment} environment policy.",
  slots: { environment: { meaning: "The environment policy.", example: "minimal" } },
});

/** The editable texts of every fact that Independum adds to a request. */
export const addedFactTexts: ModelText[] = [
  messageTime,
  harness,
  pi,
  operatingSystem,
  timeZone,
  chatFolder,
  knowledgeCutoff,
  permissions,
  unavailablePermissions,
  unrestrictedPermissions,
];

const packageInfo = JSON.parse(
  readFileSync(new URL("../package.json", import.meta.url), "utf8"),
) as { version: string };

/** The settings and location of the request whose facts are being built. */
export interface AddedFactsOptions {
  directory?: string;
  settings: Settings;
  folder: string;
  model: { provider: string; id: string } | undefined;
}

/** Returns the facts as sent, or no text when the user has not set a model's cutoff. */
export function summarizeAddedFacts({
  settings,
  folder,
  model,
  directory,
}: AddedFactsOptions): AddedFactSummary[] {
  const texts = createModelTexts(() => settings.texts);
  const cutoff =
    model === undefined ? undefined : settings.knowledgeCutoffs[model.provider]?.[model.id];
  const permissionRuntime =
    settings.permissions.mode === "project"
      ? sandboxRuntime(
          findShell(settings.shell ?? undefined, true)?.path ?? process.execPath,
          settings.permissions.environment,
          Object.keys(commandEnvironment(settings.permissions.environment, settings.environment)),
        )
      : undefined;
  const values: [ModelText, string | null][] = [
    [messageTime, texts.get(messageTime)],
    [harness, texts.fill(harness, { version: packageInfo.version })],
    [pi, texts.fill(pi, { version: piVersion })],
    [
      operatingSystem,
      texts.fill(operatingSystem, { name: type(), release: release(), architecture: machine() }),
    ],
    [timeZone, texts.fill(timeZone, { zone: Intl.DateTimeFormat().resolvedOptions().timeZone })],
    [chatFolder, texts.fill(chatFolder, { folder })],
    [knowledgeCutoff, cutoff === undefined ? null : texts.fill(knowledgeCutoff, { cutoff })],
    [
      permissions,
      permissionRuntime?.unavailable === null
        ? texts.fill(permissions, {
            project: folder,
            backend: permissionRuntime.backend,
            environment: settings.permissions.environment,
            runtime: JSON.stringify({
              readonlyPaths: permissionRuntime.readonlyPaths,
              implicitAccess: permissionRuntime.implicitAccess,
              environmentNames: permissionRuntime.environmentNames,
            }),
            deniedPaths: JSON.stringify(
              deniedPermissionPaths(
                settings.permissions,
                folder,
                directory ?? join(homedir(), ".independum"),
              ),
            ),
            restrictions: JSON.stringify({
              rules: settings.permissions.rules,
              protectedPaths: [join(folder, ".independum")],
            }),
          })
        : null,
    ],
    [
      unavailablePermissions,
      permissionRuntime?.unavailable
        ? texts.fill(unavailablePermissions, { reason: permissionRuntime.unavailable })
        : null,
    ],
    [
      unrestrictedPermissions,
      settings.permissions.mode === "unrestricted"
        ? texts.fill(unrestrictedPermissions, { environment: settings.permissions.environment })
        : null,
    ],
  ];
  return values.map(([text, value]) => ({
    id: text.id,
    label: text.group,
    text: value,
    isEnabled: !settings.disabledFacts.includes(text.id),
  }));
}

/** Returns the section of facts for the system prompt, with only the facts that are on and set. */
export function addedFactPrompt(options: AddedFactsOptions): string {
  return summarizeAddedFacts(options)
    .filter((fact) => fact.id !== messageTime.id && fact.isEnabled && fact.text !== null)
    .map((fact) => fact.text)
    .join("\n");
}

/** Returns the request messages with their original times, without changing the saved messages. */
export function addMessageTimes(messages: AgentMessage[], settings: Settings): AgentMessage[] {
  if (settings.disabledFacts.includes(messageTime.id)) {
    return messages;
  }
  return messages.map((message) => {
    if (message.role !== "user" && message.role !== "toolResult") {
      return message;
    }
    const prefix = messageTimeText(message.timestamp, settings);
    if (prefix === "") {
      return message;
    }
    const content =
      typeof message.content === "string"
        ? [{ type: "text" as const, text: message.content }]
        : message.content;
    return { ...message, content: [{ type: "text" as const, text: prefix }, ...content] };
  });
}

/** Returns the editable time prefix in the server's local zone at the instant a message was written. */
export function messageTimeText(timestamp: number, settings: Settings, zone?: string): string {
  const parts = new Intl.DateTimeFormat("en-CA", {
    ...(zone === undefined ? {} : { timeZone: zone }),
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    hourCycle: "h23",
    timeZoneName: "longOffset",
  }).formatToParts(timestamp);
  function value(name: Intl.DateTimeFormatPartTypes): string {
    return parts.find((part) => part.type === name)?.value ?? "";
  }
  const offset = value("timeZoneName").replace("GMT", "") || "+00:00";
  const time = `${value("year")}-${value("month")}-${value("day")} ${value("hour")}:${value("minute")} ${offset}`;
  return createModelTexts(() => settings.texts).fill(messageTime, { time });
}
