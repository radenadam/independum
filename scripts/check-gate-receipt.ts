import { readFileSync } from "node:fs";
import { join, resolve } from "node:path";
import { readGateReceipt, readGateTask } from "./gate-contract.ts";
import { readPushRevision } from "./read-push-revision.ts";

/** Validates the saved gate evidence against the exact update supplied by Git. */
export function checkGateReceipt(
  folder: string,
  input: string,
  destination: string | undefined,
): void {
  if (input.trim() === "") {
    return;
  }
  const pointer = JSON.parse(
    readFileSync(join(folder, "node_modules", ".cache", "independum-gate", "latest.json"), "utf8"),
  ) as { receiptPath: string };
  const receipt: unknown = JSON.parse(readFileSync(pointer.receiptPath, "utf8"));
  const task = readGateTask(
    JSON.parse(readFileSync(join(resolve(pointer.receiptPath, ".."), "task.json"), "utf8")),
    folder,
  );
  readGateReceipt(receipt, task, readPushRevision(folder, input, destination), input);
}

if (import.meta.main) {
  let input = "";
  for await (const chunk of process.stdin) {
    input += String(chunk);
  }
  try {
    checkGateReceipt(resolve(import.meta.dirname, ".."), input, process.argv[3]);
  } catch (error) {
    process.stderr.write(`${error instanceof Error ? error.message : String(error)}\n`);
    process.exitCode = 1;
  }
}
