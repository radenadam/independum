import { existsSync, mkdirSync, readFileSync, renameSync, rmSync, writeFileSync } from "node:fs";
import { rename, rm } from "node:fs/promises";
import { join } from "node:path";
import { afterEach, expect, test, vi } from "vitest";
import {
  movePath,
  movePathSync,
  type RemoveOptions,
  removePath,
  removePathSync,
  replaceFile,
  replaceFileSync,
} from "./file-changes.ts";
import { createTestFolder } from "./tools/create-test-folder.ts";

vi.mock("node:fs", { spy: true });
vi.mock("node:fs/promises", { spy: true });

interface Spy {
  mockImplementationOnce(implementation: () => never): unknown;
  mock: { calls: unknown[] };
}

interface Paths {
  source: string;
  target: string;
  free: string;
}

const folder = createTestFolder("file-changes");
const platform = process.platform;
let nextId = 0;

afterEach(() => {
  Object.defineProperty(process, "platform", { value: platform });
  vi.resetAllMocks();
});

function paths(): Paths {
  nextId += 1;
  const created = {
    source: join(folder, `source-${nextId}.json`),
    target: join(folder, `target-${nextId}.json`),
    free: join(folder, `free-${nextId}.json`),
  };
  writeFileSync(created.source, "new");
  writeFileSync(created.target, "old");
  return created;
}

function contents(created: Paths): Record<keyof Paths, string | null> {
  function read(path: string): string | null {
    return existsSync(path) ? readFileSync(path, "utf8") : null;
  }
  return { source: read(created.source), target: read(created.target), free: read(created.free) };
}

const before = { source: "new", target: "old", free: null };

function fail(spy: Spy, errors: Error[]): void {
  for (const error of errors) {
    spy.mockImplementationOnce(() => {
      throw error;
    });
  }
}

function failure(code: string, path: string): Error {
  return Object.assign(new Error(`${code}: The change of ${path} failed.`), { code, path });
}

const forms = [
  {
    name: "asynchronous replacements",
    change: (created: Paths) => replaceFile(created.source, created.target),
    spy: (): Spy => vi.mocked(rename),
    after: { source: null, target: "new", free: null },
  },
  {
    name: "synchronous replacements",
    change: async (created: Paths) => replaceFileSync(created.source, created.target),
    spy: (): Spy => vi.mocked(renameSync),
    after: { source: null, target: "new", free: null },
  },
  {
    name: "asynchronous moves",
    change: (created: Paths) => movePath(created.source, created.free),
    spy: (): Spy => vi.mocked(rename),
    after: { source: null, target: "old", free: "new" },
  },
  {
    name: "synchronous moves",
    change: async (created: Paths) => movePathSync(created.source, created.free),
    spy: (): Spy => vi.mocked(renameSync),
    after: { source: null, target: "old", free: "new" },
  },
  {
    name: "asynchronous removals",
    change: (created: Paths) => removePath(created.target),
    spy: (): Spy => vi.mocked(rm),
    after: { source: "new", target: null, free: null },
  },
  {
    name: "synchronous removals",
    change: async (created: Paths) => removePathSync(created.target),
    spy: (): Spy => vi.mocked(rmSync),
    after: { source: "new", target: null, free: null },
  },
];

test.each(forms)(
  "windows retries $name of a file in use until one succeeds",
  async ({ change, spy, after }) => {
    Object.defineProperty(process, "platform", { value: "win32" });
    const created = paths();
    fail(
      spy(),
      ["EPERM", "EACCES", "EBUSY"].map((code) => failure(code, created.source)),
    );
    await change(created);
    expect(spy().mock.calls).toHaveLength(4);
    expect(contents(created)).toEqual(after);
  },
);

test.each(forms)(
  "windows reports the exact last error of $name and changes nothing when every retry fails",
  async ({ change, spy }) => {
    Object.defineProperty(process, "platform", { value: "win32" });
    const created = paths();
    const errors = Array.from({ length: 9 }, () => failure("EPERM", created.source));
    fail(spy(), errors);
    await expect(change(created)).rejects.toBe(errors.at(-1));
    expect(spy().mock.calls).toHaveLength(9);
    expect(contents(created)).toEqual(before);
  },
);

