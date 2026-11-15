import { existsSync, lstatSync, mkdirSync, renameSync, symlinkSync, writeFileSync } from "node:fs";
import { basename, dirname, join } from "node:path";
import { expect, test } from "vitest";
import { privateRuntime } from "./private-runtime.ts";
import { createTestFolder, createTestProject } from "./tools/create-test-folder.ts";

const parent = createTestFolder("state-migration");

function legacy(): { directory: string; moves: [string, string][] } {
  const { directory: home } = createTestProject(parent);
  const directory = join(home, ".independum");
  const runtime = join(directory, "runtime");
  renameSync(privateRuntime(directory), runtime);
  for (const name of ["retained.json", "phones.json", "startup.lock"]) {
    writeFileSync(join(runtime, name), "temporary fixture", { mode: 0o600 });
  }
  for (const name of ["auth.json", "models.json", "models-store.json"]) {
    writeFileSync(join(directory, name), "temporary fixture", { mode: 0o600 });
  }
  const attachments = join(home, ".independum-attachments");
  mkdirSync(join(attachments, "source"), { recursive: true });
  writeFileSync(join(attachments, "source", "content"), "attachment fixture");
  mkdirSync(join(directory, "sessions"));
  mkdirSync(join(directory, "outputs"));
  return {
    directory,
    moves: [
      [runtime, join(directory, "private")],
      ...["auth.json", "models.json", "models-store.json"].map((name): [string, string] => [
        join(directory, name),
        join(directory, "private", name),
      ]),
      [attachments, join(directory, "attachments")],
    ],
  };
}

test("startup renames legacy state without replacing identities and restart leaves it in place", () => {
  const { directory, moves } = legacy();
  const identities = moves.map(([source]) => lstatSync(source).ino);
  const retained = [
    join(directory, "sessions"),
    join(directory, "outputs"),
    join(directory, "runtime", "retained.json"),
    join(directory, "runtime", "phones.json"),
    join(directory, "runtime", "startup.lock"),
  ];
  const retainedIdentities = retained.map((path) => lstatSync(path).ino);
  expect(privateRuntime(directory)).toBe(join(directory, "private"));
  for (const [index, [source, destination]] of moves.entries()) {
    expect(existsSync(source)).toBe(false);
    expect(lstatSync(destination).ino).toBe(identities[index]);
  }
  for (const [index, path] of retained.entries()) {
    expect(
      lstatSync(path.replace(`${join(directory, "runtime")}`, join(directory, "private"))).ino,
    ).toBe(retainedIdentities[index]);
  }
  privateRuntime(directory);
  expect(moves.map(([, destination]) => lstatSync(destination).ino)).toEqual(identities);
});

test.each([0, 1, 2, 3, 4])("migration refuses collision %s before moving any source", (index) => {
  const { directory, moves } = legacy();
  const [source, destination] = moves[index] as [string, string];
  mkdirSync(dirname(destination), { recursive: true });
  if (index === 0) {
    mkdirSync(destination);
    writeFileSync(join(destination, "retained.txt"), "destination fixture");
  } else {
    writeFileSync(destination, "destination fixture");
  }
  const identities = moves.map(([path]) => lstatSync(path).ino);
  const destinationIdentity = lstatSync(destination).ino;
  // A runtime and private collision precedes its nested file collisions.
  const [firstSource, firstDestination] = [1, 2, 3].includes(index)
    ? (moves[0] as [string, string])
    : [source, destination];
  expect(() => privateRuntime(directory)).toThrow(
    `Cannot migrate state because both "${firstSource}" and "${firstDestination}" exist. Review the files before migration.`,
  );
  expect(moves.map(([path]) => lstatSync(path).ino)).toEqual(identities);
  expect(lstatSync(destination).ino).toBe(destinationIdentity);
});

test.each(["auth.json", "models.json", "models-store.json"])(
  "migration refuses duplicate %s inside the old runtime",
  (name) => {
    const { directory } = legacy();
    writeFileSync(join(directory, "runtime", name), "destination fixture");
    expect(() => privateRuntime(directory)).toThrow(
      `Cannot migrate state because both "${join(directory, name)}" and "${join(directory, "private", name)}" exist. Review the files before migration.`,
    );
    expect(existsSync(join(directory, "runtime"))).toBe(true);
    expect(existsSync(join(directory, "private"))).toBe(false);
  },
);

test.each(["auth.json", "models.json", "models-store.json"])(
  "migration refuses old and new %s after partial migration",
  (name) => {
    const { directory, moves } = legacy();
    renameSync(moves[0]?.[0] ?? "", moves[0]?.[1] ?? "");
    const source = join(directory, name);
    const destination = join(directory, "private", name);
    writeFileSync(destination, "destination fixture");
    const before = [source, destination].map((path) => lstatSync(path).ino);
    expect(() => privateRuntime(directory)).toThrow(
      `Cannot migrate state because both "${source}" and "${destination}" exist. Review the files before migration.`,
    );
    expect([source, destination].map((path) => lstatSync(path).ino)).toEqual(before);
  },
);

test("custom state paths migrate their sibling uploads and new homes create no sibling store", () => {
  const { directory: home } = createTestProject(parent);
  const directory = join(home, "custom-state");
  const old = join(home, `${basename(directory)}-attachments`);
  mkdirSync(old);
  const identity = lstatSync(old).ino;
  privateRuntime(directory);
  expect(lstatSync(join(directory, "attachments")).ino).toBe(identity);
  expect(existsSync(old)).toBe(false);
  const fresh = join(home, "fresh-state");
  privateRuntime(fresh);
  expect(existsSync(join(home, "fresh-state-attachments"))).toBe(false);
});

test("linked legacy storage refuses migration without following its target", () => {
  const { directory: home, project } = createTestProject(parent);
  const directory = join(home, "state");
  mkdirSync(directory);
  const runtime = join(directory, "runtime");
  symlinkSync(project, runtime, "junction");
  expect(() => privateRuntime(directory)).toThrow(`Cannot migrate linked state path "${runtime}".`);
  expect(lstatSync(runtime).isSymbolicLink()).toBe(true);
  expect(existsSync(join(directory, "private"))).toBe(false);
});
