import { randomBytes } from "node:crypto";
import { createServer as createHttpServer } from "node:http";
import { homedir } from "node:os";
import { join } from "node:path";
import { getRequestListener } from "@hono/node-server";
import { createServer as createViteServer } from "vite";
import { createModelRuntime } from "./create-model-runtime.ts";
import { createServer } from "./create-server.ts";
import { createLoginRoutes } from "./login-routes.ts";
import { readInstallationId } from "./read-installation-id.ts";

// Binds to loopback so no other device can connect until network access and phone pairing exist.
// See `docs/decisions/0005-phone-access-through-token-auth.md`.
const host = "127.0.0.1";
const port = 4870;
const token = randomBytes(32).toString("base64url");
const directory = join(homedir(), ".independum");
const models = await createModelRuntime(directory);

const httpServer = createHttpServer();
const handleApi = getRequestListener(
  createServer({
    token,
    addresses: [`${host}:${port}`, `localhost:${port}`],
    api: createLoginRoutes(models, { getDeviceId: () => readInstallationId(directory) }),
  }).fetch,
);
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

// The token sits after the # because browsers never send that part of a link to a server.
httpServer.listen(port, host, () => {
  process.stdout.write(
    `Independum is running. Open this link:\nhttp://${host}:${port}/#token=${token}\n`,
  );
});
