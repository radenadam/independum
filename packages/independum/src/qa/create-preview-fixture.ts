import { mkdir, writeFile } from "node:fs/promises";
import { join } from "node:path";
import { fauxAssistantMessage } from "@earendil-works/pi-ai";
import { SessionManager } from "@earendil-works/pi-coding-agent";
import { createProfileStore } from "../create-profile-store.ts";

export type PreviewFixture = "empty" | "chats" | "compacted" | "hooks" | "long-history";

/** Creates saved chats through Pi in a new preview home. */
export async function createPreviewFixture(home: string, fixture: PreviewFixture): Promise<string> {
  const project = join(home, "project");
  const sessions = join(home, ".independum", "sessions");
  await mkdir(project, { recursive: true });
  await mkdir(sessions, { recursive: true });
  if (fixture === "empty") {
    return project;
  }
  if (fixture === "chats" || fixture === "hooks") {
    if (fixture === "hooks") {
      const profileFolder = join(project, ".independum", "profiles", "hooks");
      await mkdir(profileFolder, { recursive: true });
      await writeFile(
        join(profileFolder, "observe.ts"),
        'for await (const chunk of process.stdin) { void chunk; }\nprocess.stdout.write(JSON.stringify({ apiVersion: 1, action: "continue" }));\n',
      );
      await writeFile(
        join(profileFolder, "profile.json"),
        JSON.stringify(
          {
            formatVersion: 1,
            name: "Hook workflows",
            settings: {
              hooks: [
                {
                  id: "observeRequest",
                  event: "before_provider_request",
                  mode: "observe",
                  run: { command: [process.execPath, "observe.ts"], workingDirectory: "source" },
                },
                {
                  id: "guardCommands",
                  event: "tool_call",
                  mode: "transform",
                  match: { toolNames: ["Shell"] },
                  run: { command: [process.execPath, "observe.ts"], workingDirectory: "source" },
                  texts: {
                    blocked: {
                      label: "When the workflow blocks a command",
                      builtIn: "The workflow blocks this command.",
                      slots: {},
                    },
                  },
                },
              ],
            },
          },
          null,
          2,
        ),
      );
      await writeFile(
        join(project, ".independum", "settings.json"),
        JSON.stringify({ formatVersion: 1, profile: { scope: "project", id: "hooks" } }, null, 2),
      );
      const profiles = await createProfileStore(join(home, ".independum"), [project], []);
      profiles.close();
    }
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
  if (fixture === "long-history") {
    const turns: string[] = [];
    for (let request = 1; request <= 240; request += 1) {
      turns.push(
        appendTurn(
          manager,
          `History request ${request}.`,
          `Reply ${request}. ${"The saved work remains available for inspection. ".repeat(8)}`,
          2000 + (request % 50) * 900,
        ),
      );
      if (request % 50 === 0 && request <= 200) {
        const firstKept = turns[request - 5];
        if (firstKept === undefined) {
          throw new Error("The long history has no retained message.");
        }
        manager.appendCompaction(
          `History summary ${request / 50}. Requests 1 to ${request - 5} are summarized. Continue from request ${request - 4}.`,
          firstKept,
          48000,
        );
        manager.appendThinkingLevelChange(request % 100 === 0 ? "high" : "medium");
      }
    }
    return project;
  }
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
