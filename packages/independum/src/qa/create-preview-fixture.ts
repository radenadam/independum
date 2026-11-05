import { mkdir, writeFile } from "node:fs/promises";
import { join } from "node:path";
import { fauxAssistantMessage } from "@earendil-works/pi-ai";
import { SessionManager } from "@earendil-works/pi-coding-agent";

export type PreviewFixture = "empty" | "chats" | "compacted";

/** Creates saved chats through Pi in a new preview home. */
export async function createPreviewFixture(home: string, fixture: PreviewFixture): Promise<string> {
  const project = join(home, "project");
  const sessions = join(home, ".independum", "sessions");
  await mkdir(project, { recursive: true });
  await mkdir(sessions, { recursive: true });
  if (fixture === "empty") {
    return project;
  }
  if (fixture === "chats") {
    const skills = join(project, ".agents", "skills", "review");
    const commands = join(project, ".independum", "commands");
    await mkdir(skills, { recursive: true });
    await mkdir(commands, { recursive: true });
    await writeFile(join(project, "AGENTS.md"), "Preview project facts.\n");
    await writeFile(join(project, "CLAUDE.md"), "Preview project facts.\n");
    await writeFile(
      join(skills, "SKILL.md"),
      "---\nname: review\ndescription: Review preview data.\n---\n\nReview the supplied data.\n",
    );
    await writeFile(
      join(commands, "review.md"),
      "---\ndescription: Review the supplied change.\nargument-hint: <change>\n---\nReview $1.\n",
    );
    for (const [question, answer] of [
      ["Plan the first post.", "Explain why the site exists in a few short paragraphs."],
      ["Check the phone layout.", "Start with the widest item at 360 pixels."],
      ["Explain how Pi saves a chat.", "Pi saves messages and settings in a session file."],
    ] as const) {
      const manager = createSession();
      appendTurn(manager, question, answer, 300);
    }
    return project;
  }
  const manager = createSession();
  const ids: string[] = [];
  let tokens = 2000;
  for (const step of [1, 2, 3, 4, 5, 6]) {
    tokens += 9000;
    ids.push(
      appendTurn(
        manager,
        `Step ${step} of the plan, please.`,
        `Step ${step} is done. ${"The work went on. ".repeat(40)}`,
        tokens,
      ),
    );
  }
  const firstKept = ids[4];
  if (firstKept === undefined) {
    throw new Error("The compaction has no retained message.");
  }
  manager.appendCompaction(
    "## Goal\nShip the plan in six steps.\n\n## Progress\n- Steps 1 to 4 are done.\n\n## Next steps\n- Finish steps 5 and 6.",
    firstKept,
    tokens + 900,
  );
  manager.appendThinkingLevelChange("high");
  appendTurn(manager, "Now step 7.", "Step 7 is done.", 10500);
  appendTurn(manager, "And step 8.", "Step 8 is done, and the plan is finished.", 11700);
  return project;

  function createSession(): SessionManager {
    const manager = SessionManager.create(project, sessions);
    manager.appendModelChange("faux", "faux-typing");
    manager.appendThinkingLevelChange("medium");
    return manager;
  }
}

function appendTurn(
  manager: SessionManager,
  question: string,
  answer: string,
  tokens: number,
): string {
  const timestamp = Date.now();
  const id = manager.appendMessage({ role: "user", content: question, timestamp });
  const message = fauxAssistantMessage(answer, { timestamp });
  message.model = "faux-typing";
  message.usage = {
    input: 40,
    output: 300,
    cacheRead: tokens,
    cacheWrite: 600,
    totalTokens: tokens + 940,
    cost: { input: 0, output: 0, cacheRead: 0, cacheWrite: 0, total: 0.002 },
  };
  manager.appendMessage(message);
  return id;
}
