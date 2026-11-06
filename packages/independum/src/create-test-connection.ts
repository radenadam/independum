import type { ServerConnection } from "./private-runtime.ts";

/** Returns an isolated test connection with a token that grants no real access. */
export function createTestConnection(): ServerConnection {
  return {
    version: 1,
    serverId: "server-one",
    pid: process.pid,
    url: "http://127.0.0.1:4870",
    accessToken: "private-test-token-with-enough-characters",
  };
}
