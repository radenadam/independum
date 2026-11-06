import { readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { expect, test } from "vitest";
import { createPhonePairings } from "./create-phone-pairings.ts";
import { createTestFolder } from "./tools/create-test-folder.ts";

const parent = createTestFolder("phone-pairings");
let nextCase = 0;

function setup() {
  const directory = join(parent, String(nextCase++));
  let time = 1000000;
  const pairings = createPhonePairings(directory, () => time);
  return {
    directory,
    pairings,
    advance(milliseconds: number) {
      time += milliseconds;
    },
  };
}

function invitationOf(url: string): string {
  return new URLSearchParams(new URL(url).hash.slice(1)).get("pair") ?? "";
}

test("pairing requires a single claim and exact local code approval before receipt collection", () => {
  const { pairings } = setup();
  const invitation = pairings.invite("https://phone.private");
  expect(invitation.expiresAt).toBe(1120000);
  const secret = invitationOf(invitation.url);
  const claim = pairings.claim(secret, "Safari on phone");
  expect(claim.code).toMatch(/^\d{6}$/);
  expect(pairings.collect(claim.receipt)).toEqual({ state: "pending" });
  expect(pairings.authenticate(secret)).toBeUndefined();
  expect(pairings.authenticate(claim.receipt)).toBeUndefined();
  expect(() => pairings.claim(secret, "Second claimant")).toThrow("already claimed");
  expect(() => pairings.collect(secret)).toThrow("receipt");
  const pending = pairings.pending();
  expect(() => pairings.approve(pending?.id ?? "", "wrong-code")).toThrow("changed or expired");
  expect(() => pairings.approve("other-request", claim.code)).toThrow("changed or expired");
  expect(pairings.list()).toEqual([]);
  pairings.approve(pending?.id ?? "", claim.code);
  expect(() => pairings.approve(pending?.id ?? "", claim.code)).toThrow("changed or expired");
  const collected = pairings.collect(claim.receipt);
  expect(collected).toMatchObject({ state: "approved", credential: expect.any(String) });
  expect(pairings.collect(claim.receipt)).toEqual(collected);
  expect(pairings.authenticate(collected.credential ?? "")).toMatchObject({
    name: "Safari on phone",
  });
  expect(pairings.pending()).toBeNull();
});

test("credentials survive restart as hashes and each phone has independent revocation", () => {
  const { pairings, directory, advance } = setup();
  const credentials: string[] = [];
  for (const name of ["First phone", "Second phone"]) {
    const invitation = pairings.invite("https://phone.private");
    const claim = pairings.claim(invitationOf(invitation.url), name);
    pairings.approve(pairings.pending()?.id ?? "", claim.code);
    credentials.push(pairings.collect(claim.receipt).credential ?? "");
    pairings.authenticate(credentials.at(-1) ?? "");
  }
  const disk = readFileSync(join(directory, "runtime", "phones.json"), "utf8");
  for (const credential of credentials) {
    expect(disk).not.toContain(credential);
  }
  const restarted = createPhonePairings(directory, () => 1000100);
  expect(restarted.pending()).toBeNull();
  const first = restarted.authenticate(credentials[0] ?? "");
  const second = restarted.authenticate(credentials[1] ?? "");
  expect(first?.id).not.toBe(second?.id);
  expect(first?.lastSeenAt).toBe(1000100);
  restarted.rename(first?.id ?? "", "Renamed phone");
  const revoked: string[] = [];
  const unsubscribe = restarted.subscribeRevocation((id) => {
    revoked.push(id);
  });
  restarted.revoke(first?.id ?? "");
  expect(revoked).toEqual([first?.id]);
  expect(restarted.authenticate(credentials[0] ?? "")).toBeUndefined();
  expect(restarted.authenticate(credentials[1] ?? "")).toMatchObject({ id: second?.id });
  advance(1000);
  expect(createPhonePairings(directory).list()).toHaveLength(1);
  unsubscribe();
});

test("expiry cancellation replacement and restart invalidate invitations and receipts", () => {
  const { pairings, directory, advance } = setup();
  const first = pairings.invite("https://phone.private");
  const claim = pairings.claim(invitationOf(first.url), "Phone");
  const id = pairings.pending()?.id ?? "";
  advance(120000);
  expect(() => pairings.approve(id, claim.code)).toThrow("expired");
  expect(() => pairings.collect(claim.receipt)).toThrow("expired");
  expect(pairings.list()).toEqual([]);
  const second = pairings.invite("https://phone.private");
  pairings.cancel();
  expect(() => pairings.claim(invitationOf(second.url), "Phone")).toThrow();
  const third = pairings.invite("https://phone.private");
  pairings.invite("https://phone.private");
  expect(() => pairings.claim(invitationOf(third.url), "Phone")).toThrow();
  expect(() => createPhonePairings(directory).claim(invitationOf(third.url), "Phone")).toThrow();
});

test.each([119999, 120000])(
  "an unclaimed invitation expires at exactly two minutes after %i milliseconds",
  (elapsed) => {
    const { pairings, advance } = setup();
    const invitation = pairings.invite("https://phone.private");
    advance(elapsed);
    function claim() {
      return pairings.claim(invitationOf(invitation.url), "Phone");
    }
    if (elapsed < 120000) {
      expect(claim()).toMatchObject({ expiresAt: invitation.expiresAt });
      advance(1);
    } else {
      expect(claim).toThrow("expired");
    }
    expect(pairings.pending()).toBeNull();
  },
);

test("pairing limits failed attempts and validates names without leaking supplied secrets", () => {
  const { pairings, advance } = setup();
  for (const name of [null, "", " ", "a".repeat(81), "line\nbreak"]) {
    const secret = invitationOf(pairings.invite("https://phone.private").url);
    expect(() => pairings.claim(secret, name)).toThrow("phone name");
  }
  for (let attempt = 0; attempt < 15; attempt += 1) {
    expect(() => pairings.claim("private-supplied-secret", "Phone")).toThrow("expired, cancelled");
  }
  expect(() => pairings.claim("private-supplied-secret", "Phone")).toThrow(
    "Too many pairing attempts",
  );
  advance(60000);
  const secret = invitationOf(pairings.invite("https://phone.private").url);
  expect(pairings.claim(secret, "Phone").code).toHaveLength(6);
});

test("invalid saved registries fail closed without including saved content in errors", () => {
  const { directory, pairings } = setup();
  pairings.revoke("missing");
  const path = join(directory, "runtime", "phones.json");
  for (const content of ["private-file-content", "{}", '[{"credentialHash":"private-secret"}]']) {
    writeFileSync(path, content);
    expect(() => createPhonePairings(directory)).toThrow("The saved phone registry is invalid.");
  }
});

test("the bounded registry refuses a seventeenth pairing until a device is revoked", () => {
  const { pairings } = setup();
  for (let index = 0; index < 16; index += 1) {
    const secret = invitationOf(pairings.invite("https://phone.private").url);
    const claim = pairings.claim(secret, `Phone ${index}`);
    pairings.approve(pairings.pending()?.id ?? "", claim.code);
  }
  expect(() => pairings.invite("https://phone.private")).toThrow("limit is 16");
  pairings.revoke(pairings.list()[0]?.id ?? "");
  expect(pairings.invite("https://phone.private").url).toContain("#pair=");
});
