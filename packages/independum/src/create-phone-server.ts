import type { Hono } from "hono";
import { Hono as Application } from "hono";
import { bodyLimit } from "hono/body-limit";
import type { PairedPhone, PhoneConnection } from "./api-types.ts";
import { createApiRoutes } from "./create-api-routes.ts";
import { PairingError, type PhonePairings } from "./create-phone-pairings.ts";
import { readPhoneName } from "./read-phone-name.ts";

/** The shared services and exact transport identity of a phone listener. */
export interface PhoneServerOptions {
  connection: PhoneConnection;
  pairings: PhonePairings;
  api: Hono;
  identity: { serverId: string; version: string; protocolVersion: number };
  track?: (phone: PairedPhone, request: Request) => void;
}

/** Creates the phone boundary with separate credential purposes and exact address checks. */
export function createPhoneServer(options: PhoneServerOptions): Hono {
  const { connection, pairings } = options;
  const server = new Application();
  const host =
    connection.kind === "proxy" ? `127.0.0.1:${connection.port}` : new URL(connection.origin).host;
  server.onError((error, context) =>
    context.json(
      {
        error:
          error instanceof PairingError
            ? error.message
            : "Phone access could not complete the request.",
      },
      error instanceof PairingError ? error.status : 500,
    ),
  );
  server.use("*", async (context, next) => {
    context.header("Cache-Control", "no-store");
    context.header("Referrer-Policy", "no-referrer");
    const origin = context.req.header("origin");
    if (
      new URL(context.req.url).host !== host ||
      (origin !== undefined && origin !== connection.origin)
    ) {
      return context.json({ error: "Requests must come from the configured phone address." }, 403);
    }
    return next();
  });
  server.use(
    "/api/pairing/*",
    bodyLimit({
      maxSize: 1024,
      onError: (context) =>
        context.json({ error: "A pairing request must fit within 1024 bytes." }, 413),
    }),
  );
  server.use("/api/*", async (context, next) => {
    const credential = bearer(context.req.header("authorization"));
    if (context.req.path === "/api/pairing/claim" && context.req.method === "POST") {
      return context.json(pairings.claim(credential, await readPhoneName(context)), 201);
    }
    if (context.req.path === "/api/pairing/receipt" && context.req.method === "GET") {
      return context.json(pairings.collect(credential));
    }
    const phone = pairings.authenticate(credential);
    if (phone === undefined) {
      return context.json({ error: "This phone is not paired or its access is revoked." }, 401);
    }
    options.track?.(phone, context.req.raw);
    if (context.req.path === "/api/phone/self") {
      if (context.req.method === "GET") {
        return context.json(phone);
      }
      if (context.req.method === "PUT") {
        pairings.rename(phone.id, await readPhoneName(context));
        return context.body(null, 204);
      }
      if (context.req.method === "DELETE") {
        pairings.revoke(phone.id);
        return context.body(null, 204);
      }
    }
    if (
      context.req.path.startsWith("/api/phone-access") ||
      context.req.path.startsWith("/api/server") ||
      context.req.path.startsWith("/api/pairing")
    ) {
      return context.json({ error: "This action requires local control on the computer." }, 403);
    }
    return next();
  });
  server.route("/api", createApiRoutes(options.api, options.identity));
  server.all("/api/*", (context) => context.json({ error: "The API route does not exist." }, 404));
  return server;
}

function bearer(authorization: string | undefined): string {
  return authorization?.startsWith("Bearer ") ? authorization.slice(7) : "";
}
