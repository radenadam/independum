import type { Hono } from "hono";
import { Hono as Application } from "hono";
import { renderSVG } from "uqr";
import type { PhoneAccessState, PhoneConnection } from "./api-types.ts";
import { createPhonePairings, PairingError } from "./create-phone-pairings.ts";
import { phoneAddresses, readPhoneConnection } from "./phone-connection.ts";
import { readPhoneName } from "./read-phone-name.ts";
import { startPhoneListener } from "./start-phone-listener.ts";

/** Creates the local-only phone controls and owns the separate listener's lifetime. */
export function createPhoneAccess(options: {
  directory: string;
  api: Hono;
  identity: { serverId: string; version: string; protocolVersion: number };
  onStatus?: (message: string) => void;
}): { routes: Hono; close: () => Promise<void> } {
  const pairings = createPhonePairings(options.directory);
  let connection: PhoneConnection | null = null;
  let stop: (() => Promise<void>) | undefined;
  let starting: Promise<() => Promise<void>> | undefined;
  let isChanging = false;
  let isClosed = false;
  const routes = new Application();
  routes.onError((error, context) =>
    context.json(
      {
        error:
          error instanceof PairingError
            ? error.message
            : "The phone access change failed. Check the connection and supplied certificate files.",
      },
      error instanceof PairingError ? error.status : 400,
    ),
  );
  routes.get("/phone-access", (context) => context.json(state()));
  routes.put("/phone-access", async (context) => {
    if (isChanging || connection !== null || isClosed) {
      return context.json({ error: "Turn phone access off before changing its connection." }, 409);
    }
    isChanging = true;
    try {
      const next = readPhoneConnection(await context.req.json().catch(() => null));
      starting = startPhoneListener({
        connection: next,
        pairings,
        api: options.api,
        identity: options.identity,
      });
      const opened = await starting;
      if (isClosed) {
        await opened();
        return context.json({ error: "The server is stopping." }, 409);
      }
      stop = opened;
      connection = next;
      options.onStatus?.(
        `Phone access is on at ${next.origin}. The ${next.kind === "proxy" ? "proxy backend" : "HTTPS listener"} listens on ${next.address}:${next.port}.`,
      );
      return context.json(state());
    } catch (error) {
      const message =
        error instanceof Error ? error.message : "The phone listener could not start.";
      options.onStatus?.(`Phone access stays off. ${message}`);
      return context.json({ error: message }, 400);
    } finally {
      isChanging = false;
    }
  });
  routes.delete("/phone-access", async (context) => {
    if (isChanging) {
      return context.json({ error: "The phone connection is changing." }, 409);
    }
    await disable();
    return context.body(null, 204);
  });
  routes.post("/phone-access/invitation", (context) => {
    if (connection === null) {
      return context.json({ error: "Enable phone access before pairing a device." }, 409);
    }
    context.header("Cache-Control", "no-store");
    const invitation = pairings.invite(connection.origin);
    return context.json(
      { ...invitation, qrSvg: renderSVG(invitation.url, { border: 4, ecc: "M" }) },
      201,
    );
  });
  routes.delete("/phone-access/invitation", async (context) => {
    const body: unknown = await context.req.json().catch(() => null);
    const id = (body as { id?: unknown } | null)?.id;
    if (typeof id !== "string" || Object.keys(body as object).length !== 1) {
      return context.json({ error: "Cancellation requires the invitation id." }, 400);
    }
    if (pairings.pending()?.id !== id) {
      return context.json({ error: "The pairing invitation has changed or expired." }, 409);
    }
    pairings.cancel();
    return context.body(null, 204);
  });
  routes.post("/phone-access/approve", async (context) => {
    const body: unknown = await context.req.json().catch(() => null);
    if (
      connection === null ||
      typeof body !== "object" ||
      body === null ||
      !("id" in body) ||
      !("code" in body) ||
      typeof body.id !== "string" ||
      typeof body.code !== "string" ||
      Object.keys(body).length !== 2
    ) {
      return context.json(
        { error: "Approval requires the current comparison request and its code." },
        400,
      );
    }
    pairings.approve(body.id, body.code);
    return context.body(null, 204);
  });
  routes.put("/phone-access/phones/:id", async (context) => {
    pairings.rename(context.req.param("id"), await readPhoneName(context));
    return context.body(null, 204);
  });
  routes.delete("/phone-access/phones/:id", (context) => {
    pairings.revoke(context.req.param("id"));
    return context.body(null, 204);
  });
  routes.delete("/phone-access/phones", (context) => {
    for (const phone of pairings.list()) {
      pairings.revoke(phone.id);
    }
    return context.body(null, 204);
  });
  return { routes, close };

  function state(): PhoneAccessState {
    return {
      connection,
      addresses: phoneAddresses(),
      phones: pairings.list(),
      pairing: pairings.pending(),
    };
  }

  async function disable(): Promise<void> {
    connection = null;
    pairings.cancel();
    const closing = stop;
    stop = undefined;
    await closing?.();
    options.onStatus?.("Phone access is off. Paired phones stay saved until revoked.");
  }

  async function close(): Promise<void> {
    isClosed = true;
    await starting?.catch(() => undefined);
    await disable();
  }
}
