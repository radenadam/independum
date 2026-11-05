import { randomUUID } from "node:crypto";
import { dirname } from "node:path";
import type { ComposePreview, ContextRevision } from "./api-types.ts";
import { skillInvocationText } from "./context-texts.ts";
import { escapeContextMetadata } from "./escape-context-metadata.ts";
import { expandCommand } from "./expand-command.ts";
import type { ModelTexts } from "./model-texts.ts";
import { builtInSlashCommands } from "./read-context-settings.ts";

/** Captured previews with their expiry and exactly once submission state. */
export interface CommandPreviews {
  compose(
    chatId: string,
    text: string,
    interpretation: "literal" | "commands",
    revision: ContextRevision,
    texts: ModelTexts,
  ): ComposePreview;
  get(chatId: string, id: string): ComposePreview;
  submit(
    chatId: string,
    id: string,
    text: string,
    accept: (preview: ComposePreview, text: string) => Promise<boolean>,
  ): Promise<boolean>;
}

/** Owns command expansion without invoking Pi's terminal command dispatcher. */
export function createCommandPreviews(now: () => number = Date.now): CommandPreviews {
  const previews = new Map<string, ComposePreview>();
  const submissions = new Map<string, Promise<boolean>>();
  function get(chatId: string, id: string): ComposePreview {
    const preview = previews.get(id);
    if (preview === undefined || preview.chatId !== chatId) {
      throw new Error("This preview does not belong to the chat.");
    }
    if (preview.expires <= now() && !submissions.has(id)) {
      throw new Error("This command preview has expired.");
    }
    return structuredClone(preview);
  }
  return {
    get,
    compose(chatId, text, interpretation, revision, texts) {
      for (const [id, preview] of previews) {
        if (preview.expires <= now() && !submissions.has(id)) {
          previews.delete(id);
        }
      }
      let expanded = text;
      let kind: ComposePreview["kind"] = "literal";
      let action: string | undefined;
      let argumentsText = "";
      let fingerprint = "";
      if (
        interpretation === "commands" &&
        revision.settings.slashCommands.isEnabled &&
        text.startsWith("/")
      ) {
        if (text.startsWith("//")) {
          expanded = text.slice(1);
        } else {
          const match = /^\/([^\s]+)(?:\s([\s\S]*))?$/.exec(text);
          const name = match?.[1] ?? "";
          argumentsText = match?.[2] ?? "";
          const builtIn = builtInSlashCommands.find((command) => command.name === name);
          if (builtIn !== undefined) {
            if (builtIn.argumentHint === "" && argumentsText !== "") {
              throw new Error("This command accepts no arguments.");
            }
            action = name;
            if (
              name === "skills" &&
              argumentsText !== "" &&
              !revision.resources.some(
                (resource) =>
                  resource.kind === "skill" &&
                  resource.state === "enabled" &&
                  resource.name === argumentsText,
              )
            ) {
              throw new Error("That exact skill is not available.");
            }
            kind = "action";
            expanded = "";
          } else {
            const isSkill = name.startsWith("skill:");
            const resource = revision.resources.find(
              (entry) =>
                entry.kind === (isSkill ? "skill" : "command") &&
                entry.name === (isSkill ? name.slice(6) : name) &&
                entry.state === "enabled",
            );
            if (resource === undefined || (isSkill && !revision.settings.skills.isEnabled)) {
              throw new Error("This slash command is unknown or disabled.");
            }
            fingerprint = resource.fingerprint;
            expanded = isSkill
              ? texts.fill(skillInvocationText, {
                  name: escapeContextMetadata(resource.name),
                  path: escapeContextMetadata(resource.path),
                  directory: escapeContextMetadata(dirname(resource.path)),
                  content: resource.body,
                }) + (argumentsText === "" ? "" : `\n\n${argumentsText}`)
              : expandCommand(resource.body, argumentsText);
            kind = "preview";
          }
        }
      }
      const preview: ComposePreview = {
        id: randomUUID(),
        chatId,
        invocation: text,
        arguments: argumentsText,
        fingerprint,
        text: expanded,
        kind,
        ...(action === undefined ? {} : { action }),
        expires: now() + 300_000,
      };
      previews.set(preview.id, preview);
      return structuredClone(preview);
    },
    async submit(chatId, id, text, accept) {
      const existing = submissions.get(id);
      if (existing !== undefined) {
        const preview = previews.get(id);
        if (preview?.chatId !== chatId) {
          throw new Error("This preview does not belong to the chat.");
        }
        return existing;
      }
      const preview = get(chatId, id);
      const pending = accept(structuredClone(preview), text);
      submissions.set(id, pending);
      try {
        const accepted = await pending;
        if (!accepted) {
          submissions.delete(id);
        }
        return accepted;
      } catch (error) {
        submissions.delete(id);
        throw error;
      }
    },
  };
}
