import { type ChildProcess, spawn } from "node:child_process";
import { randomUUID } from "node:crypto";
import { rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import type { Shell } from "./find-shell.ts";

/** What to run, where, and what to do with its output as it comes. */
export interface RunOptions {
  shell: Shell;
  command: string;
  folder: string;
  timeoutMs: number | undefined;
  signal: AbortSignal | undefined;
  onOutput: (text: string) => void;
}

/** How a command ended: on its own with an exit code, at its timeout, or stopped by the user. */
export interface RunEnd {
  ending: "exited" | "timedOut" | "stopped";
  exitCode: number | null;
  durationMs: number;
}

// A program that a command starts in the background can hold the output open after the shell ends,
// so the output gets this long to drain before the run counts as ended.
const drainTime = 250;
// A process tree that ignores the polite request to end gets this long before it is killed.
const killDelay = 2000;

/**
 * Runs one command in a new process of the shell, in the folder, with no input, and ends the whole
 * process tree on timeout or when the signal aborts.
 */
export async function runCommand(options: RunOptions): Promise<RunEnd> {
  const { shell, command, folder, timeoutMs, signal, onOutput } = options;
  const startedAt = performance.now();
  if (signal?.aborted === true) {
    return { ending: "stopped", exitCode: null, durationMs: 0 };
  }
  const script = shell.kind === "powershell" ? writePowerShellScript(command) : undefined;
  const child = spawn(
    shell.path,
    script === undefined ? ["-c", command] : [...powerShellArguments, "-File", script],
    {
      cwd: folder,
      env: {
        ...process.env,
        // Pagers and password prompts wait for input that never comes.
        // biome-ignore-start lint/style/useNamingConvention: Git and the system name these variables.
        PAGER: "cat",
        GIT_PAGER: "cat",
        GIT_TERMINAL_PROMPT: "0",
        // biome-ignore-end lint/style/useNamingConvention: Git and the system name these variables.
      },
      stdio: ["ignore", "pipe", "pipe"],
      // On other systems the shell leads its own process group, so the whole tree can be ended.
      detached: process.platform !== "win32",
      windowsHide: true,
    },
  );
  let ending: RunEnd["ending"] = "exited";
  function stop(reason: RunEnd["ending"]): void {
    ending = reason;
    endTree(child);
  }
  function onAbort(): void {
    stop("stopped");
  }
  signal?.addEventListener("abort", onAbort, { once: true });
  const timer = timeoutMs === undefined ? undefined : setTimeout(() => stop("timedOut"), timeoutMs);
  for (const stream of [child.stdout, child.stderr]) {
    const decoder = new TextDecoder();
    stream?.on("data", (chunk: Buffer) => onOutput(decoder.decode(chunk, { stream: true })));
  }
  try {
    await waitForEnd(child);
  } finally {
    clearTimeout(timer);
    signal?.removeEventListener("abort", onAbort);
    if (script !== undefined) {
      rmSync(script, { force: true });
    }
  }
  return {
    ending,
    exitCode: child.exitCode,
    durationMs: Math.round(performance.now() - startedAt),
  };
}

/** Returns a duration as the model reads it, such as 3.4 s. */
export function describeSeconds(durationMs: number): string {
  return `${(durationMs / 1000).toFixed(1)} s`;
}

const powerShellArguments = [
  "-NoLogo",
  "-NoProfile",
  "-NonInteractive",
  "-ExecutionPolicy",
  "Bypass",
];

// A script file takes the command exactly as written, with any quotes and lines. PowerShell reports
// success for most failures, so the script ends with the exit code of the last command, as a shell
// does. Windows PowerShell reads a script without a byte order mark in the code page of the system.
function writePowerShellScript(command: string): string {
  const path = join(tmpdir(), `independum-${randomUUID()}.ps1`);
  const script = [
    "[Console]::OutputEncoding = [System.Text.Encoding]::UTF8",
    "$OutputEncoding = [System.Text.Encoding]::UTF8",
    command,
    "if (-not $?) { if ($LASTEXITCODE) { exit $LASTEXITCODE } exit 1 }",
    "exit 0",
  ].join("\n");
  writeFileSync(path, `\uFEFF${script}`);
  return path;
}

function waitForEnd(child: ChildProcess): Promise<void> {
  return new Promise((resolve, reject) => {
    child.once("error", reject);
    child.once("close", () => resolve());
    child.once("exit", () => {
      setTimeout(() => {
        child.stdout?.destroy();
        child.stderr?.destroy();
        resolve();
      }, drainTime);
    });
  });
}

function endTree(child: ChildProcess): void {
  const { pid } = child;
  if (pid === undefined || child.exitCode !== null) {
    return;
  }
  if (process.platform === "win32") {
    const systemRoot = process.env.SystemRoot ?? process.env.windir;
    const taskkill =
      systemRoot === undefined ? "taskkill.exe" : join(systemRoot, "System32", "taskkill.exe");
    spawn(taskkill, ["/pid", String(pid), "/T", "/F"], { stdio: "ignore", windowsHide: true });
    return;
  }
  signalGroup(pid, "SIGTERM");
  setTimeout(() => {
    if (child.exitCode === null) {
      signalGroup(pid, "SIGKILL");
    }
  }, killDelay).unref();
}

function signalGroup(pid: number, signal: NodeJS.Signals): void {
  try {
    process.kill(-pid, signal);
  } catch {
    // The group has already ended.
  }
}
