import { execFileSync } from "node:child_process";
import { mkdir, mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, expect, test, vi } from "vitest";
import { checkGateReceipt } from "./check-gate-receipt.ts";
import {
  type GateResult,
  type GateTask,
  gateTaskFingerprint,
  readGateReceipt,
} from "./gate-contract.ts";
import { readPushRevision } from "./read-push-revision.ts";
import { readRevision } from "./read-revision.ts";

vi.mock("node:child_process", () => ({ execFileSync: vi.fn() }));

const head = "a".repeat(40);
const remoteHead = "b".repeat(40);
const intermediate = "c".repeat(40);
const targetHead = "d".repeat(40);
const zero = "0".repeat(40);
const directories: string[] = [];

afterEach(async () => {
  await Promise.all(
    directories.splice(0).map((directory) => rm(directory, { recursive: true, force: true })),
  );
  vi.mocked(execFileSync).mockReset();
});

test("push revisions use the remote tip supplied by git rather than a cached comparison", async () => {
  const folder = await preparePush();
  const revision = readPushRevision(folder, pushFor(), "origin");
  expect(revision).toEqual(readRevision(folder, remoteHead));
  expect(execFileSync).not.toHaveBeenCalledWith(
    "git",
    expect.arrayContaining(["ls-remote"]),
    expect.anything(),
  );
});

test.each([head, intermediate])(
  "pre-push rejects a complete local receipt based on %s",
  async (base) => {
    const folder = await preparePush();
    await prepareReceipt(folder, base);
    expect(() => checkGateReceipt(folder, pushFor(), "push-destination")).toThrow("invalidate");
  },
);

test("pre-push accepts complete matching evidence for existing and new branches", async () => {
  const folder = await preparePush();
  await prepareReceipt(folder, remoteHead);
  expect(() => checkGateReceipt(folder, pushFor(), "push-destination")).not.toThrow();
  expect(() => checkGateReceipt(folder, pushFor(head, zero), "push-destination")).not.toThrow();
  expect(execFileSync).toHaveBeenCalledWith(
    "git",
    ["ls-remote", "--symref", "--exit-code", "--", "push-destination", "HEAD"],
    expect.anything(),
  );
});

test.each([head, intermediate])("push validation rejects a receipt based on %s", async (base) => {
  const folder = await preparePush();
  const reviewed = readRevision(folder, base);
  const receipt = { verdict: "pass", checks: "pass", roles: [{}, {}], revision: reviewed };
  expect(() =>
    readGateReceipt(receipt, {} as never, readPushRevision(folder, pushFor(), "origin"), pushFor()),
  ).toThrow("invalidate");
});

test("new branch pushes use the merge base with the remote default target", async () => {
  const folder = await preparePush();
  expect(readPushRevision(folder, pushFor(head, zero), "origin").base).toBe(remoteHead);
  expect(execFileSync).toHaveBeenCalledWith(
    "git",
    ["merge-base", "--all", head, targetHead],
    expect.anything(),
  );
  expect(execFileSync).toHaveBeenCalledWith(
    "git",
    ["ls-remote", "--symref", "--exit-code", "--", "origin", "HEAD"],
    expect.anything(),
  );
  for (const base of [head, intermediate]) {
    const reviewed = readRevision(folder, base);
    expect(() =>
      readGateReceipt(
        { verdict: "pass", checks: "pass", roles: [{}, {}], revision: reviewed },
        {} as never,
        readPushRevision(folder, pushFor(head, zero), "origin"),
        pushFor(head, zero),
      ),
    ).toThrow("invalidate");
  }
});

test("new branch pushes fail without a known target and a unique available merge base", async () => {
  for (const options of [
    { advertisement: "" },
    { advertisement: `${targetHead}\tHEAD` },
    { advertisement: "ref: refs/heads/main\tHEAD" },
    { advertisement: `ref: refs/heads/main\tHEAD\n${targetHead}\tHEAD\n${head}\tHEAD` },
    { hasMissingTarget: true },
    { mergeBase: "" },
    { mergeBase: `${remoteHead}\n${intermediate}` },
  ]) {
    const folder = await preparePush(options);
    expect(() => readPushRevision(folder, pushFor(head, zero), "origin")).toThrow();
  }
  const folder = await preparePush();
  expect(() => readPushRevision(folder, pushFor(head, zero), undefined)).toThrow(
    "push destination",
  );
});

test("push revisions reject malformed deletion tag and uncovered multiple updates", async () => {
  const folder = await preparePush();
  for (const input of [
    "",
    `HEAD ${head}`,
    `${pushFor()} extra`,
    `HEAD ${zero} refs/heads/work ${remoteHead}`,
    `HEAD ${head} refs/tags/work ${remoteHead}`,
    `HEAD ${head} refs/heads/ ${remoteHead}`,
    pushFor(intermediate),
    pushFor(head, "missing"),
    `${pushFor()}\n${pushFor(intermediate)}`,
    `${pushFor()}\n${pushFor(head, intermediate)}`,
    `${pushFor()}\n\n${pushFor()}`,
  ]) {
    expect(() => readPushRevision(folder, input, "origin")).toThrow();
  }
  expect(readPushRevision(folder, `${pushFor()}\r\n${pushFor()}\r\n`, "origin").head).toBe(head);
});

test("push revisions require every remote commit and committed blob to be available", async () => {
  for (const options of [{ hasMissingCommit: true }, { hasMissingBlob: true }]) {
    const folder = await preparePush(options);
    expect(() => readPushRevision(folder, pushFor(), "origin")).toThrow();
  }
});

