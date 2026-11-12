import { execFileSync, spawn, spawnSync } from "node:child_process";
import { appendFileSync, writeFileSync } from "node:fs";
import { mkdir, mkdtemp, readFile } from "node:fs/promises";
import { isAbsolute, join, relative, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { parseArgs } from "node:util";
import {
  type GateResult,
  gateResultSchema,
  gateTaskFingerprint,
  readGateResult,
  readGateTask,
} from "./gate-contract.ts";
import { readRevision } from "./read-revision.ts";

/** Runs deterministic checks and fresh local agent roles against one source revision. */
export async function runGate(arguments_: string[]): Promise<void> {
  const { values, positionals } = parseArgs({
    args: arguments_,
    allowPositionals: true,
    options: {
      task: { type: "string" },
      output: { type: "string" },
      engine: { type: "string", default: "codex" },
      timeout: { type: "string", default: "1200000" },
    },
  });
  const role = positionals[0];
  if (
    positionals.length !== 1 ||
    !["gate", "review", "qa"].includes(role ?? "") ||
    !values.task ||
    !values.output ||
    !isAbsolute(values.task) ||
    !isAbsolute(values.output) ||
    !["codex", "claude"].includes(values.engine) ||
    !/^\d+$/.test(values.timeout) ||
    Number(values.timeout) < 1000
  ) {
    throw new Error(
      "Pass gate, review, or qa with absolute --task and --output paths and an available engine.",
    );
  }
  const folder = resolve(import.meta.dirname, "..");
  const task = readGateTask(JSON.parse(await readFile(values.task, "utf8")), folder);
  const changed = new Set([
    ...execFileSync("git", ["diff", "--name-only", task.base], { cwd: folder, encoding: "utf8" })
      .trim()
      .split("\n"),
    ...execFileSync("git", ["ls-files", "--others", "--exclude-standard"], {
      cwd: folder,
      encoding: "utf8",
    })
      .trim()
      .split("\n"),
  ]);
  for (const learning of task.learning) {
    if (!changed.has(relative(folder, learning.owner).replaceAll("\\", "/"))) {
      throw new Error("Each learning entry must update its authoritative owner in this change.");
    }
  }
  const outputRelative = relative(folder, values.output);
  if (!outputRelative.startsWith("..") && !isAbsolute(outputRelative)) {
    try {
      execFileSync("git", ["check-ignore", "--quiet", values.output], { cwd: folder });
    } catch {
      throw new Error("Gate evidence inside the worktree must use an ignored scratch directory.");
    }
  }
  const revision = readRevision(folder, task.base);
  await mkdir(values.output, { recursive: true });
  const directory = await mkdtemp(join(values.output, `${role}-`));
  process.stdout.write(`Gate evidence: ${directory}\n`);
  const receipt: {
    revision: typeof revision;
    engine: string;
    platform: string;
    verdict: string;
    checks: string;
    roles: GateResult[];
    error?: string;
  } = {
    revision,
    engine: values.engine,
    platform: `${process.platform} ${process.arch}`,
    verdict: "incomplete",
    checks: "not run",
    roles: [],
  };
  writeFileSync(join(directory, "task.json"), JSON.stringify(task, null, 2));
  const schemaPath = join(directory, "result-schema.json");
  writeFileSync(schemaPath, JSON.stringify(gateResultSchema));
  try {
    if (role === "gate") {
      const pnpm = process.env.npm_execpath;
      if (pnpm === undefined) {
        throw new Error("Run the combined gate through pnpm.");
      }
      await command(
        pnpm.endsWith(".exe") ? pnpm : process.execPath,
        pnpm.endsWith(".exe") ? ["check"] : [pnpm, "check"],
        "",
        join(directory, "check.log"),
      );
      receipt.checks = "pass";
    }
    for (const currentRole of role === "gate"
      ? (["review", "qa"] as const)
      : [role as "review" | "qa"]) {
      if (JSON.stringify(readRevision(folder, task.base)) !== JSON.stringify(revision)) {
        throw new Error("Source or context changes invalidate gate evidence.");
      }
      const resultPath = join(directory, `${currentRole}.json`);
      const prompt = [
        `Act as the independent ${currentRole} role for Independum. Start fresh with repository context.`,
        `Worktree: ${folder}. Evidence destination: ${directory}. Do not edit source or use git mutations.`,
        "Read AGENTS.md and its startup path. The manifest identifies accepted behavior, not proof of success.",
        "Never read any auth.json, models.json, .env, or .env.* file. Use installed CLI authentication without inspecting it.",
        currentRole === "review"
          ? `Review accepted behavior against git diff ${revision.base} and untracked source files. Inspect affected callers, lifecycle and security invariants, false docs, missing surfaces, omitted learning, and unsupported completion. Use read-only investigation.`
          : "Run the actual built UI through Playwright scenarios and inspect screenshots and named values. Check complete journeys, discovery, recovery, both themes, touch at 360 pixels, long content, repeated use, diagnostics and failed requests. Check development reload if affected. Use isolated Pi fixtures. You own browser and preview teardown. Never run migrations against real state. This coordinator-controlled role runs outside implementation workers' sandbox. For a nonvisible change, justify the chosen browser scope against acceptance rather than pretending absent checks ran.",
        "Report only consequential findings with trigger, consequence, location, and requirement. Deduplicate root causes. Allow empty findings. Omit mechanically checked formatting. Distinguish defects, missing evidence, and open decisions. Do not fix source or weaken acceptance.",
        `Record actual CLI model, commands, platform and browser. Unknown model identity or unavailable required capability means incomplete. Each acceptance id needs observation and absolute nonempty evidence paths. For visible QA, include screenshots, values.jsonl and revision.json from pnpm qa with --base ${revision.base}. Inspect evidence before citing it. A skip, timeout, authentication failure or missing check is never pass.`,
        `Return only the schema result. Copy this revision exactly: ${JSON.stringify(revision)}. Task fingerprint: ${gateTaskFingerprint(task)}.`,
        `Task: ${JSON.stringify(task)}`,
      ].join("\n\n");
      writeFileSync(join(directory, `${currentRole}-prompt.txt`), prompt);
      const log = join(directory, `${currentRole}.log`);
      if (values.engine === "codex") {
        await command(
          "codex",
          [
            "exec",
            "--cd",
            folder,
            "--sandbox",
            currentRole === "qa" ? "danger-full-access" : "read-only",
            "--json",
            "--output-schema",
            schemaPath,
            "--output-last-message",
            resultPath,
            "-",
          ],
          prompt,
          log,
        );
      } else {
        await command(
          "claude",
          [
            "--print",
            "--output-format",
            "json",
            "--json-schema",
            JSON.stringify(gateResultSchema),
            "--permission-mode",
            "dontAsk",
            "--allowedTools",
            currentRole === "qa"
              ? "Read,Bash,Glob,Grep"
              : "Read,Glob,Grep,Bash(git diff *),Bash(git show *),Bash(git status *)",
            "--no-session-persistence",
          ],
          prompt,
          log,
        );
        const envelope = JSON.parse(await readFile(log, "utf8")) as Record<string, unknown>;
        writeFileSync(resultPath, JSON.stringify(envelope.structured_output));
      }
      const result = readGateResult(
        JSON.parse(await readFile(resultPath, "utf8")),
        task,
        currentRole,
        revision,
      );
      receipt.roles.push(result);
      if (result.verdict !== "pass") {
        throw new Error(`The ${currentRole} gate is ${result.verdict}.`);
      }
    }
    if (JSON.stringify(readRevision(folder, task.base)) !== JSON.stringify(revision)) {
      throw new Error("Gate roles changed source or context, so evidence is invalid.");
    }
    receipt.verdict = "pass";
  } catch (error) {
    receipt.error = error instanceof Error ? error.message : String(error);
    receipt.verdict =
      receipt.roles.some((result) => result.verdict === "fail") ||
      (role === "gate" && receipt.checks !== "pass")
        ? "fail"
        : "incomplete";
    process.exitCode = 1;
  } finally {
    const receiptPath = join(directory, "receipt.json");
    writeFileSync(receiptPath, JSON.stringify(receipt, null, 2));
    if (role === "gate" && receipt.verdict === "pass") {
      const cache = join(folder, "node_modules", ".cache", "independum-gate");
      await mkdir(cache, { recursive: true });
      writeFileSync(join(cache, "latest.json"), JSON.stringify({ receiptPath }));
    }
    process.stdout.write(`Gate verdict: ${receipt.verdict}.\n`);
  }

  async function command(
    executable: string,
    parameters: string[],
    input: string,
    log: string,
  ): Promise<void> {
    await new Promise<void>((complete, reject) => {
      const child = spawn(executable, parameters, {
        cwd: folder,
        windowsHide: true,
        detached: process.platform !== "win32",
        stdio: ["pipe", "pipe", "pipe"],
      });
      const timer = setTimeout(() => {
        if (child.pid !== undefined) {
          if (process.platform === "win32") {
            spawnSync(
              join(process.env.SystemRoot ?? "C:\\Windows", "System32", "taskkill.exe"),
              ["/PID", String(child.pid), "/T", "/F"],
              { windowsHide: true, timeout: 5000 },
            );
          } else {
            try {
              process.kill(-child.pid, "SIGKILL");
            } catch {
              child.kill("SIGKILL");
            }
          }
        }
        reject(new Error("The local gate exceeds its deadline."));
      }, Number(values.timeout));
      child.stdout.on("data", (chunk: Buffer) => appendFileSync(log, chunk));
      child.stderr.on("data", (chunk: Buffer) => appendFileSync(`${log}.stderr`, chunk));
      child.once("error", (error) => {
        clearTimeout(timer);
        reject(error);
      });
      child.once("close", (code) => {
        clearTimeout(timer);
        if (code === 0) {
          complete();
        } else {
          reject(new Error(`A local gate command exits with ${String(code)}.`));
        }
      });
      child.stdin.on("error", () => undefined);
      child.stdin.end(input);
    });
  }
}

if (
  process.argv[1] !== undefined &&
  relative(fileURLToPath(import.meta.url), resolve(process.argv[1])) === ""
) {
  await runGate(process.argv.slice(2)).catch((error: unknown) => {
    process.stderr.write(`${error instanceof Error ? error.message : String(error)}\n`);
    process.exitCode = 1;
  });
}
