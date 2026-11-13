import { createHash } from "node:crypto";
import { existsSync, readFileSync, statSync } from "node:fs";
import { basename, isAbsolute, relative } from "node:path";
import { readGateBrowserChecks } from "./read-gate-browser-checks.ts";
import { readPushUpdates } from "./read-push-revision.ts";
import type { Revision } from "./read-revision.ts";
import { readTestAvailability } from "./read-test-availability.ts";

export interface GateTask {
  outcome: string;
  base: string;
  requirements: string[];
  acceptance: { id: string; behavior: string }[];
  preservedBehavior: string;
  exclusions: string;
  reading: string[];
  writableFiles: string[];
  sharedFiles: string[];
  capabilities: string[];
  verificationOwner: string;
  questionRound: string;
  isVisible: boolean;
  scenarios: string[];
  learning: {
    speaker: string;
    date: string;
    source: string;
    kind: "product" | "preference" | "implementation" | "temporary" | "question";
    provenance: "direct" | "delegated" | "inferred";
    concern: string;
    owner: string;
    protection: string;
  }[];
}

export interface GateResult {
  role: "review" | "qa";
  verdict: "pass" | "fail" | "incomplete";
  revision: Revision;
  taskFingerprint: string;
  engine: "codex" | "claude";
  model: string;
  platform: string;
  browser: string;
  commands: string[];
  coverage: {
    acceptanceId: string;
    observation: string;
    evidence: string[];
    isVerified: boolean;
  }[];
  findings: {
    kind: "defect" | "evidence" | "decision";
    trigger: string;
    consequence: string;
    location: string;
    requirement: string;
  }[];
  missingChecks: string[];
}

const textSchema = { type: "string", minLength: 1 };
const textsSchema = { type: "array", items: textSchema };

export const gateReportSchema: {
  type: "object";
  additionalProperties: boolean;
  required: string[];
  properties: Record<string, unknown>;
} = {
  type: "object",
  additionalProperties: false,
  required: [
    "role",
    "verdict",
    "revision",
    "taskFingerprint",
    "platform",
    "browser",
    "commands",
    "coverage",
    "findings",
    "missingChecks",
  ],
  properties: {
    role: { enum: ["review", "qa"] },
    verdict: { enum: ["pass", "fail", "incomplete"] },
    revision: {
      type: "object",
      additionalProperties: false,
      required: ["head", "base", "fingerprint", "contextFingerprint"],
      properties: {
        head: textSchema,
        base: textSchema,
        fingerprint: textSchema,
        contextFingerprint: textSchema,
      },
    },
    taskFingerprint: textSchema,
    platform: textSchema,
    browser: textSchema,
    commands: textsSchema,
    missingChecks: textsSchema,
    coverage: {
      type: "array",
      items: {
        type: "object",
        additionalProperties: false,
        required: ["acceptanceId", "observation", "evidence", "isVerified"],
        properties: {
          acceptanceId: textSchema,
          observation: textSchema,
          evidence: textsSchema,
          isVerified: { type: "boolean" },
        },
      },
    },
    findings: {
      type: "array",
      items: {
        type: "object",
        additionalProperties: false,
        required: ["kind", "trigger", "consequence", "location", "requirement"],
        properties: {
          kind: { enum: ["defect", "evidence", "decision"] },
          trigger: textSchema,
          consequence: textSchema,
          location: textSchema,
          requirement: textSchema,
        },
      },
    },
  },
};

const gateResultSchema = {
  ...gateReportSchema,
  required: [...gateReportSchema.required, "engine", "model"],
  properties: {
    ...gateReportSchema.properties,
    engine: { enum: ["codex", "claude"] },
    model: textSchema,
  },
};

/** Requires a concrete CLI model id instead of a missing identity or selection alias. */
export function readGateModel(value: unknown): string {
  if (
    typeof value !== "string" ||
    !/^[a-z0-9][a-z0-9._:/-]*$/i.test(value) ||
    /^(unknown|default|auto|latest|sonnet|opus|haiku|n\/a)$/i.test(value) ||
    /(?:^|[-_/])(unknown|latest)(?:$|[-_/])/i.test(value)
  ) {
    throw new Error("Pass a concrete CLI model id with --model.");
  }
  return value;
}

