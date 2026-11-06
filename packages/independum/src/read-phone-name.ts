import type { Context } from "hono";
import { PairingError } from "./create-phone-pairings.ts";

/** Reads the exact single-name body shared by phone claims and renaming. */
export async function readPhoneName(context: Context): Promise<unknown> {
  const body: unknown = await context.req.json().catch(() => null);
  if (
    typeof body !== "object" ||
    body === null ||
    !("name" in body) ||
    Object.keys(body).length !== 1
  ) {
    throw new PairingError("This request requires only a phone name.", 400);
  }
  return body.name;
}
