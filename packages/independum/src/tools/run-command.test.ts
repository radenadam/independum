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
    environment: {},
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

test("a command gets the variables that the user added, on top of the environment", async () => {
  const read =
    shell.kind === "powershell"
      ? "echo $env:INDEPENDUM_ADDED $env:INDEPENDUM_PATH_SEEN"
      : "echo $INDEPENDUM_ADDED $INDEPENDUM_PATH_SEEN";
  // biome-ignore-start lint/style/useNamingConvention: Shells name environment variables in capitals.
  const { output } = await run(read, {
    environment: { INDEPENDUM_ADDED: "added", INDEPENDUM_PATH_SEEN: "kept" },
  });
  // biome-ignore-end lint/style/useNamingConvention: Shells name environment variables in capitals.
  expect(output).toContain("added");
  expect(output).toContain("kept");
});

test("a shell is named with its version, and its output keeps every character", async () => {
  expect(shell.name).toMatch(/^(PowerShell|Git Bash|Bash) \d+\.\d+/);
  const { output, end } = await run('echo "h\u00e9llo \u2713 \u65e5\u672c"');
  expect(output).toContain("h\u00e9llo \u2713 \u65e5\u672c");
  expect(end.exitCode).toBe(0);
});

const bash = findShell("bash");

test.skipIf(bash === undefined)(
  "the run ends when a program that the command started still holds its output",
  async () => {
    const { output, end } = await run("(sleep 6; echo late) & echo early", {
      shell: bash as NonNullable<typeof bash>,
    });
    expect(output).toContain("early");
    expect(output).not.toContain("late");
    expect(end).toMatchObject({ ending: "exited", exitCode: 0, isOutputOpen: true });
    expect(end.durationMs).toBeLessThan(5000);
  },
);

test.skipIf(bash === undefined || process.platform === "win32")(
  "a command that a signal ends says which signal",
  async () => {
    const { end } = await run("kill -KILL $$", { shell: bash as NonNullable<typeof bash> });
    expect(end).toMatchObject({ ending: "exited", exitCode: null, signal: "SIGKILL" });
  },
);

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
