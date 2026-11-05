import { createServer as createHttpServer } from "node:http";
import { join } from "node:path";
import type { ModelRuntime } from "@earendil-works/pi-coding-agent";
import { getRequestListener } from "@hono/node-server";
import { Hono } from "hono";
import { createServer as createViteServer } from "vite";
import { createChatRoutes } from "./chat-routes.ts";
import type { Chat } from "./create-chat.ts";
import { createServer } from "./create-server.ts";
import { createLoginRoutes } from "./login-routes.ts";
import { readInstallationId } from "./read-installation-id.ts";

/** Starts the UI and API on one loopback port. */
export async function startAppServer(options: {
  chat: Chat;
  models: ModelRuntime;
  directory: string;
  token: string;
  port: number;
}): Promise<{ url: string; close: () => Promise<void> }> {
  const { chat, models, directory, token, port } = options;
  const httpServer = createHttpServer();
  await new Promise<void>((resolve, reject) => {
    httpServer.once("error", reject);
    httpServer.listen(port, "127.0.0.1", resolve);
  });
  const address = httpServer.address();
  if (address === null || typeof address === "string") {
    throw new Error("The server has no TCP address.");
  }
  try {
    const handleApi = getRequestListener(
      createServer({
        token,
        addresses: [`127.0.0.1:${address.port}`, `localhost:${address.port}`],
        api: new Hono()
          .route(
            "/",
            createLoginRoutes(models, { getDeviceId: () => readInstallationId(directory) }),
          )
          .route("/", createChatRoutes(chat, models)),
      }).fetch,
    );
    const vite = await createViteServer({
      root: join(import.meta.dirname, "..", "..", "web"),
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
    return { url: `http://127.0.0.1:${address.port}/#token=${token}`, close };

    async function close(): Promise<void> {
      await chat.stopAll();
      await vite.close();
      httpServer.closeAllConnections();
      await new Promise<void>((resolve, reject) => {
        httpServer.close((error) => (error === undefined ? resolve() : reject(error)));
      });
    }
  } catch (error) {
    httpServer.close();
    throw error;
  }
}
