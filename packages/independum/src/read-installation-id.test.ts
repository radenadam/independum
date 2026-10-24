import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterAll, expect, test } from "vitest";
import { readInstallationId } from "./read-installation-id.ts";

const directory = mkdtempSync(join(tmpdir(), "independum-test-"));
afterAll(() => rmSync(directory, { recursive: true, force: true }));

test("installation id is a uuid created once and kept", () => {
  const first = readInstallationId(join(directory, "independum"));
  expect(first).toMatch(/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/);
  expect(readInstallationId(join(directory, "independum"))).toBe(first);
});
