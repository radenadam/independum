import { createHash, randomInt, randomUUID } from "node:crypto";
import { join } from "node:path";
import type { PairedPhone, PhoneAccessState } from "./api-types.ts";
import { createAccessToken } from "./create-access-token.ts";
import {
  privateRuntime,
  readPrivateRuntimeFile,
  writePrivateRuntimeFile,
} from "./private-runtime.ts";

interface StoredPhone extends PairedPhone {
  credentialHash: string;
}

interface Pairing {
  id: string;
  invitationHash: string;
  expiresAt: number;
  receiptHash?: string;
  name?: string;
  code?: string;
  credential?: string;
  phoneId?: string;
}

/** A pairing rejection with its HTTP status and a secret-free explanation. */
export class PairingError extends Error {
  status: 400 | 401 | 409 | 429;

  constructor(message: string, status: 400 | 401 | 409 | 429 = 401) {
    super(message);
    this.status = status;
  }
}

/** The account-only phone registry and one bounded, short-lived pairing attempt. */
export interface PhonePairings {
  list(): PairedPhone[];
  pending(): PhoneAccessState["pairing"];
  invite(origin: string): { id: string; url: string; expiresAt: number };
  claim(invitation: string, name: unknown): { receipt: string; code: string; expiresAt: number };
  collect(receipt: string): { state: "pending" | "approved"; credential?: string };
  approve(id: string, code: string): void;
  cancel(): void;
  authenticate(credential: string): PairedPhone | undefined;
  rename(id: string, name: unknown): void;
  revoke(id: string): void;
  subscribeRevocation(listener: (id: string) => void): () => void;
}

/** Creates persistent device authentication without retaining plaintext credentials on disk. */
export function createPhonePairings(
  directory: string,
  now: () => number = Date.now,
): PhonePairings {
  const path = join(privateRuntime(directory), "phones.json");
  const content = readPrivateRuntimeFile(path);
  let phones: StoredPhone[] = [];
  if (content !== undefined) {
    try {
      const stored: unknown = JSON.parse(content);
      if (
        !Array.isArray(stored) ||
        stored.length > 16 ||
        !stored.every(isStoredPhone) ||
        new Set(stored.map((phone: StoredPhone) => phone.id)).size !== stored.length ||
        new Set(stored.map((phone: StoredPhone) => phone.credentialHash)).size !== stored.length
      ) {
        throw new Error("The saved phone registry is invalid.");
      }
      phones = stored;
    } catch {
      throw new Error("The saved phone registry is invalid.");
    }
  }
  let pairing: Pairing | undefined;
  let attemptWindow = now();
  let attempts = 0;
  const listeners = new Set<(id: string) => void>();
  return {
    list,
    pending,
    invite,
    claim,
    collect,
    approve,
    cancel,
    authenticate,
    rename,
    revoke,
    subscribeRevocation,
  };

  function save(next: StoredPhone[]): void {
    writePrivateRuntimeFile(path, `${JSON.stringify(next)}\n`);
    phones = next;
  }

  function list(): PairedPhone[] {
    return phones.map(publicPhone);
  }

  function current(): Pairing | undefined {
    if (pairing !== undefined && now() >= pairing.expiresAt) {
      cancel();
    }
    return pairing;
  }

  function pending(): PhoneAccessState["pairing"] {
    const active = current();
    return active === undefined
      ? null
      : {
          id: active.id,
          expiresAt: active.expiresAt,
          name: active.name ?? null,
          code: active.code ?? null,
          isApproved: active.credential !== undefined,
        };
  }

  function invite(origin: string): { id: string; url: string; expiresAt: number } {
    if (phones.length >= 16) {
      throw new PairingError("Revoke a phone before pairing another. The limit is 16 phones.", 409);
    }
    cancel();
    const invitation = `${randomUUID()}.${createAccessToken()}`;
    pairing = { id: randomUUID(), invitationHash: hash(invitation), expiresAt: now() + 120000 };
    return { id: pairing.id, url: `${origin}/#pair=${invitation}`, expiresAt: pairing.expiresAt };
  }

  function claim(
    invitation: string,
    name: unknown,
  ): { receipt: string; code: string; expiresAt: number } {
    limitAttempts();
    const active = current();
    if (
      active === undefined ||
      active.invitationHash !== hash(invitation) ||
      active.receiptHash !== undefined
    ) {
      throw new PairingError("The pairing invitation is expired, cancelled, or already claimed.");
    }
    const validName = phoneName(name);
    const receipt = createAccessToken();
    active.receiptHash = hash(receipt);
    active.name = validName;
    active.code = String(randomInt(1000000)).padStart(6, "0");
    return { receipt, code: active.code, expiresAt: active.expiresAt };
  }

  function collect(receipt: string): { state: "pending" | "approved"; credential?: string } {
    const active = current();
    if (active === undefined || active.receiptHash !== hash(receipt)) {
      limitAttempts();
      throw new PairingError("The pairing receipt is expired or wrong.");
    }
    return active.credential === undefined
      ? { state: "pending" }
      : { state: "approved", credential: active.credential };
  }

  function approve(id: string, code: string): void {
    const active = current();
    if (
      active === undefined ||
      active.id !== id ||
      active.code === undefined ||
      active.code !== code ||
      active.name === undefined ||
      active.credential !== undefined
    ) {
      throw new PairingError("The comparison request has changed or expired.", 409);
    }
    const credential = createAccessToken();
    const phone: StoredPhone = {
      id: randomUUID(),
      name: active.name,
      pairedAt: now(),
      lastSeenAt: now(),
      credentialHash: hash(credential),
    };
    save([...phones, phone]);
    active.credential = credential;
    active.phoneId = phone.id;
  }

  function cancel(): void {
    pairing = undefined;
  }

  function authenticate(credential: string): PairedPhone | undefined {
    const fingerprint = hash(credential);
    const found = phones.find((phone) => phone.credentialHash === fingerprint);
    if (found === undefined) {
      return undefined;
    }
    const next = { ...found, lastSeenAt: now() };
    save(phones.map((phone) => (phone.id === found.id ? next : phone)));
    if (pairing?.phoneId === found.id) {
      cancel();
    }
    return publicPhone(next);
  }

  function rename(id: string, name: unknown): void {
    const validName = phoneName(name);
    if (!phones.some((phone) => phone.id === id)) {
      throw new PairingError("The paired phone does not exist.", 409);
    }
    save(phones.map((phone) => (phone.id === id ? { ...phone, name: validName } : phone)));
  }

  function revoke(id: string): void {
    save(phones.filter((phone) => phone.id !== id));
    if (pairing?.phoneId === id) {
      cancel();
    }
    for (const listener of listeners) {
      listener(id);
    }
  }

  function subscribeRevocation(listener: (id: string) => void): () => void {
    listeners.add(listener);
    return () => {
      listeners.delete(listener);
    };
  }

  function limitAttempts(): void {
    if (now() - attemptWindow >= 60000) {
      attemptWindow = now();
      attempts = 0;
    }
    attempts += 1;
    if (attempts > 20) {
      throw new PairingError("Too many pairing attempts. Wait one minute and try again.", 429);
    }
  }
}

