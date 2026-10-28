import { Type } from "@earendil-works/pi-ai";
import { defineTool, type ToolDefinition } from "@earendil-works/pi-coding-agent";
import { type BackgroundCommands, describeBackgroundEnded } from "./create-background-commands.ts";

const parameters = Type.Object({
  id: Type.Integer({ minimum: 1, description: "The id of the background command." }),
});

/** Creates the StopCommand tool, which stops a background command of the Shell tool. */
export function createStopCommandTool(background: BackgroundCommands): ToolDefinition {
  return defineTool({
    name: "StopCommand",
    label: "StopCommand",
    description:
      "Stops a background command of the Shell tool by its id, with every program it started.",
    parameters,
    async execute(_toolCallId, { id }) {
      const ended = await background.stopByModel(id);
      if (ended === undefined) {
        throw new Error(`No background command with the id ${id} is running.`);
      }
      return {
        content: [{ type: "text", text: describeBackgroundEnded(ended) }],
        details: ended.end,
      };
    },
  });
}
