import { expect, test } from "vitest";
import { findProviderLogo } from "./find-provider-logo.ts";

const fileNames = [
  "anthropic",
  "anthropic-text",
  "deepseek",
  "deepseek-color",
  "githubcopilot",
  "moonshot",
  "togetherai",
  "bedrock",
  "bedrock-color",
  "qwen",
  "qwen-color",
  "xiaomimimo",
  "ollama-text",
];

test("an exact match uses the drawing in brand colors when there is one", () => {
  expect(findProviderLogo("anthropic", fileNames)).toBe("anthropic");
  expect(findProviderLogo("deepseek", fileNames)).toBe("deepseek-color");
});

test("an id matches without its hyphens", () => {
  expect(findProviderLogo("github-copilot", fileNames)).toBe("githubcopilot");
});

test("an id matches by its first part, with or without ai", () => {
  expect(findProviderLogo("qwen-token-plan-cn", fileNames)).toBe("qwen-color");
  expect(findProviderLogo("moonshotai-cn", fileNames)).toBe("moonshot");
  expect(findProviderLogo("together", fileNames)).toBe("togetherai");
});

test("an id matches by its last part", () => {
  expect(findProviderLogo("amazon-bedrock", fileNames)).toBe("bedrock-color");
});

test("an id matches the only brand that starts with its first part", () => {
  expect(findProviderLogo("xiaomi-token-plan-sgp", fileNames)).toBe("xiaomimimo");
});

test("a provider without a small logo has none", () => {
  expect(findProviderLogo("radius", fileNames)).toBeUndefined();
  expect(findProviderLogo("ollama", fileNames)).toBeUndefined();
});
