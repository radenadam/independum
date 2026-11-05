import { fileURLToPath } from "node:url";
import type { ExtensionToolContext } from "@earendil-works/pi-coding-agent";
import type { Settings } from "./api-types.ts";
import { createModelTexts } from "./model-texts.ts";
import { createEditTool } from "./tools/create-edit-tool.ts";
import { createReadTool } from "./tools/create-read-tool.ts";
import { createWriteTool } from "./tools/create-write-tool.ts";

/** Data supplied to a restricted worker without a session file or parent control channel. */
export interface FileOperation {
  name: string;
  id: string;
  input: Record<string, unknown>;
  folder: string;
  settings: Pick<Settings, "outputLimits" | "texts">;
  branch: ReturnType<ExtensionToolContext["sessionManager"]["getBranch"]>;
  model: Pick<NonNullable<ExtensionToolContext["model"]>, "input" | "inputLimits"> | undefined;
}

/** Executes the existing file behavior inside the already established sandbox. */
export async function runFileOperation(operation: FileOperation): Promise<unknown> {
  const texts = createModelTexts(() => operation.settings.texts);
  const tool = [
    createReadTool({ texts, getLimits: () => operation.settings.outputLimits }),
    createWriteTool(texts),
    createEditTool(texts),
  ].find((entry) => entry.name === operation.name);
  if (tool === undefined) {
    throw new Error("The file worker accepts only Read, Write, and Edit.");
  }
  const context = {
    cwd: operation.folder,
    model: operation.model,
    sessionManager: { getBranch: () => operation.branch },
  } as unknown as ExtensionToolContext;
  return tool.execute(operation.id, operation.input, undefined, undefined, context);
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  const chunks: Buffer[] = [];
  for await (const chunk of process.stdin) {
    chunks.push(Buffer.from(chunk));
  }
  try {
    const result = await runFileOperation(
      JSON.parse(Buffer.concat(chunks).toString("utf8")) as FileOperation,
    );
    process.stdout.write(JSON.stringify({ result }));
  } catch (error) {
    process.stdout.write(
      JSON.stringify({
        error: error instanceof Error ? error.message : "The file operation failed.",
      }),
    );
    process.exitCode = 1;
  }
}
