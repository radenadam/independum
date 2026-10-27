/** How a copy writes formatting into plain text: as Markdown, or left out. */
export type TextStyle = "markdown" | "plain";

/** What a copy puts on the clipboard: plain text, and formatted text for the places that take it. */
export interface ClipboardContent {
  text: string;
  html?: string;
}

// Parts of the interface inside the chat, such as buttons, the times of messages, and the language
// label of a code block, stay out of a copy.
const skipped = 'button, [aria-hidden="true"], [data-copy="skip"]';
const blockTags = new Set([
  "P",
  "H1",
  "H2",
  "H3",
  "H4",
  "H5",
  "H6",
  "UL",
  "OL",
  "LI",
  "PRE",
  "BLOCKQUOTE",
  "TABLE",
  "HR",
  "DIV",
]);

/** Returns the text of a part of the chat, with its formatting written as Markdown or left out. */
export function clipboardText(root: Node, style: TextStyle): string {
  return blocksOf(root, style).join("\n\n");
}

/** Returns the HTML of a part of the chat, without the parts of the interface inside it. */
export function clipboardHtml(root: Node): string {
  const holder = document.createElement("div");
  holder.append(root.cloneNode(true));
  for (const element of holder.querySelectorAll(skipped)) {
    element.remove();
  }
  return holder.innerHTML;
}

/** Puts a copy on the clipboard, with its formatted text when it has one. */
export async function writeClipboard({ text, html }: ClipboardContent): Promise<void> {
  if (html === undefined) {
    await navigator.clipboard.writeText(text);
    return;
  }
  const parts: Record<string, Blob> = {};
  parts["text/plain"] = new Blob([text], { type: "text/plain" });
  parts["text/html"] = new Blob([html], { type: "text/html" });
  await navigator.clipboard.write([new ClipboardItem(parts)]);
}

// Text between blocks gathers into a paragraph of its own, so a selection that starts or ends in the
// middle of a block keeps its words.
function blocksOf(node: Node, style: TextStyle): string[] {
  const blocks: string[] = [];
  let line = "";
  function flush(): void {
    if (line.trim() !== "") {
      blocks.push(line.trim());
    }
    line = "";
  }
  for (const child of node.childNodes) {
    if (child instanceof Element && blockTags.has(child.tagName) && !child.matches(skipped)) {
      flush();
      blocks.push(...blockOf(child, style));
    } else {
      line += inlineOf(child, style);
    }
  }
  flush();
  return blocks.filter((block) => block !== "");
}

function blockOf(element: Element, style: TextStyle): string[] {
  const isMarkdown = style === "markdown";
  const language = element.getAttribute("data-language");
  if (language !== null || element.tagName === "PRE") {
    const code = (element.querySelector("pre") ?? element).textContent.replace(/\n$/, "");
    return [isMarkdown ? `\`\`\`${language ?? ""}\n${code}\n\`\`\`` : code];
  }
  const heading = /^H([1-6])$/.exec(element.tagName);
  if (heading !== null) {
    const text = inlineOf(element, style).trim();
    return [isMarkdown ? `${"#".repeat(Number(heading[1]))} ${text}` : text];
  }
  switch (element.tagName) {
    case "P":
      return [inlineOf(element, style).trim()];
    case "UL":
    case "OL":
      return [listOf(element, style)];
    case "TABLE":
      return [tableOf(element, style)];
    case "HR":
      return isMarkdown ? ["---"] : [];
    case "BLOCKQUOTE": {
      const text = blocksOf(element, style).join("\n\n");
      return isMarkdown ? [text.replace(/^/gm, "> ").replace(/^> $/gm, ">")] : [text];
    }
    default:
      return blocksOf(element, style);
  }
}

function inlineOf(node: Node, style: TextStyle): string {
  if (node instanceof Text) {
    return node.data.replace(/\s+/g, " ");
  }
  if (!(node instanceof Element) || node.matches(skipped)) {
    return "";
  }
  if (node.classList.contains("katex")) {
    return mathOf(node, style);
  }
  const text = [...node.childNodes].map((child) => inlineOf(child, style)).join("");
  if (style === "plain") {
    return node.tagName === "A" ? linkOf(node, text, false) : node.tagName === "BR" ? "\n" : text;
  }
  switch (node.tagName) {
    case "STRONG":
    case "B":
      return `**${text}**`;
    case "EM":
    case "I":
      return `*${text}*`;
    case "DEL":
    case "S":
      return `~~${text}~~`;
    case "CODE":
      return text.includes("`") ? `\`\` ${text} \`\`` : `\`${text}\``;
    case "A":
      return linkOf(node, text, true);
    case "BR":
      return "\n";
    default:
      return text;
  }
}

function linkOf(link: Element, text: string, isMarkdown: boolean): string {
  const href = link.getAttribute("href") ?? "";
  if (href === "" || href === text) {
    return isMarkdown && href !== "" ? `<${href}>` : text;
  }
  return isMarkdown ? `[${text}](${href})` : `${text} (${href})`;
}

// Each item starts with its marker, and the lines that follow it line up under its text, so a
// nested list stays nested.
function listOf(list: Element, style: TextStyle): string {
  const start = Number(list.getAttribute("start") ?? 1);
  const items = [...list.children].filter((child) => child.tagName === "LI");
  return items
    .map((item, index) => {
      const marker = list.tagName === "OL" ? `${start + index}. ` : "- ";
      const lines = blocksOf(item, style).join("\n").split("\n");
      return lines
        .map((line, number) => (number === 0 ? marker : " ".repeat(marker.length)) + line)
        .join("\n");
    })
    .join("\n");
}

// A Markdown table takes its first row as the header. Plain text separates cells with tabs, which a
// spreadsheet splits into columns.
function tableOf(table: Element, style: TextStyle): string {
  const rows = [...table.querySelectorAll("tr")].map((row) =>
    [...row.children].map((cell) => inlineOf(cell, style).trim()),
  );
  if (style === "plain") {
    return rows.map((cells) => cells.join("\t")).join("\n");
  }
  const lines = rows.map(
    (cells) => `| ${cells.map((cell) => cell.replace(/\|/g, "\\|")).join(" | ")} |`,
  );
  const header = rows[0] ?? [];
  lines.splice(1, 0, `| ${header.map(() => "---").join(" | ")} |`);
  return lines.join("\n");
}

// KaTeX keeps the TeX source of a formula in an annotation, so a copy gives back that source, between
// dollar signs in Markdown, and on lines of its own for a formula that stands alone.
function mathOf(math: Element, style: TextStyle): string {
  const tex = math.querySelector('annotation[encoding="application/x-tex"]')?.textContent ?? "";
  if (style === "plain") {
    return tex;
  }
  return math.parentElement?.classList.contains("katex-display") === true
    ? `$$\n${tex}\n$$`
    : `$${tex}$`;
}
