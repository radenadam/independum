import { readFileSync } from "node:fs";
import { machine, release, type } from "node:os";
import { type AgentSession, VERSION as piVersion } from "@earendil-works/pi-coding-agent";
import type { AddedFactSummary, Settings } from "./api-types.ts";
import { createModelTexts, defineText, type ModelText } from "./model-texts.ts";

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

/** The editable texts of every fact that Independum adds to a request. */
export const addedFactTexts: ModelText[] = [
  messageTime,
  harness,
  pi,
  operatingSystem,
  timeZone,
  chatFolder,
  knowledgeCutoff,
];

const packageInfo = JSON.parse(
  readFileSync(new URL("../package.json", import.meta.url), "utf8"),
) as { version: string };

/** The settings and location of the request whose facts are being built. */
export interface AddedFactsOptions {
  settings: Settings;
  folder: string;
  model: { provider: string; id: string } | undefined;
}

/** Returns the facts as sent, or no text when the user has not set a model's cutoff. */
export function summarizeAddedFacts({
  settings,
  folder,
  model,
}: AddedFactsOptions): AddedFactSummary[] {
  const texts = createModelTexts(() => settings.texts);
  const cutoff =
    model === undefined ? undefined : settings.knowledgeCutoffs[model.provider]?.[model.id];
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