/** Validates task context and learning before a gate starts any agent. */
export function readGateTask(value: unknown, folder: string): GateTask {
  if (!isRecord(value)) {
    throw new Error("The gate task must be an object.");
  }
  for (const key of [
    "outcome",
    "base",
    "preservedBehavior",
    "exclusions",
    "verificationOwner",
    "questionRound",
  ]) {
    requireText(value[key]);
  }
  for (const key of [
    "requirements",
    "reading",
    "writableFiles",
    "sharedFiles",
    "capabilities",
    "scenarios",
  ]) {
    requireTexts(value[key]);
  }
  if (
    typeof value.isVisible !== "boolean" ||
    !Array.isArray(value.acceptance) ||
    value.acceptance.length === 0 ||
    !Array.isArray(value.learning)
  ) {
    throw new Error("The task needs visibility, acceptance, and learning fields.");
  }
  const task = value as unknown as GateTask;
  if (
    task.requirements.length === 0 ||
    task.reading.length === 0 ||
    task.capabilities.length === 0 ||
    new Set(task.scenarios).size !== task.scenarios.length ||
    (task.isVisible && task.scenarios.length === 0)
  ) {
    throw new Error(
      "The task needs requirements, reading, capabilities, and visible scenario coverage.",
    );
  }
  const ids = new Set<string>();
  for (const acceptance of task.acceptance) {
    if (!isRecord(acceptance)) {
      throw new Error("An acceptance condition must be an object.");
    }
    requireText(acceptance.id);
    requireText(acceptance.behavior);
    if (ids.has(acceptance.id)) {
      throw new Error("Acceptance ids must be unique.");
    }
    ids.add(acceptance.id);
  }
  const ledger = readFileSync(new URL("../docs/checkpoint.md", import.meta.url), "utf8");
  for (const requirement of task.requirements) {
    if (!ledger.includes(`| ${requirement} |`)) {
      throw new Error("A task requirement is absent from the checkpoint.");
    }
  }
  for (const path of [...task.reading, ...task.sharedFiles, ...task.scenarios]) {
    requirePath(path);
  }
  for (const path of task.writableFiles) {
    if (
      !isAbsolute(path) ||
      relative(folder, path).startsWith("..") ||
      isAbsolute(relative(folder, path))
    ) {
      throw new Error("Writable task files must be absolute paths in the worktree.");
    }
  }
  for (const entry of task.learning) {
    if (!isRecord(entry)) {
      throw new Error("A learning entry must be an object.");
    }
    for (const key of ["speaker", "date", "source", "concern", "owner", "protection"] as const) {
      requireText(entry[key]);
    }
    if (
      !/^\d{4}-\d{2}-\d{2}$/.test(entry.date) ||
      !["product", "preference", "implementation", "temporary", "question"].includes(entry.kind) ||
      !["direct", "delegated", "inferred"].includes(entry.provenance)
    ) {
      throw new Error("Learning needs a date, kind, and provenance.");
    }
    requirePath(entry.owner);
    requirePath(entry.protection);
    if (!task.writableFiles.includes(entry.owner)) {
      throw new Error("The learning owner must be in the change scope.");
    }
  }
  return task;
}

/** Rejects unsupported gate verdicts, stale revisions, and missing acceptance evidence. */
export function readGateResult(
  value: unknown,
  task: GateTask,
  role: GateResult["role"],
  revision: Revision,
): GateResult {
  validateShape(value, gateResultSchema);
  const result = value as GateResult;
  if (result.verdict === "pass") {
    readGateModel(result.model);
  }
  if (result.taskFingerprint !== gateTaskFingerprint(task)) {
    throw new Error("Acceptance or task changes invalidate gate evidence.");
  }
  if (
    result.role !== role ||
    Object.entries(revision).some(
      ([key, value]) => result.revision[key as keyof Revision] !== value,
    )
  ) {
    throw new Error("The gate result identifies another role or revision.");
  }
  const ids = new Set(task.acceptance.map((condition) => condition.id));
  const covered = new Set<string>();
  for (const coverage of result.coverage) {
    if (!ids.has(coverage.acceptanceId) || covered.has(coverage.acceptanceId)) {
      throw new Error("Gate coverage has an unknown or duplicated acceptance id.");
    }
    covered.add(coverage.acceptanceId);
    for (const path of coverage.evidence) {
      requirePath(path);
    }
  }
  if (result.findings.some((finding) => !task.requirements.includes(finding.requirement))) {
    throw new Error("A gate finding has an unknown requirement.");
  }
  if (
    result.verdict === "pass" &&
    (result.findings.length > 0 ||
      result.missingChecks.length > 0 ||
      result.commands.length === 0 ||
      covered.size !== ids.size ||
      result.coverage.some((coverage) => !coverage.isVerified || coverage.evidence.length === 0))
  ) {
    throw new Error(
      "A pass requires complete verified coverage without findings or missing checks.",
    );
  }
  if (role === "qa" && (task.isVisible || task.scenarios.length > 0) && result.verdict === "pass") {
    const evidence = result.coverage.flatMap((coverage) => coverage.evidence);
    if (
      !evidence.some((path) => path.endsWith(".png")) ||
      !evidence.some((path) => path.endsWith("values.jsonl"))
    ) {
      throw new Error("Visible QA needs screenshots and named browser values.");
    }
    const captures = evidence.filter((path) => path.endsWith("revision.json"));
    if (captures.length === 0) {
      throw new Error("Visible QA needs the browser revision capture.");
    }
    const captured = captures.map(
      (path) => JSON.parse(readFileSync(path, "utf8")) as Revision & { scenario: string },
    );
    if (
      captured.some((capture) =>
        Object.entries(revision).some(
          ([key, expected]) => capture[key as keyof Revision] !== expected,
        ),
      )
    ) {
      throw new Error("Browser evidence belongs to another revision.");
    }
    if (
      task.scenarios.some((scenario) => !captured.some((capture) => capture.scenario === scenario))
    ) {
      throw new Error("QA coverage must cite current browser captures for every task scenario.");
    }
  }
  return result;
}

