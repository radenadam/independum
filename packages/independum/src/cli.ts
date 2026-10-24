import { createServer as createHttpServer } from "node:http";
import { join } from "node:path";
import { getRequestListener } from "@hono/node-server";
import { createServer as createViteServer } from "vite";
import { createServer } from "./create-server.ts";

// Binds to loopback so no other device can connect until token auth exists.
// See `docs/decisions/0005-phone-access-through-token-auth.md`.
const host = "127.0.0.1";
const port = 4870;

const httpServer = createHttpServer();
const handleApi = getRequestListener(createServer().fetch);
// The native loader imports the config directly. The default loader writes a temporary file,
// which `node --watch` sees as a change, so the server would restart forever.
const vite = await createViteServer({
  root: join(import.meta.dirname, "..", "..", "web"),
  configLoader: "native",
  appType: "spa",
  server: { middlewareMode: true, hmr: { server: httpServer } },
});

httpServer.on("request", (request, response) => {
  if (request.url?.startsWith("/api/")) {
    handleApi(request, response);
  } else {
    vite.middlewares(request, response);
  }
});

httpServer.listen(port, host, () => {
  process.stdout.write(`Independum is running at http://${host}:${port}\n`);
});
