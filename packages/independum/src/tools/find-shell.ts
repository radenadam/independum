import { existsSync } from "node:fs";
import { delimiter, dirname, join } from "node:path";
import type { ShellKind } from "../api-types.ts";

/** A shell that the Shell tool runs commands in. */
export interface Shell {
  kind: ShellKind;
  name: string;
  path: string;
}

/**
 * Returns the shell of a kind on this computer, or the default kind of the system when none is
 * chosen, or undefined when it is not installed.
 */
export function findShell(kind: ShellKind = defaultShellKind()): Shell | undefined {
  if (process.platform !== "win32") {
    const path = kind === "bash" ? findOnPath("bash") : findOnPath("pwsh");
    return path === undefined
      ? undefined
      : { kind, name: kind === "bash" ? "Bash" : "PowerShell", path };
  }
  if (kind === "bash") {
    const path = findGitBash();
    return path === undefined ? undefined : { kind, name: "Git Bash on Windows", path };
  }
  const programFiles = process.env.ProgramFiles;
  const modern =
    findOnPath("pwsh.exe") ??
    existing(
      programFiles === undefined ? undefined : join(programFiles, "PowerShell", "7", "pwsh.exe"),
    );
  if (modern !== undefined) {
    return { kind, name: "PowerShell 7", path: modern };
  }
  const systemRoot = process.env.SystemRoot ?? process.env.windir;
  const windows = existing(
    systemRoot === undefined
      ? undefined
      : join(systemRoot, "System32", "WindowsPowerShell", "v1.0", "powershell.exe"),
  );
  return windows === undefined
    ? undefined
    : { kind, name: "Windows PowerShell 5.1", path: windows };
}

/** Returns the kind of shell that a system uses when the user has not chosen one. */
export function defaultShellKind(): ShellKind {
  return process.platform === "win32" ? "powershell" : "bash";
}

// Git Bash sits beside Git. The bash.exe of WSL, in System32 or among the Store apps, runs inside
// Linux with other paths, so it never counts.
function findGitBash(): string | undefined {
  const git = findOnPath("git.exe");
  const programFiles = process.env.ProgramFiles;
  const candidates = [
    git === undefined ? undefined : join(dirname(dirname(git)), "bin", "bash.exe"),
    programFiles === undefined ? undefined : join(programFiles, "Git", "bin", "bash.exe"),
  ];
  for (const candidate of candidates) {
    if (existing(candidate) !== undefined) {
      return candidate;
    }
  }
  return undefined;
}

function findOnPath(name: string): string | undefined {
  const pathKey = Object.keys(process.env).find((key) => key.toLowerCase() === "path") ?? "PATH";
  for (const folder of (process.env[pathKey] ?? "").split(delimiter)) {
    const candidate = folder === "" ? undefined : existing(join(folder, name));
    if (candidate !== undefined) {
      return candidate;
    }
  }
  return undefined;
}

function existing(path: string | undefined): string | undefined {
  return path !== undefined && existsSync(path) ? path : undefined;
}
