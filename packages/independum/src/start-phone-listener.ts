import { X509Certificate } from "node:crypto";
import { existsSync, readFileSync } from "node:fs";
import { createServer as createHttpServer, type Server, type ServerResponse } from "node:http";
import { createServer as createHttpsServer } from "node:https";
import { isIP } from "node:net";
import { join } from "node:path";
import { getRequestListener, type HttpBindings } from "@hono/node-server";
import { serveStatic } from "@hono/node-server/serve-static";
import type { PhoneConnection } from "./api-types.ts";
import { createPhoneServer, type PhoneServerOptions } from "./create-phone-server.ts";
import { trackConnections } from "./track-connections.ts";

/** Starts exactly one phone address and serves only the built UI and scoped API. */
export async function startPhoneListener(
  options: PhoneServerOptions & {
    uiRoot?: string;
  },
): Promise<() => Promise<void>> {
  const { connection, pairings } = options;
  const root = options.uiRoot ?? join(import.meta.dirname, "..", "..", "web", "dist");
  if (!existsSync(join(root, "index.html"))) {
    throw new Error(
      "Build the phone UI with pnpm --filter @independum/web build before enabling access.",
    );
  }
  const responses = new Map<string, Set<ServerResponse>>();
  const bindings = new WeakMap<Request, HttpBindings>();
  const application = createPhoneServer({
    ...options,
    track(phone, request) {
      const response = bindings.get(request)?.outgoing;
      if (response !== undefined) {
        const active = responses.get(phone.id) ?? new Set<ServerResponse>();
        active.add(response);
        responses.set(phone.id, active);
        response.once("close", () => {
          active.delete(response);
          if (active.size === 0) {
            responses.delete(phone.id);
          }
        });
      }
    },
  });
  application.get("*", serveStatic({ root }));
  application.get("*", (context) => context.text("The page does not exist.", 404));
  const listener = getRequestListener((request, environment) => {
    const incoming = environment as HttpBindings;
    if (connection.kind === "proxy" && incoming.incoming.socket.remoteAddress !== "127.0.0.1") {
      return new Response("The proxy peer is not allowed.", { status: 403 });
    }
    bindings.set(request, incoming);
    return application.fetch(request);
  });
  let server: Server;
  try {
    server =
      connection.kind === "proxy"
        ? createHttpServer(listener)
        : createHttpsServer(certificateOptions(connection), listener);
  } catch {
    throw new Error("The supplied certificate and private key could not start HTTPS.");
  }
  const closeConnections = trackConnections(server);
  server.headersTimeout = 10000;
  server.requestTimeout = 15000;
  server.maxHeadersCount = 64;
  const unsubscribe = pairings.subscribeRevocation((id) => {
    for (const response of responses.get(id) ?? []) {
      response.destroy();
    }
    responses.delete(id);
  });
  try {
    await new Promise<void>((resolve, reject) => {
      server.once("error", reject);
      server.listen(
        {
          host: connection.address,
          port: connection.port,
          ipv6Only: isIP(connection.address) === 6,
        },
        resolve,
      );
    });
  } catch {
    unsubscribe();
    closeConnections();
    server.close();
    throw new Error(
      "The phone listener could not bind the selected address and port. Select an available address and port.",
    );
  }
  let closing: Promise<void> | undefined;
  return close;

  function close(): Promise<void> {
    closing ??= new Promise<void>((resolve, reject) => {
      unsubscribe();
      closeConnections();
      server.close((error) => (error === undefined ? resolve() : reject(error)));
    });
    return closing;
  }
}

function certificateOptions(connection: PhoneConnection): {
  cert: Buffer;
  key: Buffer;
  minVersion: "TLSv1.2";
} {
  try {
    const cert = readFileSync(connection.certificatePath ?? "");
    const key = readFileSync(connection.keyPath ?? "");
    const certificate = new X509Certificate(cert);
    const hostname = new URL(connection.origin).hostname.replace(/^\[|\]$/g, "");
    const matches =
      isIP(hostname) === 0 ? certificate.checkHost(hostname) : certificate.checkIP(hostname);
    if (
      matches === undefined ||
      Date.parse(certificate.validFrom) > Date.now() ||
      Date.parse(certificate.validTo) <= Date.now()
    ) {
      throw new Error("The certificate does not match.");
    }
    return { cert, key, minVersion: "TLSv1.2" };
  } catch {
    throw new Error(
      "The certificate and key must be readable, current, and cover the exact HTTPS hostname or address.",
    );
  }
}
