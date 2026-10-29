import { Type } from "@earendil-works/pi-ai";
import { defineTool, type ToolDefinition } from "@earendil-works/pi-coding-agent";
import { defineText, type ModelText, type ModelTexts } from "../model-texts.ts";
import { type BackgroundCommands, describeHowItEnded } from "./create-background-commands.ts";
import { describeSeconds } from "./run-command.ts";

const idSlot = { meaning: "The id of the background command.", example: "3" };
const timeSlot = { meaning: "How long the command has run.", example: "84.2 s" };

/** The texts of the CheckCommand tool that the model reads, which the user can edit. */
const checkCommandTexts = {
  description: defineText({
    id: "checkCommand.description",
    group: "CheckCommand",
    section: "description",
    label: "Every request",
    builtIn:
      "Returns what a background command of the Shell tool printed since the last check, and whether it still runs or how it ended. Without an id, lists the background commands that run.",
    slots: {},
  }),
  id: defineText({
    id: "checkCommand.parameters.id",
    group: "CheckCommand",
    section: "parameter",
    label: "id",
    builtIn: "The id of the background command.",
    slots: {},
  }),
  wait: defineText({
    id: "checkCommand.parameters.wait",
    group: "CheckCommand",
    section: "parameter",
    label: "wait",
    builtIn:
      "Seconds to wait before the call returns. It returns sooner when the command ends, or when `until` appears in its output. Without it, the call returns at once.",
    slots: {},
  }),
  until: defineText({
    id: "checkCommand.parameters.until",
    group: "CheckCommand",
    section: "parameter",
    label: "until",
    builtIn: "A text that ends the wait as soon as it appears in the output.",
    slots: {},
  }),
  running: defineText({
    id: "checkCommand.running",
    group: "CheckCommand",
    section: "result",
    label: "When the command still runs, after its output",
    builtIn: "Background command {id} still runs after {time}.",
    slots: { id: idSlot, time: timeSlot },
  }),
  listed: defineText({
    id: "checkCommand.listed",
    group: "CheckCommand",
    section: "result",
    label: "Without an id, when background commands run",
    builtIn: "Background commands that run:\n{commands}",
    slots: {
      commands: {
        meaning: "One line for each command, as the next text gives it.",
        example: "1: pnpm dev, running for 84.2 s",
      },
    },
  }),
  listedCommand: defineText({
    id: "checkCommand.listedCommand",
    group: "CheckCommand",
    section: "result",
    label: "Without an id, the line for each background command that runs",
    builtIn: "{id}: {command}, running for {time}",
    slots: {
      id: idSlot,
      time: timeSlot,
      command: { meaning: "The command that it runs.", example: "pnpm dev" },
    },
  }),
  noneRunning: defineText({
    id: "checkCommand.noneRunning",
    group: "CheckCommand",
    section: "result",
    label: "Without an id, when no background command runs",
    builtIn: "No background command runs.",
    slots: {},
  }),
  unknown: defineText({
    id: "checkCommand.unknown",
    group: "CheckCommand",
    section: "result",
    label: "When no background command of the chat has the id",
    builtIn: "No background command has the id {id}.",
    slots: { id: { meaning: "The id that the model gave.", example: "3" } },
  }),
};

/** The texts of the CheckCommand tool, in the order that the Agent place shows them. */
export const checkCommandTextList: ModelText[] = Object.values(checkCommandTexts);

/**
 * Creates the CheckCommand tool, which returns what a background command of the Shell tool printed
 * since the last check, or lists the background commands that run.
 */
export function createCheckCommandTool(
  background: BackgroundCommands,
  texts: ModelTexts,
): ToolDefinition {
  return defineTool({
    name: "CheckCommand",
    label: "CheckCommand",
    get description() {
      return texts.get(checkCommandTexts.description);
    },
    get parameters() {
      return Type.Object({
        id: Type.Optional(
          Type.Integer({ minimum: 1, description: texts.get(checkCommandTexts.id) }),
        ),
        wait: Type.Optional(
          Type.Number({ exclusiveMinimum: 0, description: texts.get(checkCommandTexts.wait) }),
        ),
        until: Type.Optional(
          Type.String({ minLength: 1, description: texts.get(checkCommandTexts.until) }),
        ),
      });
    },
    async execute(_toolCallId, { id, wait, until }, signal, _onUpdate, context) {
      const chatId = context.sessionManager.getSessionId();
      if (id === undefined) {
        const lines = background.listRunning(chatId).map((command) =>
          texts.fill(checkCommandTexts.listedCommand, {
            id: command.id,
            time: describeSeconds(Date.now() - command.startedAt),
            command: command.command,
          }),
        );
        const text =
          lines.length === 0
            ? texts.get(checkCommandTexts.noneRunning)
            : texts.fill(checkCommandTexts.listed, { commands: lines.join("\n") });
        return { content: [{ type: "text", text }], details: null };
      }
      const check = await background.check(chatId, id, {
        waitMs: (wait ?? 0) * 1000,
        until,
        signal,
      });
      if (check === undefined) {
        throw new Error(texts.fill(checkCommandTexts.unknown, { id }));
      }
      const status =
        check.ended === undefined
          ? texts.fill(checkCommandTexts.running, { id, time: describeSeconds(check.runMs) })
          : describeHowItEnded(check.ended, texts);
      const { text } = check.output;
      return {
        content: [{ type: "text", text: text === "" ? status : `${text}\n\n${status}` }],
        details: check.ended?.end ?? null,
      };
    },
  });
}
