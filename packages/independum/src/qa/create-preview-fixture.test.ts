import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { SessionManager } from "@earendil-works/pi-coding-agent";
import { expect, test } from "vitest";
import { listRequests } from "../list-requests.ts";
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

test("long history preserves hundreds of requests and four compaction boundaries through pi", async () => {
  const home = await mkdtemp(join(tmpdir(), "independum-long-history-test-"));
  const sessions = join(home, ".independum", "sessions");
  try {
    const project = await createPreviewFixture(home, "long-history");
    const [saved] = await SessionManager.list(project, sessions);
    if (saved === undefined) {
      throw new Error("The long history chat is missing.");
    }
    const manager = SessionManager.open(saved.path, sessions);
    const { requests } = listRequests(manager.getBranch());
    expect(requests).toHaveLength(240);
    expect(requests.filter((request) => request.isSummarized)).toHaveLength(195);
    expect(
      requests
        .flatMap((request) => request.changes)
        .filter((change) => change.kind === "compaction"),
    ).toMatchObject([45, 95, 145, 195].map((summarizedRequests) => ({ summarizedRequests })));
    const context = manager.buildSessionContext();
    const users = context.messages.filter((message) => message.role === "user");
    expect(users).toHaveLength(45);
    expect(users[0]?.content).toBe("History request 196.");
    expect(users.at(-1)?.content).toBe("History request 240.");
    expect(JSON.stringify(context.messages)).toContain("History summary 4.");
  } finally {
    await rm(home, { recursive: true, force: true });
  }
});
