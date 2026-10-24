import { serve } from "@hono/node-server";
import { createServer } from "./create-server.ts";

// Binds to loopback so no other device can connect until token auth exists.
// See `docs/decisions/0005-phone-access-through-token-auth.md`.
const host = "127.0.0.1";
const port = 4870;

serve({ fetch: createServer().fetch, hostname: host, port }, (info) => {
  process.stdout.write(`Independum is running at http://${host}:${info.port}\n`);
});
