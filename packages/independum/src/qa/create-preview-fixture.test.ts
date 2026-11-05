import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { SessionManager } from "@earendil-works/pi-coding-agent";
import { expect, test } from "vitest";
import { createPreviewFixture } from "./create-preview-fixture.ts";

test("fixtures keep an empty home empty and save three short chats through pi", async () => {
  const home = await mkdtemp(join(tmpdir(), "independum-fixture-test-"));
  const sessions = join(home, ".independum", "sessions");
  try {
    const project = await createPreviewFixture(home, "empty");
    expect(await SessionManager.list(project, sessions)).toHaveLength(0);
    await createPreviewFixture(home, "chats");
    expect(await SessionManager.list(project, sessions)).toHaveLength(3);
  } finally {
    await rm(home, { recursive: true, force: true });
  }
});

test("compacted fixture retains recent turns and summarizes older turns through pi", async () => {
  const home = await mkdtemp(join(tmpdir(), "independum-compaction-test-"));
  const sessions = join(home, ".independum", "sessions");
  try {
    const project = await createPreviewFixture(home, "compacted");
    const [saved] = await SessionManager.list(project, sessions);
    expect(saved).toBeDefined();
    if (saved === undefined) {
      throw new Error("The compacted chat is missing.");
    }
    const manager = SessionManager.open(saved.path, sessions);
    expect(manager.getEntries().filter((entry) => entry.type === "compaction")).toHaveLength(1);
    const context = manager.buildSessionContext();
    const users = context.messages
      .filter((message) => message.role === "user")
      .map((message) => message.content);
    expect(users).toEqual([
      "Step 5 of the plan, please.",
      "Step 6 of the plan, please.",
      "Now step 7.",
      "And step 8.",
    ]);
    expect(context.thinkingLevel).toBe("high");
    expect(JSON.stringify(context.messages)).toContain("Ship the plan in six steps.");
  } finally {
    await rm(home, { recursive: true, force: true });
  }
});