/** Validates a complete local receipt against the commits supplied by Git before pushing. */
export function readGateReceipt(
  value: unknown,
  task: GateTask,
  revision: Revision,
  outgoing: string,
): void {
  if (
    !isRecord(value) ||
    value.verdict !== "pass" ||
    value.checks !== "pass" ||
    !Array.isArray(value.roles) ||
    value.roles.length !== 2
  ) {
    throw new Error("Run the combined local gate against the current outgoing revision.");
  }
  const recorded = value.revision as Revision | undefined;
  if (
    recorded === undefined ||
    Object.entries(revision).some(([key, expected]) => recorded[key as keyof Revision] !== expected)
  ) {
    throw new Error("Source or context changes invalidate the local receipt.");
  }
  for (const [index, role] of (["review", "qa"] as const).entries()) {
    if (readGateResult(value.roles[index], task, role, revision).verdict !== "pass") {
      throw new Error("Every role must pass for the local receipt to pass.");
    }
  }
  readGateBrowserChecks(value.browserChecks, task, revision);
  if (
    readTestAvailability({ completed: true, tests: value.testAvailability }).some(
      (test) => test.status !== "skipped",
    )
  ) {
    throw new Error("Failing or unavailable tests prevent a passing receipt.");
  }
  for (const update of readPushUpdates(outgoing)) {
    if (update.head !== revision.head) {
      throw new Error("The gate receipt does not cover an outgoing commit.");
    }
    if (!/^0+$/.test(update.remoteHead) && update.remoteHead !== revision.base) {
      throw new Error("The gate receipt base must equal the remote commit replaced by the push.");
    }
  }
}

/** Identifies the accepted task independently from source and context revisions. */
export function gateTaskFingerprint(task: GateTask): string {
  return createHash("sha256").update(JSON.stringify(task)).digest("hex");
}

function requirePath(value: string): void {
  if (
    ["auth.json", "models.json", ".env"].includes(basename(value)) ||
    basename(value).startsWith(".env.")
  ) {
    throw new Error("Credential paths cannot be gate context or evidence.");
  }
  if (!isAbsolute(value) || !existsSync(value) || statSync(value).size === 0) {
    throw new Error("Evidence and context paths must be absolute, readable, and nonempty.");
  }
}

function requireText(value: unknown): asserts value is string {
  if (typeof value !== "string" || value.trim() === "") {
    throw new Error("A required task value is empty.");
  }
}

function requireTexts(value: unknown): asserts value is string[] {
  if (!Array.isArray(value)) {
    throw new Error("A task list is missing.");
  }
  for (const item of value) {
    requireText(item);
  }
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function validateShape(value: unknown, schema: unknown): void {
  const rule = schema as {
    type?: string;
    enum?: string[];
    minLength?: number;
    items?: unknown;
    properties?: Record<string, unknown>;
    required?: string[];
  };
  if (rule.enum !== undefined && !rule.enum.includes(String(value))) {
    throw new Error("The gate result has an invalid choice.");
  }
  if (rule.type === "string") {
    requireText(value);
  }
  if (rule.type === "boolean" && typeof value !== "boolean") {
    throw new Error("The gate result needs a boolean.");
  }
  if (rule.type === "array") {
    if (!Array.isArray(value)) {
      throw new Error("The gate result needs an array.");
    }
    for (const item of value) {
      validateShape(item, rule.items);
    }
  }
  if (rule.type === "object") {
    if (
      !isRecord(value) ||
      rule.required?.some((key) => !(key in value)) ||
      Object.keys(value).some((key) => !(key in (rule.properties ?? {})))
    ) {
      throw new Error("The gate result has missing or unknown fields.");
    }
    for (const [key, item] of Object.entries(value)) {
      validateShape(item, rule.properties?.[key]);
    }
  }
}
