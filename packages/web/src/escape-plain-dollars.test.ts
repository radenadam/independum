import { expect, test } from "vitest";
import { escapePlainDollars } from "./escape-plain-dollars.ts";

test("prices stay text", () => {
  expect(escapePlainDollars("The ball costs $0.05, and the bat costs $1.05.")).toBe(
    "The ball costs \\$0.05, and the bat costs \\$1.05.",
  );
  expect(escapePlainDollars("Between $5-$10 a month.")).toBe("Between \\$5-\\$10 a month.");
});

test("inline math keeps its dollar signs, even next to a price", () => {
  expect(escapePlainDollars("Let $x^2 + 1$ be positive.")).toBe("Let $x^2 + 1$ be positive.");
  expect(escapePlainDollars("It costs $5, and $n$ counts them.")).toBe(
    "It costs \\$5, and $n$ counts them.",
  );
});

test("display math and escaped dollar signs stay as they are", () => {
  expect(escapePlainDollars("$$\nx = \\frac{1}{2}\n$$")).toBe("$$\nx = \\frac{1}{2}\n$$");
  expect(escapePlainDollars("Both $$a$$ and \\$5 stay.")).toBe("Both $$a$$ and \\$5 stay.");
});

test("code keeps its dollar signs", () => {
  expect(escapePlainDollars("Run `echo $HOME` and pay $5.")).toBe("Run `echo $HOME` and pay \\$5.");
  const block = "```bash\necho $PATH costs $1\n```\nIt costs $2.";
  expect(escapePlainDollars(block)).toBe("```bash\necho $PATH costs $1\n```\nIt costs \\$2.");
});
