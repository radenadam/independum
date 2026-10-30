import { readFileSync } from "node:fs";
import { runCheck } from "./run-check.ts";

// A lowercase tag opens an element of the page. A type argument, such as `useState<boolean>`,
// follows a name, so the character before the tag rules it out.
const elementTag = /(?<![\w$.])<[a-z][\w-]*(?=[\s/>])/g;
const quotes = new Set(['"', "'", "`"]);

runCheck((files) => files.filter((file) => file.endsWith(".tsx")).flatMap(checkMarkup));

// The browser draws its own box for a title attribute, beside the tooltip of Independum, so an
// element of the page never takes one. A component may still take a title of its own.
function checkMarkup(file: string): string[] {
  const code = readFileSync(file, "utf8");
  const problems: string[] = [];
  for (const match of code.matchAll(elementTag)) {
    for (const index of titlesOf(code, match.index + match[0].length)) {
      const line = code.slice(0, index).split("\n").length;
      problems.push(
        `${file}:${line}: A title attribute shows the tooltip of the browser. Use useTooltip instead.`,
      );
    }
  }
  return problems;
}

// Walks the attributes of one tag up to its end, skipping strings and expressions, so a title
// inside an expression counts only for the element that holds it.
function titlesOf(code: string, start: number): number[] {
  const titles: number[] = [];
  let depth = 0;
  let index = start;
  while (index < code.length) {
    const character = code.charAt(index);
    if (quotes.has(character)) {
      index = code.indexOf(character, index + 1);
      if (index === -1) {
        break;
      }
    } else if (character === "{") {
      depth += 1;
    } else if (character === "}") {
      depth -= 1;
    } else if (depth === 0 && character === ">") {
      break;
    } else if (depth === 0 && /\s/.test(character) && code.startsWith("title=", index + 1)) {
      titles.push(index + 1);
    }
    index += 1;
  }
  return titles;
}
