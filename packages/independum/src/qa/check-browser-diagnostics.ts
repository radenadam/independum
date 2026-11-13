import { readFile } from "node:fs/promises";
import { join } from "node:path";

/** Rejects a run with browser diagnostics after all clients close. */
export async function checkBrowserDiagnostics(directory: string): Promise<void> {
  const diagnostics = await readFile(join(directory, "browser.jsonl"), "utf8");
  if (diagnostics.trim() !== "") {
    throw new Error(
      "The browser reports errors or warnings. Read browser.jsonl in the output folder.",
    );
  }
}
