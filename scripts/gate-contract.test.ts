import { mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { expect, test } from "vitest";
import { createTestBrowserReport } from "./create-test-browser-report.ts";
import {
  type GateResult,
  type GateTask,
  gateTaskFingerprint,
  readGateReceipt,
  readGateResult,
  readGateTask,
} from "./gate-contract.ts";
import { browserRegressionTests } from "./read-gate-browser-checks.ts";

const revision = {
  head: "a".repeat(40),
  base: "b".repeat(40),
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
    const receipt = receiptFor(path);
    expect(() => readGateReceipt(receipt, task, revision, pushFor())).not.toThrow();
    expect(() =>
      readGateReceipt({ ...receipt, browserRegressions: undefined }, task, revision, pushFor()),
    ).toThrow("Real-browser regressions");
    expect(() =>
      readGateReceipt({ ...receipt, testAvailability: undefined }, task, revision, pushFor()),
    ).toThrow("availability report");
    expect(() =>
      readGateReceipt(
        {
          ...receipt,
          testAvailability: [
            { file: path, name: "command execution", status: "unavailable", reason: "No shell." },
          ],
        },
        task,
        revision,
        pushFor(),
      ),
    ).toThrow("unavailable tests");
    expect(() => readGateReceipt(receipt, task, revision, pushFor("c".repeat(40)))).toThrow(
      "outgoing commit",
    );
    expect(() =>
      readGateReceipt({ ...receipt, roles: [resultFor(path)] }, task, revision, pushFor()),
    ).toThrow("combined local gate");
    expect(() =>
      readGateReceipt(receipt, task, { ...revision, contextFingerprint: "changed" }, pushFor()),
    ).toThrow("invalidate");
  });
});

test("passing receipts reject either nonpassing role even without coverage", async () => {
  await withEvidence((path) => {
    const roles = [resultFor(path), { ...resultFor(path), role: "qa" }];
    for (const index of [0, 1]) {
      for (const verdict of ["fail", "incomplete"]) {
        for (const coverage of [roles[index]?.coverage, []]) {
          const receipt = {
            revision,
            verdict: "pass",
            checks: "pass",
            testAvailability: [],
            browserChecks: [],
            roles: roles.map((role, position) =>
              position === index ? { ...role, verdict, coverage } : role,
            ),
          };
          expect(() => readGateReceipt(receipt, taskFor(path), revision, pushFor())).toThrow(
            "Every role must pass",
          );
        }
      }
    }
  });
});

test("receipts reject required skips except exact windows platform coverage and replaced browser tests", async () => {
  await withEvidence((path) => {
    const task = taskFor(path);
    const receipt = receiptFor(path);
    const native = {
      file: "packages/independum/src/create-sandbox.test.ts",
      name: "native sandbox runs a node script by path",
      status: "skipped",
      reason: "Native containment is unavailable.",
    };
    const unix = {
      ...native,
      file: "packages/independum/src/private-runtime.test.ts",
      name: "unix discovery rejects broad permissions and another owner",
      reason: "Unix ownership and permission checks are unavailable on Windows.",
      ciPlatforms: ["linux", "darwin"],
    };
    const signal = {
      ...unix,
      file: "packages/independum/src/tools/run-command.test.ts",
      name: "a command that a signal ends says which signal",
    };
    const browser = browserRegressionTests.map((test) => ({
      ...test,
      status: "skipped",
      reason: "The gate runs this browser regression separately.",
    }));
    expect(() =>
      readGateReceipt(
        { ...receipt, testAvailability: [unix, signal, ...browser] },
        task,
        revision,
        pushFor(),
      ),
    ).not.toThrow();
    for (const test of [
      native,
      { ...native, ciPlatforms: ["linux", "darwin"] },
      { ...unix, ciPlatforms: undefined },
      { ...unix, ciPlatforms: ["linux"] },
      { ...unix, ciPlatforms: ["darwin"] },
      { ...unix, ciPlatforms: ["linux", "darwin", "win32"] },
      { ...unix, file: "unrelated.test.ts" },
      { ...unix, name: "unrelated test" },
      { ...browser[0], file: "unrelated.test.ts" },
      { ...browser[0], status: "unavailable" },
    ]) {
      expect(() =>
        readGateReceipt({ ...receipt, testAvailability: [test] }, task, revision, pushFor()),
      ).toThrow();
    }
    for (const platform of [undefined, "linux x64", "darwin arm64", "unknown"]) {
      expect(() =>
        readGateReceipt(
          { ...receipt, platform, testAvailability: [unix] },
          task,
          revision,
          pushFor(),
        ),
      ).toThrow();
    }
  });
});

test.each([revision.head, "c".repeat(40)])(
  "push receipts reject a reviewed base of %s that omits outgoing commits",
  async (base) => {
    await withEvidence((path) => {
      const reviewed = { ...revision, base };
      const receipt = {
        revision: reviewed,
        verdict: "pass",
        checks: "pass",
        testAvailability: [],
        browserChecks: [],
        browserRegressions: { ...regressionsFor(path), revision: reviewed },
        roles: [
          { ...resultFor(path), revision: reviewed },
          { ...resultFor(path), revision: reviewed, role: "qa" },
        ],
      };
      expect(() => readGateReceipt(receipt, taskFor(path), reviewed, pushFor())).toThrow(
        "remote commit replaced",
      );
    });
  },
);

function pushFor(head = revision.head): string {
  return `refs/heads/work ${head} refs/heads/work ${revision.base}`;
}

function receiptFor(path: string): object {
  return {
    revision,
    platform: "win32 x64",
    verdict: "pass",
    checks: "pass",
    testAvailability: [],
    browserChecks: [],
    browserRegressions: regressionsFor(path),
    roles: [resultFor(path), { ...resultFor(path), role: "qa" }],
  };
}

function regressionsFor(path: string): object {
  return {
    revision,
    browser: "msedge",
    command: ["exec", "vitest", "run", ...browserRegressionTests.map((test) => test.file)],
    log: path,
    report: path,
  };
}

test("passing roles require a known engine and concrete model identity", async () => {
  await withEvidence((path) => {
    for (const identity of [
      { model: "unknown" },
      { model: "Unknown actual CLI model identity." },
      { model: "default" },
      { model: "not recorded" },
      { model: " " },
      { model: undefined },
      { engine: undefined },
      { engine: "unknown" },
    ]) {
      expect(() =>
        readGateResult({ ...resultFor(path), ...identity }, taskFor(path), "review", revision),
      ).toThrow();
    }
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
    engine: "codex",
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
    await writeFile(path, JSON.stringify(createTestBrowserReport(directory)));
    run(path);
  } finally {
    await rm(directory, { recursive: true, force: true });
  }
}
