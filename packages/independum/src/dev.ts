import { type ChildProcess, spawn } from "node:child_process";
import { readdirSync, statSync, watch } from "node:fs";
import { join } from "node:path";
import { createAccessToken } from "./create-access-token.ts";

// Each restart inherits this token, so an open page keeps working until the run stops.
process.env.INDEPENDUM_ACCESS_TOKEN = createAccessToken();

const folder = import.meta.dirname;
const modifiedTimes = new Map<string, number | undefined>();
for (const name of readdirSync(folder, { recursive: true, encoding: "utf8" })) {
  modifiedTimes.set(name, readModifiedTime(name));
}
let server = startServer();
let restartTimer: NodeJS.Timeout | undefined;

// Windows sometimes reports a change for a file that did not change, for example a module that Pi
// loads when the first message is sent. A restart then cuts off the reply, so the server restarts
// only when a file in this folder gets a new modified time.
watch(folder, { recursive: true }, (_eventType, name) => {
  if (name === null || modifiedTimes.get(name) === readModifiedTime(name)) {
    return;
  }
  modifiedTimes.set(name, readModifiedTime(name));
  process.stdout.write(`Restarting Independum, because ${name} changed.\n`);
  // An editor can write a file in several steps, so the restart waits for the last one.
  clearTimeout(restartTimer);
  restartTimer = setTimeout(restart, 100);
});

function startServer(): ChildProcess {
  return spawn(process.execPath, [join(folder, "cli.ts")], { stdio: "inherit" });
}

function restart(): void {
  if (server.exitCode === null && server.signalCode === null) {
    server.once("exit", restart);
    server.kill();
    return;
  }
  server = startServer();
}

function readModifiedTime(name: string): number | undefined {
  return statSync(join(folder, name), { throwIfNoEntry: false })?.mtimeMs;
}
