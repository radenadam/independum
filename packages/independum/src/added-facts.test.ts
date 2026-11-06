import { machine, release, type } from "node:os";
import { join } from "node:path";
import { fauxAssistantMessage } from "@earendil-works/pi-ai";
import { VERSION as piVersion } from "@earendil-works/pi-coding-agent";
import { expect, test, vi } from "vitest";
import {
  addedFactPrompt,
  addedFactTexts,
  addMessageTimes,
  messageTimeText,
  summarizeAddedFacts,
} from "./added-facts.ts";
import { changeTexts } from "./model-texts.ts";
import { builtInSettings } from "./read-settings-change.ts";

vi.mock("./create-sandbox.ts", () => ({
  sandboxRuntime: () => ({
    backend: "bubblewrap",
    readonlyPaths: ["/"],
    implicitAccess: "Private devices.",
    environmentNames: [],
    unavailable: null,
  }),
}));

const timestamp = Date.parse("2026-11-05T14:14:00Z");
const options = {
  settings: builtInSettings,
  folder: "project",
  model: { provider: "first", id: "same-model" },
};

test("message times use the local date and the offset at the time of writing", () => {
  expect(messageTimeText(timestamp, builtInSettings, "Asia/Bangkok")).toBe(
    "Written at 2026-11-05 21:14 +07:00\n\n",
  );
  expect(messageTimeText(timestamp, builtInSettings, "UTC")).toContain("2026-11-05 14:14 +00:00");
  expect(
    messageTimeText(Date.parse("2026-07-01T04:00:00Z"), builtInSettings, "America/New_York"),
  ).toContain("2026-07-01 00:00 -04:00");
  expect(
    messageTimeText(Date.parse("2026-01-01T05:00:00Z"), builtInSettings, "America/New_York"),
  ).toContain("2026-01-01 00:00 -05:00");
  expect(messageTimeText(timestamp, builtInSettings, "Asia/Kathmandu")).toContain(
    "2026-11-05 19:59 +05:45",
  );
});

test("request times prefix user messages and tool results and leave their sources unchanged", () => {
  const image = { type: "image" as const, data: "image", mimeType: "image/png" };
  const messages: Parameters<typeof addMessageTimes>[0] = [
    { role: "user", content: "Hello", timestamp },
    { role: "user", content: [image], timestamp: timestamp + 60_000 },
    fauxAssistantMessage("Hello back."),
    {
      role: "toolResult",
      toolName: "Read",
      toolCallId: "read-1",
      isError: true,
      timestamp: timestamp + 120_000,
      content: [{ type: "text", text: "Missing file." }, image],
    },
  ];
  const saved = structuredClone(messages);
  const request = addMessageTimes(messages, builtInSettings);
  expect(request[0]).toMatchObject({
    content: [
      { type: "text", text: messageTimeText(timestamp, builtInSettings) },
      { type: "text", text: "Hello" },
    ],
  });
  expect(request[1]).toMatchObject({
    content: [{ type: "text", text: messageTimeText(timestamp + 60_000, builtInSettings) }, image],
  });
  expect(request[2]).toBe(messages[2]);
  expect(request[3]).toMatchObject({
    isError: true,
    content: [
      { type: "text", text: messageTimeText(timestamp + 120_000, builtInSettings) },
      { type: "text", text: "Missing file." },
      image,
    ],
  });
  expect(messages).toEqual(saved);
  expect(addMessageTimes(messages, builtInSettings)).toEqual(request);
  expect(
    addMessageTimes(messages, { ...builtInSettings, disabledFacts: ["facts.messageTime"] }),
  ).toBe(messages);
});

test("every harness fact is on by default and uses the running versions and environment", () => {
  const facts = summarizeAddedFacts(options);
  expect(facts.every((fact) => fact.isEnabled)).toBe(true);
  const prompt = addedFactPrompt(options);
  expect(prompt).toContain(`Agent SDK: Pi ${piVersion}.`);
  expect(prompt).toContain(`Operating system: ${type()} ${release()}, ${machine()}.`);
  expect(prompt).toContain(`Time zone: ${Intl.DateTimeFormat().resolvedOptions().timeZone}.`);
  expect(prompt).toContain("Chat folder: project");
  expect(prompt).toMatch(/^Harness: Independum \d+\.\d+\.\d+(-[\w.]+)?\./);
  expect(prompt).not.toContain("cutoff");
  expect(prompt).not.toContain("Written at");
});

