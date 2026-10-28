import { Type } from "@earendil-works/pi-ai";
import { defineTool, type ToolDefinition } from "@earendil-works/pi-coding-agent";
import { defineText, type ModelText, type ModelTexts } from "../model-texts.ts";
import { type BackgroundCommands, describeBackgroundEnded } from "./create-background-commands.ts";

/** The texts of the StopCommand tool that the model reads, which the user can edit. */
const stopCommandTexts = {
  description: defineText({
    id: "stopCommand.description",
    group: "StopCommand",
    section: "description",
    label: "Every request",
    builtIn:
      "Stops a background command of the Shell tool by its id, with every program it started.",
    slots: {},
  }),
  id: defineText({
    id: "stopCommand.parameters.id",
    group: "StopCommand",
    section: "parameter",
    label: "id",
    builtIn: "The id of the background command.",
    slots: {},
  }),
  notRunning: defineText({
    id: "stopCommand.notRunning",
    group: "StopCommand",
    section: "result",
    label: "When no background command with the id runs",
    builtIn: "No background command with the id {id} is running.",
    slots: { id: { meaning: "The id that the model gave.", example: "3" } },
  }),
};

/** The texts of the StopCommand tool, in the order that the Agent place shows them. */
export const stopCommandTextList: ModelText[] = Object.values(stopCommandTexts);

/** Creates the StopCommand tool, which stops a background command of the Shell tool. */
export function createStopCommandTool(
  background: BackgroundCommands,
  texts: ModelTexts,
): ToolDefinition {
  return defineTool({
    name: "StopCommand",
    label: "StopCommand",
    get description() {
      return texts.get(stopCommandTexts.description);
    },
    get parameters() {
      return Type.Object({
        id: Type.Integer({ minimum: 1, description: texts.get(stopCommandTexts.id) }),
      });
    },
    async execute(_toolCallId, { id }) {
      const ended = await background.stopByModel(id);
      if (ended === undefined) {
        throw new Error(texts.fill(stopCommandTexts.notRunning, { id }));
      }
      return {
        content: [{ type: "text", text: describeBackgroundEnded(ended, texts) }],
        details: ended.end,
      };
    },
  });
}
