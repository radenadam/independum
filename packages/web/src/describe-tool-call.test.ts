import type { ToolCallPart } from "independum/api-types";
import { expect, test } from "vitest";
import { describeToolCall, isCallRunning } from "./describe-tool-call.ts";

test("waiting approval has no command timer, quiet warning, or process controls", () => {
  const part: ToolCallPart = {
    type: "toolCall",
    id: "call",
    name: "Shell",
    input: { command: "echo pending" },
    result: null,
  };
  const waiting = { startedAt: 0, details: { approval: { id: "pending" } } };
  expect(isCallRunning(part, waiting, undefined, true)).toBe(false);
  expect(describeToolCall(part, waiting, undefined, true, 60_000)).toMatchObject({
    status: { text: "Needs approval", tone: "quiet" },
    isRunning: false,
    canStop: false,
    canMove: false,
    quietMs: undefined,
  });
  expect(isCallRunning(part, { startedAt: 60_000, details: null }, undefined, true)).toBe(true);
});

test("a denied call reads as denied in a quiet tone for shell and file tools", () => {
  for (const name of ["Shell", "Read", "Write"]) {
    const part: ToolCallPart = {
      type: "toolCall",
      id: "call",
      name,
      input: { command: "echo denied", path: "notes.txt" },
      result: {
        text: "The user denied this call. No tool operation ran.",
        images: [],
        isError: true,
        details: { outcome: "denied" },
      },
    };
    expect(describeToolCall(part, undefined, undefined, false, 0).status).toEqual({
      text: "Denied",
      tone: "quiet",
    });
  }
});
