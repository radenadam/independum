import { Hono } from "hono";

export function createServer(): Hono {
  const server = new Hono();
  server.get("/api/health", (context) => context.json({ status: "ok" }));
  return server;
}
