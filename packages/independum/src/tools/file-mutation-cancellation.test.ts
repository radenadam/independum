import { readFileSync } from "node:fs";
import { withFileMutationQueue } from "@earendil-works/pi-coding-agent";
import { expect, test } from "vitest";
import { createModelTexts } from "../model-texts.ts";
import { createEditTool } from "./create-edit-tool.ts";
import { createTestChat } from "./create-test-chat.ts";
import { createWriteTool } from "./create-write-tool.ts";

const chat = createTestChat("cancelled-mutations");
const texts = createModelTexts(() => ({}));
const tools = [createWriteTool(texts), createEditTool(texts)].map((tool) => ({
  name: tool.name.toLowerCase(),
  tool,
}));

test.each(tools)("a queued $name call leaves the file unchanged after stop", async ({ tool }) => {
  const path = chat.place(`${tool.name}.txt`, "before\n");
  await chat.read({ path });
  const blocked = Promise.withResolvers<void>();
  const holding = withFileMutationQueue(path, () => blocked.promise);
  const controller = new AbortController();
  const result = chat.run(
    tool,
    // biome-ignore lint/style/useNamingConvention: These are the names of the parameters of Edit.
    { path, content: "after\n", old_string: "before", new_string: "after" },
    undefined,
    controller.signal,
  );
  controller.abort();
  blocked.resolve();
  await holding;
  expect(await result).toMatchObject({ isError: true });
  expect(readFileSync(path, "utf8")).toBe("before\n");
});
