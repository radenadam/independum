import type { ToolDefinition } from "@earendil-works/pi-coding-agent";
import { Value } from "typebox/value";
import { defineText, type ModelText, type ModelTexts } from "./model-texts.ts";

function argumentTextsFor(name: string) {
  const id = `${name[0]?.toLowerCase()}${name.slice(1)}.arguments`;
  return {
    invalid: defineText({
      id,
      group: name,
      section: "result",
      label: "When arguments differ from the tool schema",
      builtIn:
        "Arguments for {tool} do not match its schema:\n{differences}\nNo tool operation ran.",
      slots: {
        tool: { meaning: "The tool name.", example: "Read" },
        differences: {
          meaning: "Each differing parameter with its expected schema and supplied value.",
          example: '/offset: expected {"type":"integer","minimum":1}. Received "2".',
        },
      },
    }),
    parameter: defineText({
      id: `${id}.parameter`,
      group: name,
      section: "result",
      label: "Each parameter that differs from the tool schema",
      builtIn: "{parameter}: expected {expected}. Received {received}.",
      slots: {
        parameter: { meaning: "The parameter's JSON pointer.", example: "/offset" },
        expected: {
          meaning: "The required JSON schema without descriptive text.",
          example: '{"type":"integer","minimum":1}',
        },
        received: {
          meaning: "The exact supplied JSON value, or the omission text.",
          example: '"2"',
        },
      },
    }),
    omitted: defineText({
      id: `${id}.omitted`,
      group: name,
      section: "result",
      label: "When a required argument is omitted",
      builtIn: "omitted",
      slots: {},
    }),
  };
}

/** The exact-argument failure texts in each tool's editor and reset group. */
export const toolArgumentTextList: ModelText[] = [
  "Read",
  "Write",
  "Edit",
  "Shell",
  "CheckCommand",
  "StopCommand",
].flatMap((name) => Object.values(argumentTextsFor(name)));

/** Checks the supplied arguments without conversion and returns an isolated copy for execution. */
export function validateToolArguments(
  tool: Pick<ToolDefinition, "name" | "parameters">,
  input: unknown,
  texts: ModelTexts,
): Record<string, unknown> {
  const errors = Value.Errors(tool.parameters, input);
  if (errors.length === 0) {
    return structuredClone(input) as Record<string, unknown>;
  }
  const wording = argumentTextsFor(tool.name);
  const differences = new Map<string, string>();
  function add(parameter: string, schemaPath: string): void {
    if (differences.has(parameter)) {
      return;
    }
    const expected = Value.Pointer.Get(
      tool.parameters,
      schemaPath.replace(/\/(?:anyOf|oneOf)\/\d+(?:\/.*)?$/, ""),
    );
    const received = Value.Pointer.Get(input, parameter);
    differences.set(
      parameter,
      texts.fill(wording.parameter, {
        parameter: parameter || "/",
        expected: JSON.stringify(expected, (key, value) =>
          key === "description" && typeof value === "string" ? undefined : value,
        ),
        received: received === undefined ? texts.get(wording.omitted) : JSON.stringify(received),
      }),
    );
  }
  for (const error of errors) {
    const schemaPath = error.schemaPath.slice(1);
    if (error.keyword === "required") {
      for (const property of error.params.requiredProperties) {
        const escaped = property.replace(/~/g, "~0").replace(/\//g, "~1");
        add(`${error.instancePath}/${escaped}`, `${schemaPath}/properties/${escaped}`);
      }
    } else if (error.keyword !== "additionalProperties") {
      add(error.instancePath, schemaPath);
    }
  }
  throw new Error(
    texts.fill(wording.invalid, {
      tool: tool.name,
      differences: [...differences.values()].join("\n"),
    }),
  );
}
