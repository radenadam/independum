import { homedir } from "node:os";
import { join } from "node:path";
import { createAccessToken } from "./create-access-token.ts";
import { runHeadless } from "./run-headless.ts";

const port = 4870;
// The dev launcher passes the token in the environment. Removing it there keeps it from processes
// the server starts, such as agent tools.
const inheritedToken = process.env.INDEPENDUM_ACCESS_TOKEN;
const token = inheritedToken ?? createAccessToken();
delete process.env.INDEPENDUM_ACCESS_TOKEN;
const directory = join(homedir(), ".independum");
if (process.argv.length > 2) {
  const controller = new AbortController();
  process.once("SIGINT", () => controller.abort());
  process.stdout.on("error", () => controller.abort());
  controller.signal.addEventListener("abort", () => process.stdin.destroy(), { once: true });
  process.exitCode = await runHeadless(process.argv.slice(2), {
    directory,
    folder: process.env.INIT_CWD ?? process.cwd(),
    ...(inheritedToken === undefined ? {} : { token: inheritedToken }),
    signal: controller.signal,
    stdout: (text) => {
      process.stdout.write(text);
    },
    stderr: (text) => {
      process.stderr.write(text);
    },
    async stdin() {
      const parts: Buffer[] = [];
      for await (const part of process.stdin) {
        parts.push(Buffer.from(part));
      }
      // biome-ignore lint/style/useNamingConvention: TextDecoder names this option ignoreBOM.
      return new TextDecoder("utf-8", { fatal: true, ignoreBOM: true }).decode(
        Buffer.concat(parts),
      );
    },
    serve: () => start(false),
  });
} else {
  await start(true);
}

async function start(isDevelopment: boolean): Promise<void> {
  const [{ createChat }, { createModelRuntime }, { startAppServer }] = await Promise.all([
    import("./create-chat.ts"),
    import("./create-model-runtime.ts"),
    import("./start-app-server.ts"),
  ]);
  const models = await createModelRuntime(directory);
  // Scripts run from the package folder under pnpm, which keeps the folder the user started from in
  // INIT_CWD.
  const chat = await createChat({
    models,
    directory,
    folder: process.env.INIT_CWD ?? process.cwd(),
  });

  // Commands of the agent can run in process groups of their own, so they end with
  // Independum instead of outliving it.
  process.once("exit", () => chat.stopAll());
  const server = await startAppServer({ chat, models, directory, token, port, isDevelopment });
  for (const signal of ["SIGINT", "SIGTERM"] as const) {
    process.once(signal, async () => {
      await server.close();
      process.exit(0);
    });
  }

  if (isDevelopment) {
    process.stdout.write(`Independum is running. Open this link:\n${server.url}\n`);
  }
}
