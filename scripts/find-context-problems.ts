import { dirname, posix } from "node:path";

/** Finds broken context references and malformed ownership, decision, and acceptance records. */
export function findContextProblems(documents: Map<string, string>, files: string[]): string[] {
  const problems: string[] = [];
  const workflow = documents.get("docs/workflow.md") ?? "";
  const owners = [
    ...workflow.matchAll(/^\| `([^`]+)` \| ([^|]+) \| (\d+) \| ([^|]+) \| ([^|]+) \|$/gm),
  ];
  const requirements = new Set(
    [...(documents.get("docs/checkpoint.md") ?? "").matchAll(/^\| (CP-\d+) \|/gm)].map(
      (match) => match[1],
    ),
  );
  const decisions = [...documents.keys()]
    .filter((file) => /^docs\/decisions\/\d{4}-/.test(file))
    .toSorted();
  if (documents.get("CLAUDE.md")?.trim() !== "@AGENTS.md") {
    problems.push("CLAUDE.md: Keep only the AGENTS.md import.");
  }
  if (owners.length === 0) {
    problems.push("docs/workflow.md: Context ownership metadata is missing.");
  }
  if (requirements.size === 0) {
    problems.push("docs/checkpoint.md: Acceptance rows are missing.");
  }
  const ledgerIds = [...(documents.get("docs/checkpoint.md") ?? "").matchAll(/^\| (CP-\d+) \|/gm)];
  if (ledgerIds.length !== requirements.size) {
    problems.push("docs/checkpoint.md: Requirement ids must be unique.");
  }
  for (const owner of owners) {
    if (owner[1] !== undefined && !owner[1].includes("*") && !documents.has(owner[1])) {
      problems.push(`docs/workflow.md: Owned context ${owner[1]} is missing.`);
    }
  }
  for (const [file, content] of documents) {
    const prose = content.replace(/^```[^\n]*\n[\s\S]*?^```\s*$/gm, "");
    const words = content.trim().split(/\s+/).length;
    const exact = owners.filter((owner) => owner[1] === file);
    const wildcard = owners.filter((owner) => owner[1]?.includes("*") && matches(file, owner[1]));
    const owner = exact[0] ?? wildcard[0];
    if (exact.length > 1 || wildcard.length > 1) {
      problems.push(`${file}: Context ownership is duplicated.`);
    }
    if (owner === undefined) {
      problems.push(`${file}: Context has no owner or budget.`);
    }
    const isHistorical =
      file.startsWith("docs/decisions/") && Number(posix.basename(file).slice(0, 4)) < 71;
    if (!isHistorical && owner !== undefined && words > Number(owner[3])) {
      problems.push(`${file}: ${words} words exceed the ${owner[3]} word budget.`);
    }
    if ([...prose.matchAll(/^# /gm)].length !== 1 && file !== "CLAUDE.md") {
      problems.push(`${file}: Keep one level-one heading.`);
    }
    for (const match of prose.matchAll(/\[[^\]\n]*\]\(([^)\n]+)\)/g)) {
      const target = match[1]?.replace(/^<|>$/g, "");
      if (target === undefined || /^[a-z]+:/i.test(target)) {
        continue;
      }
      const labelNumber = /\[(?:decision )?(\d{4})\]/i.exec(match[0])?.[1];
      const targetNumber = /^(\d{4})-/.exec(posix.basename(target))?.[1];
      if (labelNumber !== undefined && targetNumber !== undefined && labelNumber !== targetNumber) {
        problems.push(
          `${file}: Decision label ${labelNumber} disagrees with its target ${targetNumber}.`,
        );
      }
      const [path, fragment] = target.split("#");
      const destination = posix.normalize(
        posix.join(dirname(file).replaceAll("\\", "/"), decodeURIComponent(path ?? "")),
      );
      const resolved = path === "" ? file : destination;
      if (!files.includes(resolved)) {
        problems.push(`${file}: Link target ${resolved} is missing.`);
        continue;
      }
      if (
        fragment !== undefined &&
        documents.has(resolved) &&
        !anchors(documents.get(resolved) ?? "").has(decodeURIComponent(fragment))
      ) {
        problems.push(`${file}: Anchor ${resolved}#${fragment} is missing.`);
      }
    }
    for (const match of prose.matchAll(/\bCP-\d+\b/g)) {
      if (!requirements.has(match[0])) {
        problems.push(`${file}: Unknown requirement ${match[0]}.`);
      }
    }
    if (!isHistorical && prose.match(/(?:C:[/\\]Users|independum-archive|health details)/i)) {
      problems.push(
        `${file}: Keep private archive locations and personal material out of current context.`,
      );
    }
  }
  for (const [index, file] of decisions.entries()) {
    const number = Number(posix.basename(file).slice(0, 4));
    const content = documents.get(file) ?? "";
    if (number !== index + 1) {
      problems.push(`${file}: Decision numbers must be unique and sequential.`);
    }
    for (const marker of [
      "- Status: ",
      "- Date: ",
      "## Context",
      "## Decision",
      "## Consequences",
    ]) {
      if (!content.includes(marker)) {
        problems.push(`${file}: Decision lacks ${marker.trim()}.`);
      }
    }
    if (
      number >= 71 &&
      !/^- Source: (direct|delegated|inferred).+\d{4}-\d{2}-\d{2}/m.test(content)
    ) {
      problems.push(`${file}: New decisions need dated provenance.`);
    }
    const status = content.split("\n").find((line) => line.startsWith("- Status:")) ?? "";
    if (!/^- Status: (accepted|superseded|rejected)/.test(status)) {
      problems.push(`${file}: Decision status is invalid.`);
    }
    if (status.startsWith("- Status: superseded")) {
      const successor = /\]\((\d{4})-[^)]+\)/.exec(status)?.[1];
      if (successor === undefined || Number(successor) <= number) {
        problems.push(`${file}: Supersession must point forward.`);
      }
    }
    if (number >= 71) {
      for (const match of status.matchAll(/\]\((\d{4}-[^)]+\.md)\)/g)) {
        const previous = documents.get(`docs/decisions/${match[1]}`) ?? "";
        if (
          !previous
            .split("\n")
            .find((line) => line.startsWith("- Status:"))
            ?.includes(posix.basename(file))
        ) {
          problems.push(`${file}: The amended decision must link back from its status.`);
        }
      }
    }
  }
  for (const line of (documents.get("docs/checkpoint.md") ?? "").split("\n")) {
    if (!line.startsWith("| CP-")) {
      continue;
    }
    const columns = line
      .split("|")
      .slice(1, -1)
      .map((column) => column.trim());
    if (
      columns.length !== 5 ||
      !/\d{4}-\d{2}-\d{2}|R05|R09|A10/.test(columns[1] ?? "") ||
      !/^(partial|missing|blocked|complete):/.test(columns[3] ?? "") ||
      !/^(unverified|partial|verified):/.test(columns[4] ?? "")
    ) {
      problems.push(
        "docs/checkpoint.md: Each requirement needs a source, behavior, implementation, and verification.",
      );
    }
    if (columns[3]?.startsWith("complete:") && !columns[4]?.startsWith("verified:")) {
      problems.push("docs/checkpoint.md: Complete implementation requires verified acceptance.");
    }
  }
  return problems;
}

function matches(file: string, pattern: string): boolean {
  const [prefix, suffix] = pattern.split("*");
  return (
    prefix !== undefined && suffix !== undefined && file.startsWith(prefix) && file.endsWith(suffix)
  );
}

function anchors(content: string): Set<string> {
  const result = new Set<string>();
  const counts = new Map<string, number>();
  for (const match of content
    .replace(/^```[^\n]*\n[\s\S]*?^```\s*$/gm, "")
    .matchAll(/^#{1,6} (.+)$/gm)) {
    const name = (match[1] ?? "")
      .toLowerCase()
      .replace(/[^\w\s-]/g, "")
      .replace(/\s/g, "-");
    const count = counts.get(name) ?? 0;
    result.add(count === 0 ? name : `${name}-${count}`);
    counts.set(name, count + 1);
  }
  return result;
}
