/** Exact inherited variable names in minimal mode, compared without case on Windows. */
export const minimalEnvironmentNames: string[] =
  process.platform === "win32"
    ? [
        "PATH",
        "PATHEXT",
        "SystemRoot",
        "WINDIR",
        "COMSPEC",
        "USERPROFILE",
        "HOMEDRIVE",
        "HOMEPATH",
        "APPDATA",
        "LOCALAPPDATA",
        "ProgramFiles",
        "ProgramFiles(x86)",
        "ProgramW6432",
        "TEMP",
        "TMP",
        "LANG",
        "LC_ALL",
        "LC_CTYPE",
        "TZ",
      ]
    : [
        "PATH",
        "HOME",
        "LANG",
        "LANGUAGE",
        "LC_ALL",
        "LC_CTYPE",
        "LC_COLLATE",
        "LC_MESSAGES",
        "LC_MONETARY",
        "LC_NUMERIC",
        "LC_TIME",
        "TZ",
        "TMPDIR",
        "TMP",
        "TEMP",
      ];

/** Builds the exact child environment and removes the harness access token last. */
export function commandEnvironment(
  mode: "minimal" | "inherit",
  overrides: Record<string, string>,
  inherited: NodeJS.ProcessEnv = process.env,
): Record<string, string> {
  const environment: Record<string, string> = {};
  for (const [name, value] of Object.entries(inherited)) {
    if (
      value !== undefined &&
      (mode === "inherit" ||
        minimalEnvironmentNames.some((allowed) =>
          process.platform === "win32"
            ? allowed.toLowerCase() === name.toLowerCase()
            : allowed === name,
        ))
    ) {
      environment[name] = value;
    }
  }
  for (const [name, value] of Object.entries(overrides)) {
    if (process.platform === "win32") {
      for (const present of Object.keys(environment)) {
        if (present.toLowerCase() === name.toLowerCase()) {
          delete environment[present];
        }
      }
    }
    environment[name] = value;
  }
  for (const name of Object.keys(environment)) {
    if (name.toUpperCase() === "INDEPENDUM_ACCESS_TOKEN") {
      delete environment[name];
    }
  }
  return environment;
}
