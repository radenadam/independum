import { createHash, randomUUID } from "node:crypto";
import { once } from "node:events";
import { mkdir, rename, writeFile } from "node:fs/promises";
import type { AddressInfo } from "node:net";
import { createServer } from "node:net";
import { join } from "node:path";
import { fauxAssistantMessage, fauxProvider } from "@earendil-works/pi-ai";
import { SessionManager } from "@earendil-works/pi-coding-agent";
import type { ProfileDocument, ProfileReference } from "../api-types.ts";
import { createAttachments } from "../create-attachments.ts";
import { createProfileStore } from "../create-profile-store.ts";
import { createModelTexts } from "../model-texts.ts";
import { builtInPermissions, serializePermissionPath } from "../permission-policy.ts";
import { privateRuntime, writePrivateRuntimeFile } from "../private-runtime.ts";
import { builtInAttachments } from "../read-attachment-settings.ts";

export type PreviewFixture =
  | "empty"
  | "chats"
  | "compacted"
  | "hooks"
  | "user-profile"
  | "legacy-state"
  | "long-history";

/** Creates saved chats through Pi in a new preview home. */
export async function createPreviewFixture(home: string, fixture: PreviewFixture): Promise<string> {
  const project = join(home, "project");
  const sessions = join(home, ".independum", "sessions");
  await mkdir(project, { recursive: true });
  await mkdir(sessions, { recursive: true });
  if (fixture === "empty") {
    return project;
  }
  if (fixture === "chats" || fixture === "hooks" || fixture === "user-profile") {
    if (fixture === "hooks") {
      await selectProfile(
        home,
        project,
        { scope: "project", id: "hooks" },
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
        {
          "observe.ts":
            'for await (const chunk of process.stdin) { void chunk; }\nprocess.stdout.write(JSON.stringify({ apiVersion: 1, action: "continue" }));\n',
        },
      );
    }
    if (fixture === "user-profile") {
      const state = join(home, ".independum");
      await mkdir(join(state, "notes"));
      // The script names the folder that it runs in, so its saved standard error shows that it
      // runs from the profile folder in the state. It waits two seconds before it answers, so the
      // running hook stays in view long enough for a person, and a scenario, to see it.
      await selectProfile(
        home,
        project,
        { scope: "user", id: "user-workflows" },
        {
          formatVersion: 1,
          name: "User workflows",
          settings: {
            permissions: {
              ...builtInPermissions,
              rules: [
                {
                  id: "stateNotes",
                  effect: "allow",
                  project: "*",
                  resource: {
                    kind: "path",
                    path: serializePermissionPath(join(state, "notes")),
                    scope: "tree",
                    access: "write",
                  },
                },
              ],
            },
            hooks: [
              {
                id: "observeShell",
                event: "tool_call",
                mode: "observe",
                match: { toolNames: ["Shell"] },
                run: {
                  command: [process.execPath, "observe-shell.ts"],
                  workingDirectory: "source",
                },
              },
            ],
          },
        },
        {
          "observe-shell.ts":
            'let input = "";\nfor await (const chunk of process.stdin) {\n  input += chunk;\n}\nconst event = JSON.parse(input);\nprocess.stderr.write("observeShell saw a " + event.data.toolName + " call from this folder:\\n" + process.cwd() + "\\n");\nsetTimeout(() => process.stdout.write(JSON.stringify({ apiVersion: 1, action: "continue" })), 2000);\n',
        },
      );
    }
    const skills = join(project, ".agents", "skills", "review");
    const commands = join(project, ".independum", "commands");
    await mkdir(skills, { recursive: true });
    await mkdir(commands, { recursive: true });
    // A new file directly in the project folder needs approval, because that folder holds project
    // settings, so the stand-in model writes its notes into this folder instead.
    await mkdir(join(project, "notes"));
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
  if (fixture === "legacy-state") {
    await createLegacyState(home, manager);
    return project;
  }
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

// Before decision 0080, logins sat at the top of the state folder, the server connection and phone
// pairings sat in runtime, and attachments sat in a folder beside the state folder. Every secret
// here is a placeholder. The saved chat holds a file attachment from that former store, so its
// message gives the model a path inside it.
async function createLegacyState(home: string, manager: SessionManager): Promise<void> {
  const state = join(home, ".independum");
  // The record names a port where no server listens, so startup finds it stale and removes it.
  const reservation = createServer().listen(0, "127.0.0.1");
  await once(reservation, "listening");
  const { port } = reservation.address() as AddressInfo;
  reservation.close();
  // The private folder gets the account-only permissions that runtime had, then its former name.
  const runtime = privateRuntime(state);
  writePrivateRuntimeFile(
    join(runtime, "server.json"),
    JSON.stringify({
      version: 1,
      serverId: randomUUID(),
      pid: process.pid,
      url: `http://127.0.0.1:${port}`,
      accessToken: "placeholder-".repeat(4),
    }),
  );
  writePrivateRuntimeFile(
    join(runtime, "phones.json"),
    JSON.stringify([
      {
        id: randomUUID(),
        name: "Legacy phone",
        pairedAt: 1000,
        lastSeenAt: 1000,
        credentialHash: createHash("sha256").update("placeholder phone credential").digest("hex"),
      },
    ]),
  );
  await rename(runtime, join(state, "runtime"));
  await writeFile(join(state, "auth.json"), "{}\n");
  await writeFile(join(state, "models.json"), `${JSON.stringify({ providers: {} })}\n`);
  const chatId = manager.getSessionId();
  const attachments = createAttachments(join(home, ".independum-attachments"));
  const text = "Summarize the saved notes.";
  const attachment = await attachments.upload(
    chatId,
    "legacy-notes.txt",
    "text/plain",
    new Response("Legacy note one.\nLegacy note two.\n").body,
    builtInAttachments.maxFileBytes,
  );
  const prepared = await attachments.prepare(
    text,
    [attachment.id],
    [attachment.id],
    chatId,
    builtInAttachments,
    createModelTexts(() => ({})),
    fauxProvider().getModel(),
  );
  manager.appendCustomEntry("independum-input", {
    version: 1,
    inputId: randomUUID(),
    delivery: "queue",
    isSteered: false,
    text,
    attachmentIds: [attachment.id],
    fileAttachmentIds: [attachment.id],
    attachments: [attachment],
    attachmentPositions: prepared.positions,
    receivesImages: false,
  });
  appendTurn(manager, prepared.text, "The saved notes list two legacy items.", 300);
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

// The project default selects the profile, so the saved chats of the project use it as well.
/** Saves a profile and its scripts in the folder of its scope and makes it the project default. */
async function selectProfile(
  home: string,
  project: string,
  reference: ProfileReference,
  profile: ProfileDocument,
  scripts: Record<string, string>,
): Promise<void> {
  const folder = join(
    reference.scope === "user" ? home : project,
    ".independum",
    "profiles",
    reference.id,
  );
  await mkdir(folder, { recursive: true });
  for (const [name, content] of Object.entries(scripts)) {
    await writeFile(join(folder, name), content);
  }
  await writeFile(join(folder, "profile.json"), JSON.stringify(profile, null, 2));
  await mkdir(join(project, ".independum"), { recursive: true });
  await writeFile(
    join(project, ".independum", "settings.json"),
    JSON.stringify({ formatVersion: 1, profile: reference }, null, 2),
  );
  const profiles = await createProfileStore(join(home, ".independum"), [project], []);
  profiles.close();
}
