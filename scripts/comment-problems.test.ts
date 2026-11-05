import { parseSync } from "oxc-parser";
import { expect, test } from "vitest";
import { findDocCommentProblems, findProseProblems } from "./comment-problems.ts";

test("doc comments contain one sentence across any number of lines", () => {
  const comments = parseSync(
    "example.ts",
    "/** Returns the value. It keeps its format. */\n/**\n * Returns the value with\n * its original format.\n */",
  ).comments;
  expect(comments.map(findDocCommentProblems)).toEqual([["A doc comment is one sentence."], []]);
});

test("code spans and decimal numbers do not divide a doc comment", () => {
  const comments = parseSync("example.ts", "/** Returns `first. second` in 3.4 s. */").comments;
  expect(comments.flatMap(findDocCommentProblems)).toEqual([]);
});

test("ordinary comments can explain a constraint in several sentences", () => {
  expect(findProseProblems("Pi does not save requests. Only messages persist.")).toEqual([]);
});
