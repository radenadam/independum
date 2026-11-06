import { randomUUID } from "node:crypto";
import { readFileSync } from "node:fs";
import { createServer as createHttpServer } from "node:http";
import { join } from "node:path";
import type { ModelRuntime } from "@earendil-works/pi-coding-agent";
import { getRequestListener } from "@hono/node-server";
import { serveStatic } from "@hono/node-server/serve-static";
import { type Context, Hono, type Next } from "hono";
import { createServer as createViteServer, type ViteDevServer } from "vite";
import type { Chat } from "./create-chat.ts";
import { createChatRoutes } from "./create-chat-routes.ts";
import { createHeadlessRoutes } from "./create-headless-routes.ts";
import { createLoginRoutes } from "./create-login-routes.ts";
import { createOperations } from "./create-operations.ts";
import { createPhoneAccess } from "./create-phone-access.ts";
import { createServer } from "./create-server.ts";
import { publishServer, readServer, removeServer } from "./private-runtime.ts";
import { readInstallationId } from "./read-installation-id.ts";

/** Starts the UI and API on one loopback port. */
export async function startAppServer(options: {
  chat: Chat;
  models: ModelRuntime;
  directory: string;
  token: string;
  port: number;
  isDevelopment?: boolean;
  onPhoneStatus?: (message: string) => void;
}): Promise<{ url: string; close: () => Promise<void> }> {
  const { chat, models, directory, token, port } = options;
  const serverId = randomUUID();
  const version = (
    JSON.parse(readFileSync(join(import.meta.dirname, "..", "package.json"), "utf8")) as {
      version: string;
    }
  ).version;
  let operations: ReturnType<typeof createOperations> | undefined;
  let phoneAccess: ReturnType<typeof createPhoneAccess> | undefined;
  let unpublish: (() => void) | undefined;
  let vite: ViteDevServer | undefined;
  let closing: Promise<void> | undefined;
  let isStopping = false;
  let activeMutations = 0;
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
    operations = createOperations(chat, directory, serverId);
    const identity = { serverId, version, protocolVersion: 1 };
    const api = new Hono()
      .route("/", createLoginRoutes(models, { getDeviceId: () => readInstallationId(directory) }))
      .route("/", createChatRoutes(chat, models))
      .route("/", createHeadlessRoutes(operations));
    phoneAccess = createPhoneAccess({
      directory,
      api: new Hono().use("*", guardRequest).route("/", api),
      identity,
      ...(options.onPhoneStatus === undefined ? {} : { onStatus: options.onPhoneStatus }),
    });
    const application = createServer({
      identity,
      token,
      addresses: [`127.0.0.1:${address.port}`, `localhost:${address.port}`],
      api: new Hono().use("*", guardRequest).route("/", phoneAccess.routes).route("/", api),
    });
    const isDevelopment = options.isDevelopment ?? true;
    if (!isDevelopment) {
      application.get(
        "*",
        serveStatic({ root: join(import.meta.dirname, "..", "..", "web", "dist") }),
      );
      application.get("*", (context) => context.text("The built UI is not installed.", 503));
    }
    application.post("/api/server/stop", async (context) => {
      const body: unknown = await context.req.json().catch(() => undefined);
      if (
        typeof body !== "object" ||
        body === null ||
        !("force" in body) ||
        typeof body.force !== "boolean" ||
        Object.keys(body).some((key) => key !== "force")
      ) {
        return context.json({ error: "Stopping requires an explicit force value." }, 400);
      }
      if ((chat.hasWork() || activeMutations > 1) && !body.force) {
        return context.json({ error: "The server has active work. Stopping requires force." }, 409);
      }
      isStopping = true;
      setTimeout(() => {
        close().catch(() => undefined);
      }, 50);
      return context.body(null, 204);
    });
    const handleApi = getRequestListener(application.fetch);
    vite = isDevelopment
      ? await createViteServer({
          root: join(import.meta.dirname, "..", "..", "web"),
          appType: "spa",
          server: { middlewareMode: true, hmr: { server: httpServer } },
        })
      : undefined;
    httpServer.on("request", (request, response) => {
      if (request.url?.startsWith("/api/") || vite === undefined) {
        handleApi(request, response);
      } else {
        vite.middlewares(request, response);
      }
    });
    const previous = readServer(directory);
    if (previous !== undefined) {
      removeServer(directory, previous.serverId);
    }
    unpublish = publishServer(directory, {
      version: 1,
      serverId,
      pid: process.pid,
      url: `http://127.0.0.1:${address.port}`,
      accessToken: token,
    });
    return { url: `http://127.0.0.1:${address.port}/#token=${token}`, close };

    async function close(): Promise<void> {
      isStopping = true;
      closing ??= closeResources();
      return closing;
    }
    async function closeResources(): Promise<void> {
      try {
        await phoneAccess?.close();
        await chat.stopAll();
      } finally {
        operations?.close();
        try {
          unpublish?.();
        } finally {
          await vite?.close();
          httpServer.closeAllConnections();
          await new Promise<void>((resolve, reject) => {
            httpServer.close((error) => (error === undefined ? resolve() : reject(error)));
          });
        }
      }
    }
  } catch (error) {
    await phoneAccess?.close();
    operations?.close();
    unpublish?.();
    await vite?.close();
    httpServer.close();
    throw error;
  }

  async function guardRequest(context: Context, next: Next): Promise<Response | undefined> {
    if (isStopping) {
      return context.json({ error: "The server is stopping." }, 409);
    }
    const isMutation = !["GET", "HEAD", "OPTIONS"].includes(context.req.method);
    if (isMutation) {
      activeMutations += 1;
    }
    try {
      await next();
    } finally {
      if (isMutation) {
        activeMutations -= 1;
      }
    }
    return undefined;
  }
}
