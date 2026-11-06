import { setTimeout } from "node:timers/promises";
import { renderANSI } from "uqr";
import type { PhoneAccessState, PhoneInvitation } from "./api-types.ts";
import { HeadlessError } from "./headless-types.ts";

/** Pairs a browser through an explicit local terminal invitation and matching code approval. */
export async function runPhonePairing(options: {
  call(path: string, body?: unknown, method?: string, signal?: AbortSignal): Promise<unknown>;
  confirm(code: string, signal: AbortSignal): Promise<boolean>;
  stdout(text: string): void;
  signal: AbortSignal;
}): Promise<number> {
  const invitation = (await options.call("/api/phone-access/invitation", {})) as PhoneInvitation;
  const expiry = AbortSignal.timeout(Math.max(0, invitation.expiresAt - Date.now()));
  const signal = AbortSignal.any([options.signal, expiry]);
  let isApproved = false;
  try {
    options.stdout(
      `Scan this QR code or open this one-use address on the phone:\n${renderANSI(invitation.url, { border: 4, ecc: "M" })}\n${invitation.url}\nExpires at ${new Date(invitation.expiresAt).toLocaleTimeString()}.\nWaiting for a phone to request pairing.\n`,
    );
    while (!signal.aborted) {
      const state = (await options.call(
        "/api/phone-access",
        undefined,
        "GET",
        signal,
      )) as PhoneAccessState;
      const pairing = state.pairing;
      if (pairing?.id !== invitation.id) {
        throw new HeadlessError(
          "The pairing invitation has changed or expired.",
          "pairingChanged",
          6,
        );
      }
      if (pairing.code !== null) {
        options.stdout(
          `${pairing.name} requests access. Approve only when the phone shows this same code.\nComparison code: ${pairing.code}\n`,
        );
        const isMatching = await options.confirm(pairing.code, signal);
        signal.throwIfAborted();
        if (!isMatching) {
          options.stdout("Pairing cancelled.\n");
          return 9;
        }
        await options.call(
          "/api/phone-access/approve",
          { id: pairing.id, code: pairing.code },
          "POST",
          signal,
        );
        isApproved = true;
        options.stdout("Approved. The phone can now connect.\n");
        return 0;
      }
      await setTimeout(700, undefined, { signal });
    }
    signal.throwIfAborted();
    return 9;
  } catch (error) {
    if (expiry.aborted && !options.signal.aborted) {
      throw new HeadlessError(
        "The pairing invitation expired. Start pairing again.",
        "pairingExpired",
        8,
      );
    }
    throw error;
  } finally {
    if (!isApproved) {
      await options
        .call(
          "/api/phone-access/invitation",
          { id: invitation.id },
          "DELETE",
          AbortSignal.timeout(2000),
        )
        .catch(() => undefined);
    }
  }
}
