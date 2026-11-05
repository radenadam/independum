import { homedir } from "node:os";
import { join } from "node:path";
import { createAccessToken } from "./create-access-token.ts";
import { createChat } from "./create-chat.ts";
import { createModelRuntime } from "./create-model-runtime.ts";
import { startAppServer } from "./start-app-server.ts";

const port = 4870;
// The dev launcher passes the token in the environment. Removing it there keeps it from processes
// the server starts, such as agent tools.
const token = process.env.INDEPENDUM_ACCESS_TOKEN ?? createAccessToken();
delete process.env.INDEPENDUM_ACCESS_TOKEN;
const directory = join(homedir(), ".independum");
const models = await createModelRuntime(directory);
// Scripts run from the package folder under pnpm, which keeps the folder the user started from in
// INIT_CWD.
const chat = await createChat({ models, directory, cwd: process.env.INIT_CWD ?? process.cwd() });

// Background commands of the agent can run in process groups of their own, so they end with
// Independum instead of outliving it.
process.once("exit", () => chat.stopAll());
for (const signal of ["SIGINT", "SIGTERM"] as const) {
  process.once(signal, () => {
    chat.stopAll();
    process.kill(process.pid, signal);
  });
}

const server = await startAppServer({ chat, models, directory, token, port });
process.stdout.write(`Independum is running. Open this link:\n${server.url}\n`);
