import { Type } from "@earendil-works/pi-ai";
import { expect, test } from "vitest";
import { allTexts } from "./agent-texts.ts";
import { changeTexts, createModelTexts, summarizeTexts } from "./model-texts.ts";
import { createReadTool } from "./tools/create-read-tool.ts";
import { validateToolArguments } from "./validate-tool-arguments.ts";

const texts = createModelTexts(() => ({}));
const read = createReadTool({ texts, getLimits: () => ({ maxLines: 2000, maxBytes: 51_200 }) });

test("argument failure text names every differing parameter, expected schema, and exact supplied value", () => {
  const input = { path: 42, offset: "2", limit: null, length: 0 };
  expect(() => validateToolArguments(read, input, texts)).toThrow(
    "Arguments for Read do not match its schema:\n" +
      '/path: expected {"type":"string","minLength":1}. Received 42.\n' +
      '/offset: expected {"type":"integer","minimum":1}. Received "2".\n' +
      '/limit: expected {"type":"integer","minimum":1}. Received null.\n' +
      '/length: expected {"type":"integer","minimum":1}. Received 0.\n' +
      "No tool operation ran.",
  );
  expect(input).toEqual({ path: 42, offset: "2", limit: null, length: 0 });
});

test("argument failures identify missing and nested parameters without duplicate union errors", () => {
  const tool = {
    name: "Shell",
    parameters: Type.Object({
      command: Type.String(),
      access: Type.Object({
        paths: Type.Array(
          Type.Object(
            { scope: Type.Union([Type.Literal("file"), Type.Literal("tree")]) },
            { additionalProperties: false },
          ),
        ),
      }),
    }),
  };
  expect(() =>
    validateToolArguments(tool, { access: { paths: [{ scope: true, extra: 3 }] } }, texts),
  ).toThrow(
    "Arguments for Shell do not match its schema:\n" +
      '/command: expected {"type":"string"}. Received omitted.\n' +
      "/access/paths/0/extra: expected false. Received 3.\n" +
      '/access/paths/0/scope: expected {"anyOf":[{"type":"string","const":"file"},{"type":"string","const":"tree"}]}. Received true.\n' +
      "No tool operation ran.",
  );
});

test.each([null, [], "arguments", 42])("nonobject arguments fail exactly for %j", (input) => {
  expect(() => validateToolArguments(read, input, texts)).toThrow("Received");
});

test("valid arguments keep their values and omissions in an isolated copy", () => {
  const input = { path: "file.txt", offset: 2 };
  const accepted = validateToolArguments(read, input, texts);
  expect(accepted).toEqual(input);
  expect(accepted).not.toBe(input);
  expect(accepted).not.toHaveProperty("limit");
});

test.each(["Read", "Write", "Edit", "Shell", "CheckCommand", "StopCommand"])(
  "%s argument failure texts are registered in its editable and resettable group",
  (name) => {
    const id = `${name[0]?.toLowerCase()}${name.slice(1)}.arguments`;
    const change = {
      [id]: "Rejected {tool}: {differences}",
      [`${id}.parameter`]: "{parameter} needs {expected}, got {received}",
      [`${id}.omitted`]: "missing",
    };
    const edited = changeTexts(allTexts, {}, change) ?? {};
    expect(summarizeTexts(allTexts, edited).filter((text) => text.id in change)).toMatchObject([
      { group: name, isEdited: true },
      { group: name, isEdited: true },
      { group: name, isEdited: true },
    ]);
    const tool = { name, parameters: Type.Object({ path: Type.String() }) };
    expect(() =>
      validateToolArguments(
        tool,
        {},
        createModelTexts(() => edited),
      ),
    ).toThrow(`Rejected ${name}: /path needs {"type":"string"}, got missing`);
    const reset = changeTexts(
      allTexts,
      edited,
      Object.fromEntries(Object.keys(change).map((id) => [id, null])),
    );
    expect(reset).toEqual({});
    expect(() =>
      validateToolArguments(
        tool,
        {},
        createModelTexts(() => reset ?? {}),
      ),
    ).toThrow(
      `Arguments for ${name} do not match its schema:\n/path: expected {"type":"string"}. Received omitted.\nNo tool operation ran.`,
    );
  },
);
