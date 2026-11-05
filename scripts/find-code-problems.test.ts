import { expect, test } from "vitest";
import { findCodeProblems } from "./find-code-problems.ts";

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
