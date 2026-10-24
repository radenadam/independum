import { spawn } from "node:child_process";
import { join } from "node:path";
import { createAccessToken } from "./create-access-token.ts";

// Watch mode restarts the server after every change. Each restart inherits this token, so an open
// page keeps working until the run stops.
process.env.INDEPENDUM_ACCESS_TOKEN = createAccessToken();
spawn(process.execPath, ["--watch", join(import.meta.dirname, "cli.ts")], { stdio: "inherit" });