test.each(["source.ts", "context.md", "untracked.ts"])(
  "push revisions reject reviewed worktree contents absent from the pushed tree in %s",
  async (file) => {
    const folder = await preparePush();
    await writeFile(join(folder, file), "Changed after the commit.\n");
    expect(() => readPushRevision(folder, pushFor(), "origin")).toThrow("source and context");
  },
);

async function prepareReceipt(folder: string, base: string): Promise<void> {
  const directory = join(folder, "node_modules", ".cache", "independum-gate");
  await mkdir(directory, { recursive: true });
  const evidence = join(folder, "context.md");
  const task: GateTask = {
    outcome: "Review every outgoing change.",
    base,
    requirements: ["CP-25"],
    acceptance: [{ id: "A1", behavior: "The receipt covers the push." }],
    preservedBehavior: "Fail closed.",
    exclusions: "Product changes.",
    reading: [evidence],
    writableFiles: [],
    sharedFiles: [],
    capabilities: ["Read-only fixture Git."],
    verificationOwner: "Fixture",
    questionRound: "No new decision is needed.",
    isVisible: false,
    scenarios: [],
    learning: [],
  };
  const revision = readRevision(folder, base);
  const roles: GateResult[] = ["review", "qa"].map((role) => ({
    role: role as GateResult["role"],
    revision,
    verdict: "pass",
    taskFingerprint: gateTaskFingerprint(task),
    engine: "codex",
    model: "fixture-model",
    platform: "fixture",
    browser: "Not required for this fixture.",
    commands: ["Inspect source."],
    coverage: [
      { acceptanceId: "A1", observation: "Observed.", evidence: [evidence], isVerified: true },
    ],
    findings: [],
    missingChecks: [],
  }));
  const receiptPath = join(directory, "receipt.json");
  await writeFile(join(directory, "latest.json"), JSON.stringify({ receiptPath }));
  await writeFile(join(directory, "task.json"), JSON.stringify(task));
  await writeFile(
    receiptPath,
    JSON.stringify({ revision, verdict: "pass", checks: "pass", roles, browserChecks: [] }),
  );
}

test("push revisions reject missing tracked files and uncommitted mode changes", async () => {
  const folder = await preparePush();
  await rm(join(folder, "source.ts"));
  expect(() => readPushRevision(folder, pushFor(), "origin")).toThrow("source and context");
  const changedMode = await preparePush({ hasModeChange: true });
  expect(() => readPushRevision(changedMode, pushFor(), "origin")).toThrow();
});

test.each(["auth.json", "models.json", ".env", ".env.local"])(
  "committed fingerprints reject credential path %s before requesting its contents",
  async (file) => {
    const folder = await preparePush({ extraCommittedFile: file });
    expect(() => readRevision(folder, remoteHead, "commit")).toThrow("Credential files");
    expect(execFileSync).not.toHaveBeenCalledWith(
      "git",
      ["cat-file", "--batch"],
      expect.anything(),
    );
  },
);

async function preparePush(
  options: {
    advertisement?: string;
    hasMissingTarget?: boolean;
    mergeBase?: string;
    hasMissingCommit?: boolean;
    hasMissingBlob?: boolean;
    hasModeChange?: boolean;
    extraCommittedFile?: string;
  } = {},
): Promise<string> {
  const folder = await mkdtemp(join(tmpdir(), "independum-push-test-"));
  directories.push(folder);
  const committed: Record<string, string> = {
    "source.ts": "export const value = 1;\n",
    "context.md": "# Context\n\nAgreed behavior.\n",
  };
  for (const [file, content] of Object.entries(committed)) {
    await writeFile(join(folder, file), content);
  }
  vi.mocked(execFileSync).mockImplementation((executable, arguments_, commandOptions) => {
    expect(executable).toBe("git");
    const argumentsList = arguments_ as string[];
    const [command] = argumentsList;
    if (command === "rev-parse") {
      if (options.hasMissingCommit && argumentsList.includes(`${remoteHead}^{commit}`)) {
        throw new Error("The remote commit is unavailable.");
      }
      return argumentsList.includes("--verify")
        ? ((argumentsList[2] ?? "").split("^")[0] ?? "")
        : head;
    }
    if (command === "ls-remote") {
      if (options.hasMissingTarget) {
        throw new Error("The remote default target is unavailable.");
      }
      return options.advertisement ?? `ref: refs/heads/main\tHEAD\n${targetHead}\tHEAD`;
    }
    if (command === "merge-base") {
      return options.mergeBase ?? remoteHead;
    }
    if (command === "ls-files") {
      return [...Object.keys(committed), "untracked.ts"].join("\0");
    }
    if (command === "ls-tree") {
      return [
        ...Object.keys(committed),
        ...(options.extraCommittedFile ? [options.extraCommittedFile] : []),
      ].join("\0");
    }
    if (command === "cat-file") {
      if (options.hasMissingBlob) {
        return Buffer.from(`${head}:source.ts missing\n`);
      }
      const input = String((commandOptions as { input: string }).input);
      const contents: Buffer[] = [];
      for (const request of input.trim().split("\n")) {
        const content = Buffer.from(committed[request.slice(head.length + 1)] ?? "");
        contents.push(
          Buffer.from(`${intermediate} blob ${content.length}\n`),
          content,
          Buffer.from("\n"),
        );
      }
      return Buffer.concat(contents);
    }
    if (command === "diff" && !options.hasModeChange) {
      return "";
    }
    throw new Error("The Git command cannot establish the pushed revision.");
  });
  return folder;
}

function pushFor(commit = head, previous = remoteHead): string {
  return `refs/heads/work ${commit} refs/heads/work ${previous}`;
}
