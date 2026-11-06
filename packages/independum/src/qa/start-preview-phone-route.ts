import { createHash, X509Certificate } from "node:crypto";
import { createServer as createHttpServer, request } from "node:http";
import { createServer } from "node:https";
import { testPhoneCertificate } from "../test-phone-certificate.ts";
import { trackConnections } from "../track-connections.ts";

/** Starts an isolated loopback HTTPS proxy for pairing evidence without installing certificate trust. */
export async function startPreviewPhoneRoute(
  url: string,
): Promise<{ certificatePin: string; close: () => Promise<void> }> {
  const owner = new URL(url);
  const token = new URLSearchParams(owner.hash.slice(1)).get("token");
  const reservation = createHttpServer();
  await new Promise<void>((resolve) => {
    reservation.listen(0, "127.0.0.1", resolve);
  });
  const reserved = reservation.address();
  if (reserved === null || typeof reserved === "string") {
    throw new Error("The preview phone backend has no TCP address.");
  }
  const backendPort = reserved.port;
  await new Promise<void>((resolve) => {
    reservation.close(() => resolve());
  });
  const proxy = createServer(
    { cert: testPhoneCertificate.certificate, key: testPhoneCertificate.key },
    (incoming, outgoing) => {
      const backend = request(
        {
          hostname: "127.0.0.1",
          port: backendPort,
          path: incoming.url,
          method: incoming.method,
          headers: { ...incoming.headers, host: `127.0.0.1:${backendPort}` },
        },
        (response) => {
          outgoing.writeHead(response.statusCode ?? 502, response.headers);
          response.pipe(outgoing);
          outgoing.once("close", () => response.destroy());
        },
      );
      backend.once("error", () => {
        outgoing.destroy();
      });
      outgoing.once("close", () => backend.destroy());
      incoming.pipe(backend);
    },
  );
  const closeConnections = trackConnections(proxy);
  await new Promise<void>((resolve, reject) => {
    proxy.once("error", reject);
    proxy.listen(0, "127.0.0.1", resolve);
  });
  const address = proxy.address();
  if (address === null || typeof address === "string") {
    throw new Error("The preview phone proxy has no TCP address.");
  }
  try {
    const enabled = await fetch(new URL("/api/phone-access", owner), {
      method: "PUT",
      headers: { authorization: `Bearer ${token}`, "content-type": "application/json" },
      body: JSON.stringify({
        kind: "proxy",
        address: "127.0.0.1",
        port: backendPort,
        origin: `https://phone.test:${address.port}`,
      }),
    });
    if (!enabled.ok) {
      throw new Error("The preview phone listener could not start.");
    }
  } catch (error) {
    await close();
    throw error;
  }
  const certificate = new X509Certificate(testPhoneCertificate.certificate);
  const certificatePin = createHash("sha256")
    .update(certificate.publicKey.export({ type: "spki", format: "der" }))
    .digest("base64");
  return { certificatePin, close };

  async function close(): Promise<void> {
    closeConnections();
    await new Promise<void>((resolve) => {
      proxy.close(() => resolve());
    });
  }
}
