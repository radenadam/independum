import { type ChildProcess, spawn } from "node:child_process";
import { join } from "node:path";
import type { Shell } from "./find-shell.ts";

/** What to run, where, and what to do with its output as it comes. */
export interface RunOptions {
  shell: Shell;
  command: string;
  folder: string;
  environment: Record<string, string>;
  timeoutMs: number | undefined;
  signal: AbortSignal | undefined;
  onOutput: (text: string) => void;
}

/**
 * How a command ended: on its own with an exit code or a signal, at its timeout, or stopped by the
 * user, and whether a program that it started still held its output when the run ended.
 */
export interface RunEnd {
  ending: "exited" | "timedOut" | "stopped";
  exitCode: number | null;
  signal: string | null;
  isOutputOpen: boolean;
  durationMs: number;
}

// After the shell ends, its last output still arrives until the output has been quiet this long. A
// program that the command started can keep the output open, so the wait ends after the longest
// drain at the latest.
const quietTime = 100;
const longestDrain = 2000;
// A process tree that ignores the polite request to end gets this long before it is killed.
const killDelay = 2000;

const powerShellArguments = ["-NoLogo", "-NoProfile", "-NonInteractive", "-Command"];
// PowerShell writes to a pipe in the code page of the console, which loses most characters before
// Independum can read them. So the first line of each command sets UTF-8 for the way to Independum,
// and the command keeps its own line numbers.
const powerShellPrefix = "[Console]::OutputEncoding = [System.Text.UTF8Encoding]::new($false); ";

/**
 * Runs one command, as written, in a new process of the shell, in the folder, with no input, and
 * ends the whole process tree on timeout or when the signal aborts. The command gets the
 * environment of the user with the variables that the user added for commands.
 */
export async function runCommand(options: RunOptions): Promise<RunEnd> {
  const { shell, command, folder, environment, timeoutMs, signal, onOutput } = options;
  const startedAt = performance.now();
  if (signal?.aborted === true) {
    return { ending: "stopped", exitCode: null, signal: null, isOutputOpen: false, durationMs: 0 };
  }
  const child = spawn(
    shell.path,
    shell.kind === "powershell"
      ? [...powerShellArguments, `${powerShellPrefix}${command}`]
      : ["-c", command],
    {
      cwd: folder,
      env: { ...process.env, ...environment },
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
  let lastOutputAt = startedAt;
  for (const stream of [child.stdout, child.stderr]) {
    const decoder = new TextDecoder();
    stream?.on("data", (chunk: Buffer) => {
      lastOutputAt = performance.now();
      onOutput(decoder.decode(chunk, { stream: true }));
    });
  }
  let isOutputOpen = false;
  try {
    isOutputOpen = await waitForEnd(child, () => lastOutputAt);
  } finally {
    clearTimeout(timer);
    signal?.removeEventListener("abort", onAbort);
  }
  return {
    ending,
    exitCode: child.exitCode,
    signal: child.signalCode,
    isOutputOpen,
    durationMs: Math.round(performance.now() - startedAt),
  };
}

/** Returns a duration as the model reads it, such as 3.4 s. */
export function describeSeconds(durationMs: number): string {
  return `${(durationMs / 1000).toFixed(1)} s`;
}

// Resolves when all output has closed, or when the output has been quiet since the shell ended, in
// which case a program that the command started still holds it. It resolves to whether that is so.
function waitForEnd(child: ChildProcess, lastOutputAt: () => number): Promise<boolean> {
  return new Promise((resolve, reject) => {
    child.once("error", reject);
    child.once("close", () => resolve(false));
    child.once("exit", () => {
      const exitedAt = performance.now();
      const timer = setInterval(() => {
        const now = performance.now();
        if (
          now - Math.max(exitedAt, lastOutputAt()) >= quietTime ||
          now - exitedAt >= longestDrain
        ) {
          clearInterval(timer);
          child.stdout?.destroy();
          child.stderr?.destroy();
          resolve(true);
        }
      }, quietTime / 2);
      child.once("close", () => clearInterval(timer));
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
