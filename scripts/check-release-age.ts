import { readFileSync } from "node:fs";
import { runCheck } from "./run-check.ts";

const settingsFile = "pnpm-workspace.yaml";

// The package manager installs a version only once it is a day old, which gives the registry time
// to pull a compromised release. A setting that shortens or skips that wait turns this off.
runCheck((files) =>
  files
    .filter((file) => file === settingsFile)
    .flatMap((file) =>
      /^minimumReleaseAge/m.test(readFileSync(file, "utf8"))
        ? [`${file}: Wait until a version is old enough instead of relaxing the release age.`]
        : [],
    ),
);
