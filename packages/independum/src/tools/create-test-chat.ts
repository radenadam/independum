import { writeFileSync } from "node:fs";
import { join } from "node:path";
import type { ToolDefinition } from "@earendil-works/pi-coding-agent";
import { createModelTexts } from "../model-texts.ts";
import { createReadTool } from "./create-read-tool.ts";
import { createTestFolder } from "./create-test-folder.ts";

/** What a call of a tool returned in a test: its text, how many images, its details, and whether it failed. */
interface ToolOutcome {
  text: string;
  images: number;
  details: unknown;
  isError: boolean;
}

/**
 * A chat for the tests of the file tools: its folder, a way to call a tool in it, a way to read a
 * file with the built-in output limit, and a way to put a file in its folder.
 */
interface TestChat {
  folder: string;
  run(tool: ToolDefinition, input: Record<string, unknown>, model?: unknown): Promise<ToolOutcome>;
  read(input: Record<string, unknown>): Promise<ToolOutcome>;
  place(name: string, content: string | Buffer): string;
}

const visionModel = { input: ["text", "image"] };
const readTool = createReadTool({
  getLimits: () => ({ maxLines: 2000, maxBytes: 51_200 }),
  texts: createModelTexts(() => ({})),
});

/**
 * Creates a chat for the tests of the file tools, which keeps the result of each call as Pi saves
 * it, so a tool can tell what the chat saw before.
 */
export function createTestChat(name: string): TestChat {
  const folder = createTestFolder(name);
  const branch: unknown[] = [];
  async function run(
    tool: ToolDefinition,
    input: Record<string, unknown>,
    model: unknown = visionModel,
  ): Promise<ToolOutcome> {
    const sessionManager = { getBranch: () => branch };
    const context = { cwd: folder, model, sessionManager } as unknown as Parameters<
      ToolDefinition["execute"]
    >[4];
    try {
      const result = await tool.execute("call", input as never, undefined, undefined, context);
      branch.push({ type: "message", message: { role: "toolResult", details: result.details } });
      return {
        text: result.content.map((block) => (block.type === "text" ? block.text : "")).join(""),
        images: result.content.filter((block) => block.type === "image").length,
        details: result.details,
        isError: (result as { isError?: boolean }).isError === true,
      };
    } catch (error) {
      return { text: (error as Error).message, images: 0, details: null, isError: true };
    }
  }
  return {
    folder,
    run,
    read: (input) => run(readTool, input),
    place(file, content) {
      const path = join(folder, file);
      writeFileSync(path, content);
      return path;
    },
  };
}
