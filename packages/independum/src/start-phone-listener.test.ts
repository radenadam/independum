import { mkdirSync, writeFileSync } from "node:fs";
import { createServer, type Server } from "node:http";
import { request } from "node:https";
import { join } from "node:path";
import { Hono } from "hono";
import { streamSSE } from "hono/streaming";
import { expect, test } from "vitest";
import { waitFor } from "../../../scripts/wait-for.ts";
import type { PhoneConnection } from "./api-types.ts";
import { createPhonePairings } from "./create-phone-pairings.ts";
import { startPhoneListener } from "./start-phone-listener.ts";
import { testPhoneCertificate } from "./test-phone-certificate.ts";
import { createTestFolder } from "./tools/create-test-folder.ts";

const parent = createTestFolder("phone-listener");
let nextCase = 0;

async function setup(kind: PhoneConnection["kind"] = "proxy") {
  const directory = join(parent, String(nextCase++));
  mkdirSync(directory);
  writeFileSync(join(directory, "index.html"), "Phone UI.");
  const pairings = createPhonePairings(directory);
  const invitation = pairings.invite("https://phone.test");
  const claim = pairings.claim(
    new URLSearchParams(new URL(invitation.url).hash.slice(1)).get("pair") ?? "",
    "Phone",
  );
  pairings.approve(pairings.pending()?.id ?? "", claim.code);
  const credential = pairings.collect(claim.receipt).credential ?? "";
  const port = await availablePort();
  const connection: PhoneConnection = {
    kind,
    address: "127.0.0.1",
    port,
    origin: "https://phone.test",
  };
  if (kind === "certificate") {
    connection.certificatePath = join(directory, "certificate.pem");
    connection.keyPath = join(directory, "key.pem");
    writeFileSync(connection.certificatePath, testPhoneCertificate.certificate);
    writeFileSync(connection.keyPath, testPhoneCertificate.key);
  }
  let hasAborted = false;
  const api = new Hono().get("/events", (context) =>
    streamSSE(context, async (stream) => {
      const { promise, resolve } = Promise.withResolvers<void>();
      stream.onAbort(() => {
        hasAborted = true;
        resolve();
      });
      await stream.writeSSE({ data: "Connected." });
      await promise;
    }),
  );
  const options = {
    connection,
    pairings,
    api,
    identity: { serverId: "test-server", version: "test", protocolVersion: 1 },
    uiRoot: directory,
  };
  return { ...options, credential, isAborted: () => hasAborted };
}

test("the proxy backend isolates exact hosts and closes established streams on revocation", async () => {
  const options = await setup();
  const close = await startPhoneListener(options);
  const headers = { authorization: `Bearer ${options.credential}` };
  const url = `http://127.0.0.1:${options.connection.port}`;
  try {
    expect(await (await fetch(url)).text()).toBe("Phone UI.");
    expect((await fetch(new URL("/api/health", url))).status).toBe(401);
    const response = await fetch(new URL("/api/events", url), { headers });
    const reader = response.body?.getReader();
    expect((await reader?.read())?.done).toBe(false);
    options.pairings.revoke(options.pairings.list()[0]?.id ?? "");
    await expect(reader?.read()).rejects.toThrow();
    await waitFor(() => expect(options.isAborted()).toBe(true));
    expect((await fetch(new URL("/api/health", url), { headers })).status).toBe(401);
  } finally {
    await close();
  }
  await expect(fetch(url)).rejects.toThrow();
});

test.each(["127.0.0.1", "::1"])(
  "direct https on %s isolates its address and requires the supplied certificate",
  async (address) => {
    const options = await setup("certificate");
    options.connection.address = address;
    const close = await startPhoneListener(options);
    try {
      expect(
        await secureStatus(options.connection.port, `Bearer ${options.credential}`, address),
      ).toBe(200);
      expect(await secureStatus(options.connection.port, "Bearer desktop-token", address)).toBe(
        401,
      );
      if (address === "::1") {
        await expect(
          secureStatus(options.connection.port, `Bearer ${options.credential}`, "127.0.0.1"),
        ).rejects.toThrow();
      }
      await expect(
        fetch(`http://127.0.0.1:${options.connection.port}/api/health`),
      ).rejects.toThrow();
    } finally {
      await close();
    }
    options.connection.origin = "https://other.test";
    await expect(startPhoneListener(options)).rejects.toThrow("certificate and private key");
  },
);

test("occupied and unavailable bindings fail without fallback and disablement retains pairings", async () => {
  const options = await setup();
  const close = await startPhoneListener(options);
  await expect(startPhoneListener(options)).rejects.toThrow("could not bind");
  await close();
  const secondClose = await startPhoneListener(options);
  try {
    expect(
      (
        await fetch(`http://127.0.0.1:${options.connection.port}/api/health`, {
          headers: { authorization: `Bearer ${options.credential}` },
        })
      ).status,
    ).toBe(200);
  } finally {
    await secondClose();
  }
  options.connection.address = "192.0.2.123";
  await expect(startPhoneListener(options)).rejects.toThrow("could not bind");
});

async function availablePort(): Promise<number> {
  const server = createServer();
  await new Promise<void>((resolve) => {
    server.listen(0, "127.0.0.1", resolve);
  });
  const address = server.address();
  if (address === null || typeof address === "string") {
    throw new Error("The test needs a TCP port.");
  }
  await closeServer(server);
  return address.port;
}

function closeServer(server: Server): Promise<void> {
  return new Promise((resolve) => {
    server.close(() => resolve());
  });
}

function secureStatus(
  port: number,
  authorization: string,
  hostname = "127.0.0.1",
): Promise<number> {
  return new Promise((resolve, reject) => {
    const call = request(
      {
        hostname,
        servername: "phone.test",
        port,
        path: "/api/health",
        ca: testPhoneCertificate.certificate,
        headers: { host: "phone.test", authorization },
      },
      (response) => {
        response.resume();
        response.once("end", () => resolve(response.statusCode ?? 0));
      },
    );
    call.once("error", reject);
    call.end();
  });
}