function hash(value: string): string {
  return createHash("sha256").update(value).digest("hex");
}

function publicPhone(phone: StoredPhone): PairedPhone {
  return { id: phone.id, name: phone.name, pairedAt: phone.pairedAt, lastSeenAt: phone.lastSeenAt };
}

function phoneName(value: unknown): string {
  if (
    typeof value !== "string" ||
    value.trim().length === 0 ||
    value.length > 80 ||
    hasControlCharacters(value)
  ) {
    throw new PairingError(
      "A phone name must contain 1 to 80 characters without control characters.",
      400,
    );
  }
  return value;
}

function isStoredPhone(value: unknown): value is StoredPhone {
  if (typeof value !== "object" || value === null) {
    return false;
  }
  const phone = value as StoredPhone;
  return (
    Object.keys(value).sort().join(",") === "credentialHash,id,lastSeenAt,name,pairedAt" &&
    typeof phone.id === "string" &&
    /^[a-f0-9-]{36}$/.test(phone.id) &&
    typeof phone.name === "string" &&
    phone.name.trim().length > 0 &&
    phone.name.length <= 80 &&
    !hasControlCharacters(phone.name) &&
    Number.isSafeInteger(phone.pairedAt) &&
    phone.pairedAt >= 0 &&
    Number.isSafeInteger(phone.lastSeenAt) &&
    phone.lastSeenAt >= phone.pairedAt &&
    typeof phone.credentialHash === "string" &&
    /^[a-f0-9]{64}$/.test(phone.credentialHash)
  );
}

function hasControlCharacters(value: string): boolean {
  return [...value].some(
    (character) => character.charCodeAt(0) < 32 || character.charCodeAt(0) === 127,
  );
}
