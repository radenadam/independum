import { expect, test } from "vitest";
import { shortenTitle } from "./shorten-title.ts";

test("a title of fifty characters or fewer stays whole", () => {
  const line = "Plan the release of the next version this month.";
  expect(shortenTitle(line)).toBe(line);
  expect(shortenTitle("x".repeat(50))).toBe("x".repeat(50));
});

test("a longer title ends at the last word that fits and gets an ellipsis", () => {
  expect(
    shortenTitle(
      "Summarize the attached notes and list every open question they raise about the release plan.",
    ),
  ).toBe("Summarize the attached notes and list every open\u2026");
  expect(shortenTitle(`${"word ".repeat(10)}more`)).toBe(`${"word ".repeat(9)}word\u2026`);
});

test("one word longer than the limit is cut at the limit", () => {
  expect(shortenTitle(`${"a".repeat(80)} end`)).toBe(`${"a".repeat(50)}\u2026`);
});

test("a cut never splits a character outside the basic plane", () => {
  expect(shortenTitle("\u{1F600}".repeat(60))).toBe(`${"\u{1F600}".repeat(50)}\u2026`);
});
