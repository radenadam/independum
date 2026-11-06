import { join } from "node:path";
import { Hono } from "hono";
import { expect, test } from "vitest";
import { createPhonePairings } from "./create-phone-pairings.ts";
import { createPhoneServer } from "./create-phone-server.ts";
import { createTestFolder } from "./tools/create-test-folder.ts";

const directory = createTestFolder("phone-server");
let nextCase = 0;

function setup() {
  const pairings = createPhonePairings(join(directory, String(nextCase++)));
  const server = createPhoneServer({
    connection: {
      kind: "proxy",
      address: "127.0.0.1",
      port: 4871,
      origin: "https://phone.private",
    },
    pairings,
    identity: { serverId: "server", version: "test", protocolVersion: 1 },
    api: new Hono().get("/chats/events", (context) => context.text("Private events.")),
  });
  return { pairings, server };
}

test("phone api scopes invitations receipts and device credentials to their intended routes", async () => {
  const { pairings, server } = setup();
  const url = pairings.invite("https://phone.private").url;
  const invitation = new URLSearchParams(new URL(url).hash.slice(1)).get("pair") ?? "";
  const headers = { authorization: `Bearer ${invitation}`, "content-type": "application/json" };
  expect((await server.request("http://127.0.0.1:4871/api/health", { headers })).status).toBe(401);
  const claim = await server.request("http://127.0.0.1:4871/api/pairing/claim", {
    method: "POST",
    headers,
    body: JSON.stringify({ name: "Phone" }),
  });
  expect(claim.status).toBe(201);
  expect(claim.headers.get("Cache-Control")).toBe("no-store");
  const receipt = (await claim.json()) as { receipt: string; code: string };
  const receiptHeaders = { authorization: `Bearer ${receipt.receipt}` };
  expect(
    (await server.request("http://127.0.0.1:4871/api/chats/events", { headers: receiptHeaders }))
      .status,
  ).toBe(401);
  expect(
    await (
      await server.request("http://127.0.0.1:4871/api/pairing/receipt", { headers: receiptHeaders })
    ).json(),
  ).toEqual({ state: "pending" });
  pairings.approve(pairings.pending()?.id ?? "", receipt.code);
  const collected = (await (
    await server.request("http://127.0.0.1:4871/api/pairing/receipt", { headers: receiptHeaders })
  ).json()) as { credential: string };
  const deviceHeaders = { authorization: `Bearer ${collected.credential}` };
  expect(
    (await server.request("http://127.0.0.1:4871/api/health", { headers: deviceHeaders })).status,
  ).toBe(200);
  for (const path of [
    "/phone-access",
    "/phone-access/invitation",
    "/phone-access/phones/other",
    "/server/stop",
  ]) {
    expect(
      (
        await server.request(`http://127.0.0.1:4871/api${path}`, {
          method: "POST",
          headers: deviceHeaders,
        })
      ).status,
    ).toBe(403);
  }
  expect(
    (
      await server.request("http://127.0.0.1:4871/api/phone/self", {
        method: "PUT",
        headers: { ...deviceHeaders, "content-type": "application/json" },
        body: JSON.stringify({ name: "New name" }),
      })
    ).status,
  ).toBe(204);
  expect(pairings.list()[0]?.name).toBe("New name");
  expect(
    (await server.request("http://127.0.0.1:4871/api/chats/events", { headers: deviceHeaders }))
      .status,
  ).toBe(200);
  expect(
    (
      await server.request("http://127.0.0.1:4871/api/phone/self", {
        method: "DELETE",
        headers: deviceHeaders,
      })
    ).status,
  ).toBe(204);
  expect(
    (await server.request("http://127.0.0.1:4871/api/health", { headers: deviceHeaders })).status,
  ).toBe(401);
});

test("phone host origin and stream checks reject forged identities before authentication", async () => {
  const { server } = setup();
  for (const headers of [{}, { authorization: "Bearer desktop-control-token" }]) {
    expect(
      (await server.request("http://127.0.0.1:4871/api/chats/events", { headers })).status,
    ).toBe(401);
  }
  for (const origin of [
    "null",
    "http://phone.private",
    "https://foreign.private",
    "https://phone.private:444",
  ]) {
    expect(
      (await server.request("http://127.0.0.1:4871/api/health", { headers: { origin } })).status,
    ).toBe(403);
  }
  for (const authority of ["localhost:4871", "attacker.private:4871", "127.0.0.1:4870"]) {
    expect(
      (
        await server.request(`http://${authority}/`, {
          headers: {
            "x-forwarded-host": "127.0.0.1:4871",
            "x-forwarded-proto": "https",
            origin: "https://phone.private",
          },
        })
      ).status,
    ).toBe(403);
  }
  expect(
    (
      await server.request("http://127.0.0.1:4871/", {
        headers: { origin: "https://foreign.private" },
      })
    ).status,
  ).toBe(403);
});

test("unauthenticated pairing bodies are bounded and reject malformed and extra fields", async () => {
  const { server } = setup();
  for (const [body, status] of [
    ["x".repeat(1025), 413],
    ["not JSON", 400],
    ['{"name":"Phone","extra":true}', 400],
  ] as const) {
    expect(
      (
        await server.request("http://127.0.0.1:4871/api/pairing/claim", {
          method: "POST",
          headers: { "content-type": "application/json" },
          body,
        })
      ).status,
    ).toBe(status);
  }
});

test("simultaneous invitation claims admit only one claimant", async () => {
  const { pairings, server } = setup();
  const invitation = pairings.invite("https://phone.private");
  const credential = new URLSearchParams(new URL(invitation.url).hash.slice(1)).get("pair") ?? "";
  const results = await Promise.all(
    ["First phone", "Second phone"].map((name) =>
      server.request("http://127.0.0.1:4871/api/pairing/claim", {
        method: "POST",
        headers: { authorization: `Bearer ${credential}`, "content-type": "application/json" },
        body: JSON.stringify({ name }),
      }),
    ),
  );
  expect(results.map((response) => response.status).sort()).toEqual([201, 401]);
});

test("a valid phone can omit origin but cannot replace it through forwarded headers", async () => {
  const { pairings, server } = setup();
  const invitation = pairings.invite("https://phone.private");
  const secret = new URLSearchParams(new URL(invitation.url).hash.slice(1)).get("pair") ?? "";
  const claim = pairings.claim(secret, "Phone");
  pairings.approve(pairings.pending()?.id ?? "", claim.code);
  const credential = pairings.collect(claim.receipt).credential ?? "";
  for (const extra of [{}, { origin: "https://phone.private" }]) {
    const response = await server.request("http://127.0.0.1:4871/api/health", {
      headers: {
        ...extra,
        authorization: `Bearer ${credential}`,
        "x-forwarded-host": "attacker.private",
        "x-forwarded-proto": "http",
      },
    });
    expect(response.status).toBe(200);
  }
});