test("each disabled fact is absent and an edited fact is sent exactly as edited", () => {
  const texts =
    changeTexts(addedFactTexts, {}, { "facts.harness": "Running {version} in this harness." }) ??
    {};
  expect(addedFactPrompt({ ...options, settings: { ...builtInSettings, texts } })).toMatch(
    /^Running \d+\.\d+\.\d+(-[\w.]+)? in this harness\./,
  );
  for (const fact of summarizeAddedFacts(options).filter(
    (fact) => fact.id !== "facts.messageTime" && fact.text !== null,
  )) {
    expect(
      addedFactPrompt({ ...options, settings: { ...builtInSettings, disabledFacts: [fact.id] } }),
    ).not.toContain(fact.text);
  }
  const reset = changeTexts(addedFactTexts, texts, { "facts.harness": null }) ?? {};
  expect(addedFactPrompt({ ...options, settings: { ...builtInSettings, texts: reset } })).toBe(
    addedFactPrompt(options),
  );
});

test("linux permission facts name denied paths and temporary masking and remain editable", () => {
  const directory = join(process.cwd(), "state");
  const denied = join(process.cwd(), "private");
  const settings = structuredClone(builtInSettings);
  settings.permissions.rules.push({
    id: "private",
    project: "*",
    effect: "deny",
    resource: { kind: "path", path: denied, scope: "tree", access: "read" },
  });
  const prompt = addedFactPrompt({ ...options, directory, settings });
  expect(prompt).toContain(JSON.stringify([directory, denied]));
  expect(prompt).toContain("can read everywhere except denied paths");
  expect(prompt).toContain(
    "On Linux, bubblewrap shows each denied folder as an empty private mount.",
  );
  expect(prompt).toContain("That empty view does not describe its actual contents.");
  expect(prompt).toContain(
    "Writes into a denied folder stay inside that command and disappear when it ends without reaching the host folder.",
  );
  expect(prompt).not.toContain("These paths are inaccessible.");
  expect(prompt).not.toContain("requires approval before execution");
  settings.texts =
    changeTexts(addedFactTexts, {}, { "facts.permissions": "Denied folders: {deniedPaths}." }) ??
    {};
  expect(addedFactPrompt({ ...options, directory, settings })).toContain(
    `Denied folders: ${JSON.stringify([directory, denied])}.`,
  );
  settings.disabledFacts = ["facts.permissions"];
  expect(addedFactPrompt({ ...options, directory, settings })).not.toContain("Denied folders:");
});

test("the time prefix follows edits including an empty text", () => {
  const texts = changeTexts(addedFactTexts, {}, { "facts.messageTime": "[{time}]" }) ?? {};
  expect(messageTimeText(timestamp, { ...builtInSettings, texts }, "UTC")).toBe(
    "[2026-11-05 14:14 +00:00]",
  );
  const messages: Parameters<typeof addMessageTimes>[0] = [
    { role: "user", content: "Hello", timestamp },
  ];
  const empty = changeTexts(addedFactTexts, texts, { "facts.messageTime": "" }) ?? {};
  expect(addMessageTimes(messages, { ...builtInSettings, texts: empty })).toEqual(messages);
});

test("a cutoff is sent only for the provider and model it belongs to while its switch is on", () => {
  const settings = { ...builtInSettings, knowledgeCutoffs: { first: { "same-model": "2026-04" } } };
  expect(addedFactPrompt({ ...options, settings })).toContain("Model knowledge cutoff: 2026-04.");
  expect(
    addedFactPrompt({ ...options, settings, model: { provider: "second", id: "same-model" } }),
  ).not.toContain("cutoff");
  expect(
    addedFactPrompt({ ...options, settings, model: { provider: "first", id: "other-model" } }),
  ).not.toContain("cutoff");
  expect(addedFactPrompt({ ...options, settings, model: undefined })).not.toContain("cutoff");
  expect(
    addedFactPrompt({
      ...options,
      settings: { ...settings, disabledFacts: ["facts.knowledgeCutoff"] },
    }),
  ).not.toContain("cutoff");
  expect(
    addedFactPrompt({ ...options, settings: { ...settings, knowledgeCutoffs: {} } }),
  ).not.toContain("cutoff");
  const texts =
    changeTexts(addedFactTexts, {}, { "facts.knowledgeCutoff": "Known through {cutoff}." }) ?? {};
  expect(addedFactPrompt({ ...options, settings: { ...settings, texts } })).toContain(
    "Known through 2026-04.",
  );
  expect(addedFactPrompt({ ...options, settings: { ...builtInSettings, texts } })).not.toContain(
    "Known through",
  );
});