test.each(forms)(
  "other systems report $name refused for permission after one attempt",
  async ({ change, spy }) => {
    Object.defineProperty(process, "platform", { value: "linux" });
    const created = paths();
    const error = failure("EPERM", created.source);
    fail(spy(), [error]);
    await expect(change(created)).rejects.toBe(error);
    expect(spy().mock.calls).toHaveLength(1);
    expect(contents(created)).toEqual(before);
  },
);

test.each(forms)(
  "windows reports $name that fail for another reason after one attempt",
  async ({ change, spy }) => {
    Object.defineProperty(process, "platform", { value: "win32" });
    const created = paths();
    const error = failure("ENOENT", created.source);
    fail(spy(), [error]);
    await expect(change(created)).rejects.toBe(error);
    expect(spy().mock.calls).toHaveLength(1);
  },
);

test.each([
  { name: "asynchronous", move: movePath, spy: (): Spy => vi.mocked(rename) },
  {
    name: "synchronous",
    move: async (source: string, target: string) => movePathSync(source, target),
    spy: (): Spy => vi.mocked(renameSync),
  },
])("$name moves refuse an existing target without renaming", async ({ move, spy }) => {
  Object.defineProperty(process, "platform", { value: "win32" });
  const created = paths();
  await expect(move(created.source, created.target)).rejects.toMatchObject({
    code: "EEXIST",
    message: `Cannot move "${created.source}" because "${created.target}" already exists.`,
  });
  expect(spy().mock.calls).toHaveLength(0);
  expect(contents(created)).toEqual(before);
});

const removals = [
  { name: "asynchronous removals", remove: removePath, spy: (): Spy => vi.mocked(rm) },
  {
    name: "synchronous removals",
    remove: async (path: string, options?: RemoveOptions) => removePathSync(path, options),
    spy: (): Spy => vi.mocked(rmSync),
  },
];

function folderWithFile(): string {
  nextId += 1;
  const created = join(folder, `folder-${nextId}`);
  mkdirSync(created);
  writeFileSync(join(created, "pending.json"), "old");
  return created;
}

test.each(removals)(
  "windows retries recursive $name while a folder still empties until it is gone",
  async ({ remove, spy }) => {
    Object.defineProperty(process, "platform", { value: "win32" });
    const folderPath = folderWithFile();
    fail(spy(), [failure("ENOTEMPTY", folderPath), failure("ENOTEMPTY", folderPath)]);
    await remove(folderPath, { recursive: true, force: true });
    expect(spy().mock.calls).toHaveLength(3);
    expect(existsSync(folderPath)).toBe(false);
  },
);

test.each(removals)(
  "windows reports the exact last error of recursive $name of a folder that never empties",
  async ({ remove, spy }) => {
    Object.defineProperty(process, "platform", { value: "win32" });
    const folderPath = folderWithFile();
    const errors = Array.from({ length: 9 }, () => failure("ENOTEMPTY", folderPath));
    fail(spy(), errors);
    await expect(remove(folderPath, { recursive: true, force: true })).rejects.toBe(errors.at(-1));
    expect(spy().mock.calls).toHaveLength(9);
    expect(existsSync(folderPath)).toBe(true);
  },
);

test.each(removals)(
  "$name report a folder not yet empty after one attempt unless recursive on windows",
  async ({ remove, spy }) => {
    for (const { system, options } of [
      { system: "win32", options: { force: true } },
      { system: "linux", options: { recursive: true, force: true } },
    ]) {
      Object.defineProperty(process, "platform", { value: system });
      const folderPath = folderWithFile();
      const error = failure("ENOTEMPTY", folderPath);
      const before = spy().mock.calls.length;
      fail(spy(), [error]);
      await expect(remove(folderPath, options)).rejects.toBe(error);
      expect(spy().mock.calls.length - before).toBe(1);
    }
  },
);
