import { expect, test } from "vitest";
import { chatIdFromUrl, urlForChat } from "./chat-location.ts";

test("a tab reads its chat from its own url", () => {
  expect(chatIdFromUrl(new URL("http://localhost/?chat=first"))).toBe("first");
  expect(chatIdFromUrl(new URL("http://localhost/?chat=second"))).toBe("second");
  expect(chatIdFromUrl(new URL("http://localhost/?chat="))).toBeUndefined();
  expect(chatIdFromUrl(new URL("http://localhost/"))).toBeUndefined();
});

test("choosing a chat preserves the rest of the url and survives a reload", () => {
  const original = new URL("http://localhost/?other=value#token=secret");
  const chosen = urlForChat(original, "chat with spaces");
  expect(chatIdFromUrl(new URL(chosen.href))).toBe("chat with spaces");
  expect(chosen.searchParams.get("other")).toBe("value");
  expect(chosen.hash).toBe(original.hash);
  expect(chatIdFromUrl(original)).toBeUndefined();
});
