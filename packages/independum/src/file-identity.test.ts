import { expect, test } from "vitest";
import { fileIdentity } from "./file-identity.ts";

test("file indexes that differ only in their low bits give different identities", () => {
  const first = { dev: 3401427088n, ino: 0x9c0000001d5898n, birthtimeNs: 1794881795483606800n };
  const second = { ...first, ino: first.ino + 1n };
  expect(Number(second.ino)).toBe(Number(first.ino));
  expect(fileIdentity(second)).not.toBe(fileIdentity(first));
});

test("a later file that receives the index of a deleted file differs by its birth time", () => {
  const first = { dev: 1n, ino: 42n, birthtimeNs: 1794881795483606800n };
  expect(fileIdentity({ ...first, birthtimeNs: first.birthtimeNs + 100n })).not.toBe(
    fileIdentity(first),
  );
});
