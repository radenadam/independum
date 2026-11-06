import { readFileSync } from "node:fs";
import { runCheck } from "./run-check.ts";

const tokenFile = "packages/web/src/theme.css";
const colorLiteral = /#[0-9a-f]{3,8}\b|\b(?:rgba?|hsla?|hwb|lab|lch|oklab|oklch)\(/i;
const reducedMotionGuard = /prefers-reduced-motion:\s*no-preference/;

runCheck((files) => files.filter((file) => file.endsWith(".css")).flatMap(checkStylesheet));

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
  if (property === "composes" && /\bfrom\b/.test(value)) {
    problems.push(
      "Import the CSS module and combine its classes in markup instead of composing from a file.",
    );
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
