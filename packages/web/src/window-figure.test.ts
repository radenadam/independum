import { expect, test } from "vitest";
import { type FigurePart, squaresOf } from "./window-figure.tsx";

function kindsOf(parts: FigurePart[], windowSize: number, reserve: number | null, count: number) {
  return squaresOf(parts, windowSize, reserve, count).map((square) => square.kind);
}

test("each part takes its share of the window in the order the model reads it", () => {
  const parts: FigurePart[] = [
    { key: "prompt", kind: "instructions", tokens: 2000 },
    { key: "tools", kind: "tools", tokens: 3000 },
    { key: "message", kind: "messages", tokens: 1000 },
  ];
  expect(kindsOf(parts, 10_000, null, 10)).toEqual([
    "instructions",
    "instructions",
    "tools",
    "tools",
    "tools",
    "messages",
    "free",
    "free",
    "free",
    "free",
  ]);
});

test("a part too small for a square still shows as one", () => {
  const parts: FigurePart[] = [{ key: "prompt", kind: "instructions", tokens: 46 }];
  expect(kindsOf(parts, 1_000_000, null, 1000).filter((kind) => kind !== "free")).toEqual([
    "instructions",
  ]);
});

test("the room that pi keeps free ends the grid", () => {
  const parts: FigurePart[] = [{ key: "message", kind: "messages", tokens: 1000 }];
  expect(kindsOf(parts, 10_000, 2000, 10).slice(-3)).toEqual(["free", "kept", "kept"]);
});

test("a request that reaches the room kept free covers it", () => {
  const parts: FigurePart[] = [{ key: "message", kind: "messages", tokens: 9000 }];
  expect(kindsOf(parts, 10_000, 2000, 10)).toEqual([...Array(9).fill("messages"), "kept"]);
});

test("the parts of a run share its squares by their size", () => {
  const parts: FigurePart[] = [
    { key: "first", kind: "messages", tokens: 3000 },
    { key: "second", kind: "messages", tokens: 1000 },
  ];
  const keys = squaresOf(parts, 10_000, null, 10).map((square) => square.key);
  expect(keys.slice(0, 4)).toEqual(["first", "first", "first", "second"]);
});
