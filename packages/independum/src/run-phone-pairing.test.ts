import { setTimeout } from "node:timers/promises";
import { renderANSI } from "uqr";
import { expect, test, vi } from "vitest";
import { runPhonePairing } from "./run-phone-pairing.ts";

vi.mock("uqr", async (importOriginal) => {
  const original = await importOriginal<typeof import("uqr")>();
  // biome-ignore lint/style/useNamingConvention: The uqr API names this function renderANSI.
  return { ...original, renderANSI: vi.fn(original.renderANSI) };
});

function setup(expiresAt = Date.now() + 120000) {
  const invitation = {
    id: "invitation-one",
    url: "https://phone.private/#pair=one-use-invitation",
    expiresAt,
    localToken: "private-local-control-token",
    receipt: "private-claimant-receipt",
    credential: "private-device-credential",
  };
  const pairing = {
    id: invitation.id,
    name: "Phone browser",
    code: "123456",
    expiresAt,
    isApproved: false,
  };
  const stdout: string[] = [];
  const controller = new AbortController();
  const call = vi.fn(
    async (path: string, _body?: unknown, method?: string, _signal?: AbortSignal) => {
      if (path === "/api/phone-access/invitation" && method !== "DELETE") {
        return invitation;
      }
      return path === "/api/phone-access" ? { pairing } : {};
    },
  );
  const confirm = vi.fn(async () => true);
  const options = {
    call,
    confirm,
    signal: controller.signal,
    stdout(text: string): void {
      stdout.push(text);
    },
  };
  return { invitation, pairing, stdout, controller, call, confirm, options };
}

test("terminal pairing encodes exactly the invitation and prints no other secret", async () => {
  const fixture = setup();
  expect(await runPhonePairing(fixture.options)).toBe(0);
  expect(renderANSI).toHaveBeenLastCalledWith(fixture.invitation.url, { border: 4, ecc: "M" });
  const output = fixture.stdout.join("");
  expect(output).toContain(fixture.invitation.url);
  expect(output).toContain("\x1b[47m");
  expect(output).toContain("Comparison code: 123456");
  for (const secret of [
    fixture.invitation.localToken,
    fixture.invitation.receipt,
    fixture.invitation.credential,
  ]) {
    expect(output).not.toContain(secret);
  }
  expect(fixture.confirm).toHaveBeenCalledWith(fixture.pairing.code, expect.any(AbortSignal));
  expect(fixture.call).toHaveBeenLastCalledWith(
    "/api/phone-access/approve",
    { id: fixture.invitation.id, code: "123456" },
    "POST",
    expect.any(AbortSignal),
  );
});

test("terminal rejection cancels only its own invitation without approving", async () => {
  const fixture = setup();
  fixture.confirm.mockResolvedValue(false);
  expect(await runPhonePairing(fixture.options)).toBe(9);
  expect(fixture.call).toHaveBeenLastCalledWith(
    "/api/phone-access/invitation",
    { id: fixture.invitation.id },
    "DELETE",
    expect.any(AbortSignal),
  );
  expect(fixture.call.mock.calls.some(([path]) => path.endsWith("/approve"))).toBe(false);
});

test("terminal expiry interrupts approval and cancels the invitation", async () => {
  const fixture = setup(Date.now() + 20);
  fixture.confirm.mockImplementation(async () => {
    await setTimeout(50);
    return true;
  });
  await expect(runPhonePairing(fixture.options)).rejects.toMatchObject({
    code: "pairingExpired",
    exitCode: 8,
  });
  expect(fixture.call.mock.calls.some(([path]) => path.endsWith("/approve"))).toBe(false);
});

test("terminal interruption uses a fresh signal to cancel the pending invitation", async () => {
  const fixture = setup();
  fixture.confirm.mockImplementation(async () => {
    fixture.controller.abort();
    return true;
  });
  await expect(runPhonePairing(fixture.options)).rejects.toThrow();
  expect(fixture.call.mock.lastCall?.[2]).toBe("DELETE");
  expect(fixture.call.mock.lastCall?.[3]?.aborted).toBe(false);
});

test("a replaced terminal invitation never approves the replacement", async () => {
  const fixture = setup();
  fixture.pairing.id = "replacement";
  await expect(runPhonePairing(fixture.options)).rejects.toMatchObject({ code: "pairingChanged" });
  expect(fixture.confirm).not.toHaveBeenCalled();
  expect(fixture.call.mock.lastCall?.[1]).toEqual({ id: fixture.invitation.id });
});
