import { isIP } from "node:net";
import { networkInterfaces } from "node:os";
import type { PhoneConnection } from "./api-types.ts";

/** Returns explicitly selectable private addresses currently assigned to the computer. */
export function phoneAddresses(): { name: string; address: string }[] {
  return Object.entries(networkInterfaces()).flatMap(([name, addresses]) =>
    (addresses ?? [])
      .filter((address) => !address.internal && isPrivateAddress(address.address))
      .map((address) => ({ name, address: address.address })),
  );
}

/** Validates an exact phone binding and HTTPS identity without consulting forwarded headers. */
export function readPhoneConnection(value: unknown): PhoneConnection {
  if (typeof value !== "object" || value === null) {
    throw new Error("Choose a phone connection.");
  }
  const connection = value as PhoneConnection;
  const fields =
    connection.kind === "certificate"
      ? ["kind", "address", "port", "origin", "certificatePath", "keyPath"]
      : ["kind", "address", "port", "origin"];
  if (
    Object.keys(value).some((key) => !fields.includes(key)) ||
    !["certificate", "proxy"].includes(connection.kind) ||
    typeof connection.address !== "string" ||
    !Number.isSafeInteger(connection.port) ||
    connection.port < 1 ||
    connection.port > 65535 ||
    typeof connection.origin !== "string"
  ) {
    throw new Error("The phone connection has invalid fields.");
  }
  const origin = URL.parse(connection.origin);
  if (
    origin === null ||
    origin.protocol !== "https:" ||
    origin.origin !== connection.origin ||
    origin.username ||
    origin.password ||
    (isIP(origin.hostname.replace(/^\[|\]$/g, "")) !== 0 &&
      !isPrivateAddress(origin.hostname.replace(/^\[|\]$/g, "")))
  ) {
    throw new Error(
      "Enter an exact HTTPS origin on a private route, without a path, query, or fragment.",
    );
  }
  if (connection.kind === "proxy") {
    if (connection.address !== "127.0.0.1") {
      throw new Error("A local HTTPS proxy requires the 127.0.0.1 backend address.");
    }
  } else {
    if (!phoneAddresses().some((address) => address.address === connection.address)) {
      throw new Error("Select a private address currently assigned to this computer.");
    }
    if (origin.port !== (connection.port === 443 ? "" : String(connection.port))) {
      throw new Error("The HTTPS origin must use the selected listening port.");
    }
    if (
      typeof connection.certificatePath !== "string" ||
      typeof connection.keyPath !== "string" ||
      !/\.(pem|crt)$/i.test(connection.certificatePath) ||
      !/\.(pem|key)$/i.test(connection.keyPath)
    ) {
      throw new Error(
        "Supply a PEM certificate path ending in .pem or .crt and a key path ending in .pem or .key.",
      );
    }
  }
  return { ...connection };
}

function isPrivateAddress(address: string): boolean {
  if (isIP(address) === 6) {
    return /^(fc|fd)/i.test(address);
  }
  if (isIP(address) !== 4) {
    return false;
  }
  const parts = address.split(".").map(Number);
  return (
    parts[0] === 10 ||
    (parts[0] === 172 && (parts[1] ?? 0) >= 16 && (parts[1] ?? 0) <= 31) ||
    (parts[0] === 192 && parts[1] === 168) ||
    (parts[0] === 100 && (parts[1] ?? 0) >= 64 && (parts[1] ?? 0) <= 127)
  );
}
