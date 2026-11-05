import { expect, test, vi } from "vitest";
import type { ContextResource, ContextRevision } from "./api-types.ts";
import { createCommandPreviews } from "./create-command-previews.ts";
import { createModelTexts } from "./model-texts.ts";
import { builtInContext } from "./read-context-settings.ts";

const texts = createModelTexts(() => ({}));

function revision(): ContextRevision {
  const resource: ContextResource = {
    id: "resource",
    kind: "command",
    scope: "profile",
    path: "review.md",
    name: "review",
    state: "enabled",
    reason: "Profile.",
    aliases: [],
    bytes: 4,
    fingerprint: "captured",
    source: "Body",
    insertedText: "",
    body: "Review $1.",
    description: "Review supplied data.",
    metadata: {},
  };
  return {
    version: 1,
    revision: "revision",
    settings: structuredClone(builtInContext),
    resources: [resource],
    renderedInstructions: "",
    renderedSkills: "",
  };
}

test("command expansion is captured before source changes and edited previews submit literally once", async () => {
  const previews = createCommandPreviews();
  const resources = revision();
  const preview = previews.compose("chat", '/review "a change"', "commands", resources, texts);
  expect(preview).toMatchObject({
    kind: "preview",
    text: "Review a change.",
    fingerprint: "captured",
  });
  const resource = resources.resources[0];
  if (resource !== undefined) {
    resource.body = "Changed on disk.";
  }
  const accept = vi.fn(async () => true);
  expect(await previews.submit("chat", preview.id, "/literal edited preview", accept)).toBe(true);
  expect(await previews.submit("chat", preview.id, "Retry", accept)).toBe(true);
  expect(accept).toHaveBeenCalledOnce();
  expect(accept.mock.calls[0]).toEqual([
    expect.objectContaining({ text: "Review a change." }),
    "/literal edited preview",
  ]);
  expect(() => previews.get("other", preview.id)).toThrow("does not belong");
});

test("literal mode doubled slashes disabled commands and unknown commands are distinct", () => {
  const previews = createCommandPreviews();
  const resources = revision();
  expect(previews.compose("chat", "//review", "commands", resources, texts).text).toBe("/review");
  expect(previews.compose("chat", "/review", "literal", resources, texts)).toMatchObject({
    kind: "literal",
    text: "/review",
  });
  expect(() => previews.compose("chat", "/unknown", "commands", resources, texts)).toThrow(
    "unknown or disabled",
  );
  expect(() =>
    previews.compose("chat", "/settings unwanted", "commands", resources, texts),
  ).toThrow("no arguments");
  resources.settings.slashCommands.isEnabled = false;
  expect(previews.compose("chat", "/unknown", "commands", resources, texts)).toMatchObject({
    kind: "literal",
    text: "/unknown",
  });
});

test("skill invocation preserves body and argument tail when advertisement is off", () => {
  const previews = createCommandPreviews();
  const resources = revision();
  const resource = resources.resources[0];
  if (resource !== undefined) {
    resource.kind = "skill";
    resource.body = "\r\nBody.\r\n\r\n";
  }
  resources.settings.skills.isAdvertised = false;
  expect(
    previews.compose("chat", "/skill:review  tail  ", "commands", resources, texts).text,
  ).toContain("\r\nBody.\r\n\r\n\n</skill>\n\n tail  ");
  resources.settings.skills.isEnabled = false;
  expect(() => previews.compose("chat", "/skill:review", "commands", resources, texts)).toThrow(
    "unknown or disabled",
  );
});

test("expired and wrong-chat previews fail and rejected submissions can retry", async () => {
  let time = 0;
  const previews = createCommandPreviews(() => time);
  const preview = previews.compose("chat", "/review data", "commands", revision(), texts);
  expect(await previews.submit("chat", preview.id, preview.text, async () => false)).toBe(false);
  expect(await previews.submit("chat", preview.id, preview.text, async () => true)).toBe(true);
  time = 300_001;
  expect(await previews.submit("chat", preview.id, preview.text, async () => false)).toBe(true);
  const expired = previews.compose("chat", "/review data", "commands", revision(), texts);
  time += 300_001;
  await expect(previews.submit("chat", expired.id, expired.text, async () => true)).rejects.toThrow(
    "expired",
  );
});
