import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { runCheck } from "./run-check.ts";

const tokenFile = "packages/web/src/theme.css";
const colorLiteral = /#[0-9a-f]{3,8}\b|\b(?:rgba?|hsla?|hwb|lab|lch|oklab|oklch)\(/i;
const reducedMotionGuard = /prefers-reduced-motion:\s*no-preference/;
const composesFromFile = /composes:\s*([\w-]+)\s+from\s+"([^"]+)"/;
// A shorthand sets its parts too, such as padding and padding-top.
const shorthands = ["margin", "padding"];

runCheck((files) =>
  files
    .filter((file) => file.endsWith(".css"))
    .flatMap((file) => [...checkStylesheet(file), ...checkComposes(file)]),
);

// Blanking comments keeps every character at its position, so line numbers stay right.
function readBlanked(file: string): string {
  return readFileSync(file, "utf8").replace(/\/\*[\s\S]*?\*\//g, (comment) =>
    comment.replace(/[^\n]/g, " "),
  );
}

function checkStylesheet(file: string): string[] {
  const css = readBlanked(file);
  const problems: string[] = [];
  const openBlocks: string[] = [];
  let start = 0;

  for (const [index, character] of Array.from(css).entries()) {
    if (character !== "{" && character !== "}" && character !== ";") {
      continue;
    }
    const text = css.slice(start, index).trim();
    start = index + 1;
    if (character === "{") {
      openBlocks.push(text);
      continue;
    }
    if (text.includes(":")) {
      const line = css.slice(0, index).split("\n").length;
      for (const problem of findDeclarationProblems(file, text, openBlocks)) {
        problems.push(`${file}:${line}: ${problem}`);
      }
    }
    if (character === "}") {
      openBlocks.pop();
    }
  }
  return problems;
}

function findDeclarationProblems(
  file: string,
  declaration: string,
  openBlocks: string[],
): string[] {
  const separator = declaration.indexOf(":");
  const property = declaration.slice(0, separator).trim().toLowerCase();
  const value = declaration.slice(separator + 1).trim();
  const problems: string[] = [];

  if (file !== tokenFile && colorLiteral.test(value)) {
    problems.push(`Colors come from the tokens in ${tokenFile}.`);
  }
  const moves =
    property === "animation" ||
    property === "animation-name" ||
    (property === "transition" && /transform|translate|scale|rotate/.test(value));
  if (moves && value !== "none" && !openBlocks.some((block) => reducedMotionGuard.test(block))) {
    problems.push("Motion belongs inside @media (prefers-reduced-motion: no-preference).");
  }
  return problems;
}

// A rule that composes a class of another file and sets a property that the class sets too wins or
// loses by the order in which the page loads the two files, so it never sets one.
function checkComposes(file: string): string[] {
  const problems: string[] = [];
  for (const rule of rulesOf(readBlanked(file))) {
    const match = composesFromFile.exec(rule.body);
    if (match === null) {
      continue;
    }
    const [, name, path] = match;
    const target = rulesOf(readBlanked(join(dirname(file), path ?? ""))).find(
      (each) => each.selector === `.${name}`,
    );
    const taken = propertiesOf(target?.body ?? "");
    for (const property of propertiesOf(rule.body)) {
      if (taken.some((each) => isOverlap(each, property))) {
        problems.push(
          `${file}:${rule.line}: ${rule.selector} composes .${name} and sets ${property} too, so the order in which the page loads them decides.`,
        );
      }
    }
  }
  return problems;
}

function rulesOf(css: string): { selector: string; body: string; line: number }[] {
  return [...css.matchAll(/([^{}]+)\{([^{}]*)\}/g)].map((match) => {
    const selector = (match[1] ?? "").trim();
    const offset = (match.index ?? 0) + (match[1] ?? "").indexOf(selector);
    return { selector, body: match[2] ?? "", line: css.slice(0, offset).split("\n").length };
  });
}

function propertiesOf(body: string): string[] {
  return body
    .split(";")
    .map((declaration) => declaration.slice(0, declaration.indexOf(":")).trim().toLowerCase())
    .filter((property) => property !== "" && property !== "composes");
}

function isOverlap(first: string, second: string): boolean {
  return (
    first === second ||
    shorthands.some(
      (shorthand) =>
        (first === shorthand && second.startsWith(`${shorthand}-`)) ||
        (second === shorthand && first.startsWith(`${shorthand}-`)),
    )
  );
}
