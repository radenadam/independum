import { Hono } from "hono";

/** Adds authenticated server identity to the application routes. */
export function createApiRoutes(
  api: Hono,
  identity?: { serverId: string; version: string; protocolVersion: number },
): Hono {
  return new Hono()
    .get("/health", (context) => context.json({ status: "ok", ...identity }))
    .route("/", api);
}
