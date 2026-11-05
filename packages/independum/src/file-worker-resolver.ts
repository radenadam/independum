import { realpathSync } from "node:fs";
import { registerHooks } from "node:module";
import { fileURLToPath, pathToFileURL } from "node:url";

// JavaScript realpath probes the Windows drive root, which the sandbox does not grant.
// Native realpath preserves pnpm dependency lookup without that probe.
registerHooks({
  resolve(specifier, context, nextResolve) {
    const result = nextResolve(specifier, context);
    if (result.url.startsWith("file:")) {
      return {
        ...result,
        url: pathToFileURL(realpathSync.native(fileURLToPath(result.url))).href,
      };
    }
    return result;
  },
});
