import { expect, test } from "vitest";
import { findCodeProblems } from "./find-code-problems.ts";

test("test conditions reject direct vitest waits and polling under import aliases", () => {
  for (const code of [
    'import { vi } from "vitest"; vi.waitFor(() => expect(value).toBe(true));',
    'import { vi as clock } from "vitest"; clock["waitFor"](condition, { timeout: 20000 });',
    'import { vitest as clock } from "vitest"; clock.waitUntil(condition);',
    'import { expect as check } from "vitest"; check.poll(condition).toBe(true);',
    'import * as testing from "vitest"; testing.vi.waitFor(condition);',
    'import * as testing from "vitest"; testing.expect.poll(condition).toBe(true);',
    'import { vi } from "vitest"; const retry = vi.waitFor;',
  ]) {
    expect(findCodeProblems("example.test.ts", code)).toContainEqual(
      expect.stringContaining("Test conditions use scripts/wait-for.ts"),
    );
  }
  expect(
    findCodeProblems(
      "example.test.ts",
      'import { waitFor } from "./wait-for.ts"; await waitFor(() => expect(value).toBe(true));',
    ),
  ).toEqual([]);
  expect(
    findCodeProblems(
      "scripts/wait-for.ts",
      'import { vi } from "vitest"; vi.waitFor(condition, { timeout });',
    ),
  ).toEqual([]);
});

test("sandbox imports use the stable contract through one production adapter", () => {
  expect(
    findCodeProblems("create-sandbox.ts", 'import { spawn } from "@microsoft/mxc-sdk/v1";'),
  ).toEqual([]);
  expect(
    findCodeProblems("example.ts", 'import { spawn } from "@microsoft/mxc-sdk/v1";'),
  ).toContainEqual(expect.stringContaining("Native sandbox access belongs"));
  expect(
    findCodeProblems("create-sandbox.ts", 'import { spawn } from "@microsoft/mxc-sdk";'),
  ).toContainEqual(expect.stringContaining("stable MXC V1"));
});

test("sandbox operations require an explicit telemetry refusal even under an import alias", () => {
  const imported = 'import { spawn as launch } from "@microsoft/mxc-sdk/v1"; ';
  expect(findCodeProblems("create-sandbox.ts", `${imported}launch(request);`)).toContainEqual(
    expect.stringContaining("explicitly disable telemetry"),
  );
  expect(
    findCodeProblems(
      "create-sandbox.ts",
      `${imported}launch(request, { telemetry: { enabled: false } });`,
    ),
  ).toEqual([]);
});

test("named arrows fail while callbacks and function declarations pass", () => {
  expect(
    findCodeProblems("example.ts", "const rank = (value: number) => value + 1;"),
  ).toContainEqual(expect.stringContaining("Named functions use function declarations."));
  expect(
    findCodeProblems(
      "example.ts",
      "function rank(value: number) { return value + 1; } values.map((value) => rank(value));",
    ),
  ).toEqual([]);
  expect(findCodeProblems("example.ts", "session.stream = (value) => value;")).toContainEqual(
    expect.stringContaining("Named functions use function declarations."),
  );
});

test("a sole exported function names its file even beside exported data and types", () => {
  const code =
    "export interface Version {} export const texts = []; export function versionOf() {}";
  expect(findCodeProblems("file-fingerprint.ts", code)).toContainEqual(
    expect.stringContaining("named version-of.ts"),
  );
  expect(findCodeProblems("version-of.ts", code)).toEqual([]);
  expect(
    findCodeProblems("tools.ts", "export function read() {} export function write() {}"),
  ).toEqual([]);
  expect(findCodeProblems("step-box.tsx", "export function StepBox() { return <div />; }")).toEqual(
    [],
  );
});

test("internal folder bindings use full words while external api fields keep their names", () => {
  expect(
    findCodeProblems("example.ts", "const { cwd } = context; list.map((cwd) => cwd);"),
  ).toHaveLength(2);
  expect(findCodeProblems("example.ts", "const { cwd: folder } = context;")).toEqual([]);
  expect(
    findCodeProblems(
      "example.ts",
      "interface ChatOptions { cwd: string } function open(cwd: string) {}",
    ),
  ).toHaveLength(2);
  expect(findCodeProblems("example.ts", "const cwd = process.cwd();")).toContainEqual(
    expect.stringContaining("Internal names use full words."),
  );
  expect(
    findCodeProblems(
      "example.ts",
      "const folder = process.cwd(); spawn(shell, [], { cwd: folder }); context.cwd;",
    ),
  ).toEqual([]);
});

test("error sentences start with capitals and end with periods", () => {
  expect(findCodeProblems("example.ts", 'throw new Error("missing file");')).toHaveLength(2);
  expect(findCodeProblems("example.ts", `throw new Error(\`missing \${path}.\`);`)).toContainEqual(
    expect.stringContaining("Error messages start with a capital letter."),
  );
  expect(findCodeProblems("example.ts", 'throw new Error("Missing file.");')).toEqual([]);
});

test("model text sentences use capitals while result fragments keep their wording", () => {
  expect(
    findCodeProblems("example.ts", 'defineText({ builtIn: "old_string is empty." });'),
  ).toContainEqual(expect.stringContaining("Error messages start with a capital letter."));
  expect(
    findCodeProblems(
      "example.ts",
      'defineText({ builtIn: "the space at line {line}" }); defineText({ builtIn: "Old_string is empty." });',
    ),
  ).toEqual([]);
});

test("inline styles pass custom properties through markup and dom updates", () => {
  expect(
    findCodeProblems(
      "example.tsx",
      'element.style.height = "0px"; <div style={{ height: size }} />;',
    ),
  ).toHaveLength(2);
  expect(
    findCodeProblems("example.tsx", 'element.style.setProperty("height", size);'),
  ).toHaveLength(1);
  expect(
    findCodeProblems(
      "example.tsx",
      'const variables = { "--height": size } as CSSProperties; element.style.setProperty("--height", size); <div style={variables} />;',
    ),
  ).toEqual([]);
  expect(
    findCodeProblems(
      "example.tsx",
      "const variables = { height: size }; <div style={variables} />;",
    ),
  ).toHaveLength(1);
});

test("test names are lowercase phrases without a final period", () => {
  expect(
    findCodeProblems("example.test.ts", 'test("CheckCommand waits.", () => {});'),
  ).toHaveLength(1);
  expect(
    findCodeProblems("example.test.ts", 'test("checking a command waits", () => {});'),
  ).toEqual([]);
  expect(
    findCodeProblems("example.test.ts", 'test.each([1, 2])("Checks %s", () => {});'),
  ).toHaveLength(1);
  expect(
    findCodeProblems(
      "example.test.ts",
      'test.skipIf(isUnavailable)("checks a command", () => {});',
    ),
  ).toEqual([]);
  expect(
    findCodeProblems("example.test.ts", 'test.each(cases)("opens $isOpen", () => {});'),
  ).toEqual([]);
});
