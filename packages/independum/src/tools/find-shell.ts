import { execFileSync } from "node:child_process";
import { existsSync, lstatSync } from "node:fs";
import { delimiter, dirname, join } from "node:path";
import type { ShellKind } from "../api-types.ts";

/** A shell that the Shell tool runs commands in, named with its version. */
export interface Shell {
  kind: ShellKind;
  name: string;
  path: string;
}

/** The name and the major version of a shell, as it reports them. */
interface Named {
  name: string;
  major: number | undefined;
}

// Starting a shell to ask its version takes a moment, so each one answers once.
const namesByPath = new Map<string, Named>();

/**
 * Returns the shell of a kind on this computer, or the default kind of the system when none is
 * chosen, or undefined when it is not installed. PowerShell counts from version 7.
 */
export function findShell(kind: ShellKind = defaultShellKind()): Shell | undefined {
  const path = kind === "bash" ? findBash() : findPowerShell();
  if (path === undefined) {
    return undefined;
  }
  const { name, major } = nameOf(kind, path);
  return kind === "powershell" && major !== undefined && major < 7
    ? undefined
    : { kind, name, path };
}

/** Returns the kind of shell that a system uses when the user has not chosen one. */
export function defaultShellKind(): ShellKind {
  return process.platform === "win32" ? "powershell" : "bash";
}

/** Returns what the user reads when the shell of a kind is not installed on this computer. */
export function missingShellOf(kind: ShellKind): string {
  if (kind === "powershell") {
    return "PowerShell 7 or newer is not installed on this computer.";
  }
  return process.platform === "win32"
    ? "Git Bash is not installed on this computer. It comes with Git for Windows."
    : "Bash is not installed on this computer.";
}

function findPowerShell(): string | undefined {
  if (process.platform !== "win32") {
    return findOnPath("pwsh");
  }
  const programFiles = process.env.ProgramFiles;
  return (
    findOnPath("pwsh.exe") ??
    existing(
      programFiles === undefined ? undefined : join(programFiles, "PowerShell", "7", "pwsh.exe"),
    )
  );
}

// Git Bash sits beside Git. The bash.exe of WSL, in System32 or among the Store apps, runs inside
// Linux with other paths, so it never counts.
function findBash(): string | undefined {
  if (process.platform !== "win32") {
    return findOnPath("bash");
  }
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

// The version tells the model which features the shell has, so the name carries it.
function nameOf(kind: ShellKind, path: string): Named {
  const known = namesByPath.get(path);
  if (known !== undefined) {
    return known;
  }
  const base =
    kind === "powershell" ? "PowerShell" : process.platform === "win32" ? "Git Bash" : "Bash";
  let version: string | undefined;
  try {
    const output = execFileSync(path, ["--version"], {
      encoding: "utf8",
      timeout: 10_000,
      windowsHide: true,
      stdio: ["ignore", "pipe", "ignore"],
    });
    version = /\d+\.\d+(?:\.\d+)?/.exec(output)?.[0];
  } catch {
    version = undefined;
  }
  const named: Named = {
    name: version === undefined ? base : `${base} ${version}`,
    major: version === undefined ? undefined : Number.parseInt(version, 10),
  };
  namesByPath.set(path, named);
  return named;
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

// A program from the Microsoft Store, such as PowerShell 7, sits on the path as an alias that only
// Windows follows when it starts the program, so on Windows the alias itself counts.
function existing(path: string | undefined): string | undefined {
  if (path === undefined) {
    return undefined;
  }
  if (existsSync(path)) {
    return path;
  }
  try {
    return process.platform === "win32" && lstatSync(path).isSymbolicLink() ? path : undefined;
  } catch {
    return undefined;
  }
}
