import { tmpdir } from "node:os";
import { expect, test } from "vitest";
import { findShell } from "./find-shell.ts";
import { type RunOptions, runCommand } from "./run-command.ts";

const shell = findShell();
if (shell === undefined) {
  throw new Error("The tests need the default shell of this system.");
}
const pause = shell.kind === "powershell" ? "Start-Sleep -Seconds 20" : "sleep 20";

async function run(
  command: string,
  options: Partial<RunOptions> = {},
): Promise<{ output: string; end: Awaited<ReturnType<typeof runCommand>> }> {
  let output = "";
  const end = await runCommand({
    shell: shell as NonNullable<typeof shell>,
    command,
    folder: tmpdir(),
    timeoutMs: undefined,
    signal: undefined,
    onOutput: (text) => {
      output += text;
    },
    ...options,
  });
  return { output, end };
}

test("a command prints its output and ends with its exit code", async () => {
  const { output, end } = await run('echo "hello from the shell"\nexit 3');
  expect(output).toContain("hello from the shell");
  expect(end).toMatchObject({ ending: "exited", exitCode: 3 });
});

test("a command that fails without an exit code of its own ends with a failure", async () => {
  const { end } = await run(
    shell.kind === "powershell" ? "Get-Item ./no-such-file" : "ls ./no-such-file",
  );
  expect(end.ending).toBe("exited");
  expect(end.exitCode).not.toBe(0);
});

test("a command stops at its timeout and when its signal aborts", async () => {
  const timedOut = await run(pause, { timeoutMs: 300 });
  expect(timedOut.end.ending).toBe("timedOut");
  expect(timedOut.end.durationMs).toBeLessThan(10_000);

  const controller = new AbortController();
  setTimeout(() => controller.abort(), 300);
  const stopped = await run(pause, { signal: controller.signal });
  expect(stopped.end.ending).toBe("stopped");
  expect(stopped.end.durationMs).toBeLessThan(10_000);
});
