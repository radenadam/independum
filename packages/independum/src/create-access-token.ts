import { randomBytes } from "node:crypto";

/** Creates a random 256-bit access token for one launch. */
export function createAccessToken(): string {
  return randomBytes(32).toString("base64url");
}
