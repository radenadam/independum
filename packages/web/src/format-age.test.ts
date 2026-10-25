import { expect, test } from "vitest";
import { formatAge } from "./format-age.ts";

const now = Date.UTC(2026, 9, 26, 12, 0, 0);
const minute = 60 * 1000;

test("an age under a minute reads as just now", () => {
  expect(formatAge(now - 20 * 1000, now)).toBe("just now");
});

test("an age uses its largest whole unit", () => {
  expect(formatAge(now - 5 * minute, now)).toBe("5 minutes ago");
  expect(formatAge(now - 3 * 60 * minute, now)).toBe("3 hours ago");
  expect(formatAge(now - 24 * 60 * minute, now)).toBe("yesterday");
  expect(formatAge(now - 15 * 24 * 60 * minute, now)).toBe("2 weeks ago");
});
