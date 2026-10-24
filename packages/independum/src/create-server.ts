import { Buffer } from "node:buffer";
import { timingSafeEqual } from "node:crypto";
import { Hono } from "hono";

/** Settings that decide which requests may use the API. */
export interface ServerOptions {
  token: string;
  addresses: string[];
}

/** Creates the API, which answers only requests that carry the access token. */
export function createServer(options: ServerOptions): Hono {
  const hosts = new Set(options.addresses);
  const origins = new Set(options.addresses.map((address) => `http://${address}`));
  const server = new Hono();

  // Checking the host blocks DNS rebinding, and checking the origin blocks other websites.
  server.use("/api/*", async (context, next) => {
    const origin = context.req.header("origin");
    if (
      !hosts.has(new URL(context.req.url).host) ||
      (origin !== undefined && !origins.has(origin))
    ) {
      return context.json({ error: "Requests must come from Independum itself." }, 403);
    }
    if (!hasToken(context.req.header("authorization"), options.token)) {
      return context.json({ error: "The access token is missing or wrong." }, 401);
    }
    await next();
    return undefined;
  });

  server.get("/api/health", (context) => context.json({ status: "ok" }));
  return server;
}

function hasToken(authorization: string | undefined, token: string): boolean {
  const expected = Buffer.from(`Bearer ${token}`);
  const actual = Buffer.from(authorization ?? "");
  return actual.length === expected.length && timingSafeEqual(actual, expected);
}
