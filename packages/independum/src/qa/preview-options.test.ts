import { expect, test } from "vitest";
import { previewOptions } from "./preview-options.ts";

test("preview defaults to an isolated home and a free port", () => {
  expect(previewOptions([], false)).toMatchObject({
    fixture: "chats",
    port: 0,
    hasRealLogins: false,
  });
});

test("preview accepts explicit fixtures ports and real logins", () => {
  expect(
    previewOptions(["--fixture", "compacted", "--port=4871", "--real-logins"], false),
  ).toMatchObject({ fixture: "compacted", port: 4871, hasRealLogins: true });
});

test("preview rejects unknown flags and invalid ports and fixtures", () => {
  for (const arguments_ of [
    ["--fixture", "missing"],
    ["--port", "-1"],
    ["--port", "65536"],
    ["--port", "1.5"],
    ["--port", ""],
    ["--unknown"],
  ]) {
    expect(() => previewOptions(arguments_, false)).toThrow();
  }
});

test("qa requires exactly one scenario and accepts a running preview", () => {
  expect(() => previewOptions([], true)).toThrow();
  expect(() => previewOptions(["welcome", "phone"], true)).toThrow();
  expect(
    previewOptions(
      ["phone", "--url", "http://127.0.0.1:4871/#token=example", "--browser", "edge"],
      true,
    ),
  ).toMatchObject({
    scenario: "phone",
    browser: "edge",
    url: "http://127.0.0.1:4871/#token=example",
  });
});
