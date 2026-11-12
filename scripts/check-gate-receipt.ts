import { readFileSync } from "node:fs";
import { join, resolve } from "node:path";
import { readGateReceipt, readGateTask } from "./gate-contract.ts";
import { type Revision, readRevision } from "./read-revision.ts";

const folder = resolve(import.meta.dirname, "..");
let input = "";
for await (const chunk of process.stdin) {
  input += String(chunk);
}
if (input.trim() !== "") {
  try {
    const pointer = JSON.parse(
      readFileSync(
        join(folder, "node_modules", ".cache", "independum-gate", "latest.json"),
        "utf8",
      ),
    ) as { receiptPath: string };
    const receipt = JSON.parse(readFileSync(pointer.receiptPath, "utf8")) as {
      revision: Revision;
      verdict: string;
      checks: string;
      roles: unknown[];
    };
    const task = readGateTask(
      JSON.parse(readFileSync(join(resolve(pointer.receiptPath, ".."), "task.json"), "utf8")),
      folder,
    );
    readGateReceipt(receipt, task, readRevision(folder, receipt.revision.base), input);
  } catch (error) {
    process.stderr.write(`${error instanceof Error ? error.message : String(error)}\n`);
    process.exitCode = 1;
  }
}
