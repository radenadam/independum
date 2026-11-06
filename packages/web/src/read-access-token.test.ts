import { afterEach, beforeEach, expect, test, vi } from "vitest";
import {
  forgetAccessToken,
  isPhoneBrowser,
  readAccessToken,
  readPairingInvitation,
  rememberPhoneCredential,
} from "./read-access-token.ts";

const values = new Map<string, string>();
const location = new URL("https://phone.test/?chat=chosen");
const replaceState = vi.fn((_state: unknown, _title: string, path: string) => {
  location.href = new URL(path, location).href;
});

beforeEach(() => {
  values.clear();
  location.href = "https://phone.test/?chat=chosen";
  replaceState.mockClear();
  vi.stubGlobal("window", { location });
  vi.stubGlobal("history", { replaceState });
  vi.stubGlobal("localStorage", {
    getItem(key: string) {
      return values.get(key) ?? null;
    },
    setItem(key: string, value: string) {
      values.set(key, value);
    },
    removeItem(key: string) {
      values.delete(key);
    },
  });
});
afterEach(() => vi.unstubAllGlobals());

test("a pairing fragment leaves history before use and never becomes the saved credential", () => {
  rememberPhoneCredential("existing-phone-fixture");
  location.hash = "pair=one-use-fixture";
  expect(readPairingInvitation()).toBe("one-use-fixture");
  expect(replaceState).toHaveBeenCalledWith(null, "", "/?chat=chosen");
  expect(location.hash).toBe("");
  expect(readPairingInvitation()).toBeUndefined();
  expect(readAccessToken()).toBe("existing-phone-fixture");
  expect([...values.values()]).not.toContain("one-use-fixture");
});

test("approved credentials persist until disconnection and a local launch link changes authority", () => {
  expect(readAccessToken()).toBeUndefined();
  rememberPhoneCredential("approved-phone-fixture");
  expect(isPhoneBrowser()).toBe(true);
  expect(readAccessToken()).toBe("approved-phone-fixture");
  forgetAccessToken();
  expect(readAccessToken()).toBeUndefined();
  expect(isPhoneBrowser()).toBe(true);
  location.hash = "token=local-control-fixture";
  expect(readAccessToken()).toBe("local-control-fixture");
  expect(isPhoneBrowser()).toBe(false);
  expect(location.hash).toBe("");
  expect(location.searchParams.get("chat")).toBe("chosen");
});
