import { expect, test } from "vitest";
import { fillText, slotNamesOf } from "./text-slots.ts";

test("a slot takes its value, and other names in braces stay as written", () => {
  expect(fillText("{a} and {b} cost $1 {a}", { a: "x" })).toBe("x and {b} cost $1 x");
  expect(fillText("Line {line}", { line: 3 })).toBe("Line 3");
});

test("the names in braces of a text come back once each", () => {
  expect(slotNamesOf("{id} ran, {id} ended in {time}. {not a slot}")).toEqual(["id", "time"]);
});
