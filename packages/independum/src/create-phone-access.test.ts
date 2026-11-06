import { join } from "node:path";
import { Hono } from "hono";
import { renderSVG } from "uqr";
import { afterEach, expect, test, vi } from "vitest";
import type { PhoneInvitation } from "./api-types.ts";
import { createPhoneAccess } from "./create-phone-access.ts";
import { createServer } from "./create-server.ts";
import { startPhoneListener } from "./start-phone-listener.ts";
import { createTestFolder } from "./tools/create-test-folder.ts";

vi.mock("./start-phone-listener.ts", () => ({ startPhoneListener: vi.fn() }));
vi.mock("uqr", async (importOriginal) => {
  const original = await importOriginal<typeof import("uqr")>();
  // biome-ignore lint/style/useNamingConvention: The uqr API names this function renderSVG.
  return { ...original, renderSVG: vi.fn(original.renderSVG) };
});
afterEach(() => vi.resetAllMocks());
const parent = createTestFolder("phone-access");
let nextCase = 0;
const connection = {
  kind: "proxy",
  address: "127.0.0.1",
  port: 4871,
  origin: "https://phone.private",
};

function setup() {
  const directory = join(parent, String(nextCase++));
  const messages: string[] = [];
  const access = createPhoneAccess({
    directory,
    api: new Hono(),
    identity: { serverId: "test-server", version: "test", protocolVersion: 1 },
    onStatus(message) {
      messages.push(message);
    },
  });
  const server = createServer({
    token: "owner-token",
    addresses: ["127.0.0.1:4870"],
    api: access.routes,
  });
  async function call(path = "", method = "GET", body?: unknown): Promise<Response> {
    return server.request(`http://127.0.0.1:4870/api/phone-access${path}`, {
      method,
      headers: { authorization: "Bearer owner-token", "content-type": "application/json" },
      ...(body === undefined ? {} : { body: JSON.stringify(body) }),
    });
  }
  return { directory, messages, access, server, call };
}

test("phone controls require local authority and failed enablement leaves no active connection", async () => {
  const { access, server, call, messages } = setup();
  try {
    expect((await server.request("http://127.0.0.1:4870/api/phone-access")).status).toBe(401);
    expect((await call("/invitation", "POST")).status).toBe(409);
    vi.mocked(startPhoneListener).mockRejectedValue(
      new Error("The selected address is unavailable."),
    );
    expect((await call("", "PUT", connection)).status).toBe(400);
    expect(await (await call()).json()).toMatchObject({ connection: null, pairing: null });
    expect(messages).toEqual(["Phone access stays off. The selected address is unavailable."]);
  } finally {
    await access.close();
  }
});

test("disablement cancels pending attempts while saved credentials survive reenablement and restart", async () => {
  const { directory, access, call, messages } = setup();
  const stop = vi.fn(async () => undefined);
  vi.mocked(startPhoneListener).mockResolvedValue(stop);
  try {
    expect((await call("", "PUT", connection)).status).toBe(200);
    expect((await call("", "PUT", connection)).status).toBe(409);
    const invitation = (await (await call("/invitation", "POST")).json()) as { url: string };
    const pairings = vi.mocked(startPhoneListener).mock.calls[0]?.[0].pairings;
    if (pairings === undefined) {
      throw new Error("The test listener receives no pairing service.");
    }
    const secret = new URLSearchParams(new URL(invitation.url).hash.slice(1)).get("pair") ?? "";
    const claim = pairings.claim(secret, "Phone");
    const id = pairings.pending()?.id ?? "";
    expect((await call("/approve", "POST", { id, code: "wrong" })).status).toBe(409);
    const approvals = await Promise.all([
      call("/approve", "POST", { id, code: claim.code }),
      call("/approve", "POST", { id, code: claim.code }),
    ]);
    expect(approvals.map((response) => response.status).sort()).toEqual([204, 409]);
    const credential = pairings.collect(claim.receipt).credential ?? "";
    expect((await call("", "DELETE")).status).toBe(204);
    expect(stop).toHaveBeenCalledOnce();
    expect(() => pairings.collect(claim.receipt)).toThrow("receipt");
    expect((await call("", "PUT", connection)).status).toBe(200);
    const reenabled = vi.mocked(startPhoneListener).mock.calls[1]?.[0].pairings;
    expect(reenabled?.authenticate(credential)?.name).toBe("Phone");
    expect(messages.join(" ")).not.toContain(secret);
    expect(messages.join(" ")).not.toContain(claim.receipt);
    expect(messages.join(" ")).not.toContain(credential);
  } finally {
    await access.close();
  }
  const restarted = createPhoneAccess({
    directory,
    api: new Hono(),
    identity: { serverId: "new-launch", version: "test", protocolVersion: 1 },
  });
  try {
    const response = await restarted.routes.request("http://local/phone-access");
    expect(await response.json()).toMatchObject({
      connection: null,
      pairing: null,
      phones: [{ name: "Phone" }],
    });
  } finally {
    await restarted.close();
  }
});

test("shutdown during enablement closes the new listener without publishing it", async () => {
  const { access, call } = setup();
  const opening = Promise.withResolvers<() => Promise<void>>();
  const stop = vi.fn(async () => undefined);
  vi.mocked(startPhoneListener).mockReturnValue(opening.promise);
  const enabling = call("", "PUT", connection);
  await vi.waitFor(() => expect(startPhoneListener).toHaveBeenCalledOnce());
  const closing = access.close();
  opening.resolve(stop);
  expect((await enabling).status).toBe(409);
  await closing;
  expect(stop).toHaveBeenCalledOnce();
});

test("only the local invitation response renders the exact pairing address with a quiet zone", async () => {
  const { access, call, messages } = setup();
  vi.mocked(startPhoneListener).mockResolvedValue(async () => undefined);
  try {
    await call("", "PUT", connection);
    const response = await call("/invitation", "POST");
    expect(response.status).toBe(201);
    expect(response.headers.get("Cache-Control")).toBe("no-store");
    const invitation = (await response.json()) as PhoneInvitation;
    expect(renderSVG).toHaveBeenCalledExactlyOnceWith(invitation.url, { border: 4, ecc: "M" });
    expect(invitation.qrSvg).toMatch(/^<svg /);
    expect(invitation.qrSvg).toContain('<rect fill="white"');
    expect(invitation.qrSvg).toContain('<path fill="black"');
    expect(invitation.url).toMatch(/^https:\/\/phone.private\/#pair=.+/);
    const status = JSON.stringify(await (await call()).json());
    expect(status).not.toContain(invitation.url);
    expect(status).not.toContain(invitation.qrSvg);
    expect(messages.join(" ")).not.toContain(invitation.url);
    const replacement = (await (await call("/invitation", "POST")).json()) as PhoneInvitation;
    expect((await call("/invitation", "DELETE", { id: invitation.id })).status).toBe(409);
    expect((await call("/invitation", "DELETE", { id: replacement.id })).status).toBe(204);
    expect(await (await call()).json()).toMatchObject({ pairing: null });
  } finally {
    await access.close();
  }
});
