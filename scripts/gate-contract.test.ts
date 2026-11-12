import { mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { expect, test } from "vitest";
import {
  type GateResult,
  type GateTask,
  gateTaskFingerprint,
  readGateReceipt,
  readGateResult,
  readGateTask,
} from "./gate-contract.ts";

const revision = {
  head: "head",
  base: "base",
  fingerprint: "source",
  contextFingerprint: "context",
};

test("gate tasks require the question round and dated learning protection", async () => {
  await withEvidence((path) => {
    const task = taskFor(path);
    expect(readGateTask(task, tmpdir())).toEqual(task);
    expect(() => readGateTask({ ...task, questionRound: "" }, tmpdir())).toThrow();
    expect(() =>
      readGateTask({ ...task, learning: [{ speaker: "maintainer" }] }, tmpdir()),
    ).toThrow();
    expect(() => readGateTask({ ...task, requirements: ["CP-99"] }, tmpdir())).toThrow();
  });
});

test("gate results reject missing coverage stale evidence and incomplete passes", async () => {
  await withEvidence((path) => {
    const task = taskFor(path);
    const result = resultFor(path);
    expect(readGateResult(result, task, "review", revision)).toEqual(result);
    for (const invalid of [
      { ...result, coverage: [] },
      { ...result, revision: { ...revision, fingerprint: "stale" } },
      { ...result, missingChecks: ["No browser."] },
      { ...result, coverage: [{ ...result.coverage[0], evidence: [] }] },
      { ...result, coverage: [{ ...result.coverage[0], evidence: [join(path, "absent")] }] },
      { ...result, unknown: true },
      { ...result, taskFingerprint: "stale acceptance" },
    ]) {
      expect(() => readGateResult(invalid, task, "review", revision)).toThrow();
    }
    expect(
      readGateResult(
        { ...result, verdict: "incomplete", coverage: [], missingChecks: ["Unavailable."] },
        task,
        "review",
        revision,
      ).verdict,
    ).toBe("incomplete");
    expect(() =>
      readGateResult(
        {
          ...result,
          role: "qa",
          taskFingerprint: gateTaskFingerprint({ ...task, isVisible: true }),
        },
        { ...task, isVisible: true },
        "qa",
        revision,
      ),
    ).toThrow("Visible QA needs screenshots");
  });
});

test("push receipts require both roles and the actual outgoing commit", async () => {
  await withEvidence((path) => {
    const task = taskFor(path);
    const receipt = {
      revision,
      verdict: "pass",
      checks: "pass",
      roles: [resultFor(path), { ...resultFor(path), role: "qa" }],
    };
    expect(() =>
      readGateReceipt(receipt, task, revision, "refs/heads/work head refs/heads/work previous"),
    ).not.toThrow();
    expect(() =>
      readGateReceipt(receipt, task, revision, "refs/heads/work another refs/heads/work previous"),
    ).toThrow("outgoing commit");
    expect(() =>
      readGateReceipt(
        { ...receipt, roles: [resultFor(path)] },
        task,
        revision,
        "refs/heads/work head refs/heads/work previous",
      ),
    ).toThrow("combined local gate");
    expect(() =>
      readGateReceipt(
        receipt,
        task,
        { ...revision, contextFingerprint: "changed" },
        "refs/heads/work head refs/heads/work previous",
      ),
    ).toThrow("invalidate");
  });
});

function taskFor(path: string): GateTask {
  return {
    outcome: "Preserve agreed behavior.",
    base: "main",
    requirements: ["CP-01"],
    acceptance: [{ id: "A1", behavior: "Observed behavior agrees." }],
    preservedBehavior: "Existing behavior.",
    exclusions: "Product changes.",
    reading: [path],
    writableFiles: [path],
    sharedFiles: [],
    capabilities: ["Read."],
    verificationOwner: "Coordinator",
    questionRound: "No new decision is needed.",
    isVisible: false,
    scenarios: [],
    learning: [],
  };
}

function resultFor(path: string): GateResult {
  return {
    role: "review",
    verdict: "pass",
    revision,
    taskFingerprint: gateTaskFingerprint(taskFor(path)),
    model: "fixture",
    platform: "fixture",
    browser: "Not required for review.",
    commands: ["Read source."],
    coverage: [
      { acceptanceId: "A1", observation: "Observed.", evidence: [path], isVerified: true },
    ],
    findings: [],
    missingChecks: [],
  };
}

async function withEvidence(run: (path: string) => void): Promise<void> {
  const directory = await mkdtemp(join(tmpdir(), "independum-gate-test-"));
  try {
    const path = join(directory, "evidence.txt");
    await writeFile(path, "Observed evidence.");
    run(path);
  } finally {
    await rm(directory, { recursive: true, force: true });
  }
}
