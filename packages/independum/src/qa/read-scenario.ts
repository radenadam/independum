import { readFile } from "node:fs/promises";
import type { PreviewFixture } from "./create-preview-fixture.ts";

export interface QaStep {
  size?: [number, number];
  scale?: number;
  scheme?: "light" | "dark";
  go?: boolean;
  wait?: number;
  run?: string;
  shot?: string;
  clickOn?: string;
  hoverOn?: string;
  drag?: { on: string; by: [number, number] };
  key?: Record<string, string | number | boolean>;
  text?: string;
}

/** Reads and validates a scenario before starting the preview or browser. */
export async function readScenario(
  path: string,
): Promise<{ fixture: PreviewFixture; steps: QaStep[] }> {
  const value: unknown = JSON.parse(await readFile(path, "utf8"));
  let fixture: PreviewFixture = "chats";
  let steps = value;
  if (isRecord(value)) {
    if (
      Object.keys(value).some((key) => !["fixture", "steps"].includes(key)) ||
      !["empty", "chats", "compacted"].includes(String(value.fixture))
    ) {
      throw new Error("A scenario object needs a fixture and steps only.");
    }
    fixture = value.fixture as PreviewFixture;
    steps = value.steps;
  }
  if (!Array.isArray(steps) || steps.length === 0) {
    throw new Error("A scenario needs a nonempty list of steps.");
  }
  for (const [index, step] of steps.entries()) {
    if (
      !isRecord(step) ||
      Object.keys(step).length === 0 ||
      (step.scale !== undefined && step.size === undefined) ||
      !Object.entries(step).every(([key, field]) => isStepField(key, field))
    ) {
      throw new Error(`Scenario step ${index + 1} has an unknown field or an invalid value.`);
    }
  }
  return { fixture, steps: steps as QaStep[] };
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return value !== null && typeof value === "object" && !Array.isArray(value);
}

function isPair(value: unknown): value is [number, number] {
  return (
    Array.isArray(value) &&
    value.length === 2 &&
    value.every((part) => typeof part === "number" && Number.isFinite(part))
  );
}

function isStepField(key: string, value: unknown): boolean {
  switch (key) {
    case "size":
      return isPair(value) && value.every((part) => Number.isInteger(part) && part > 0);
    case "scale":
      return typeof value === "number" && Number.isFinite(value) && value > 0;
    case "scheme":
      return value === "light" || value === "dark";
    case "go":
      return typeof value === "boolean";
    case "wait":
      return typeof value === "number" && Number.isFinite(value) && value >= 0 && value <= 60000;
    case "run":
    case "clickOn":
    case "hoverOn":
      return typeof value === "string" && value.length > 0;
    case "shot":
      return typeof value === "string" && /^[a-z0-9]+(?:-[a-z0-9]+)*$/.test(value);
    case "text":
      return typeof value === "string";
    case "key":
      return (
        isRecord(value) &&
        Object.keys(value).length > 0 &&
        Object.values(value).every((part) => ["string", "number", "boolean"].includes(typeof part))
      );
    case "drag":
      return (
        isRecord(value) &&
        Object.keys(value).every((part) => ["on", "by"].includes(part)) &&
        typeof value.on === "string" &&
        value.on.length > 0 &&
        isPair(value.by)
      );
    default:
      return false;
  }
}
