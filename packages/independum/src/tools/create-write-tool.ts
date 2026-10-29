import { mkdir, readFile, writeFile } from "node:fs/promises";
import { dirname, isAbsolute, relative, resolve } from "node:path";
import { Type } from "@earendil-works/pi-ai";
import {
  defineTool,
  type ToolDefinition,
  withFileMutationQueue,
} from "@earendil-works/pi-coding-agent";
import type { WriteDetails } from "../api-types.ts";
import { defineText, type ModelText, type ModelTexts } from "../model-texts.ts";
import { type FileFingerprint, versionOf } from "./file-fingerprint.ts";
import {
  checkNotFolder,
  type DecodedText,
  decodeBytes,
  diffOf,
  encodeText,
  lineBreakOf,
  pathParameterOf,
  splitLines,
} from "./text-file.ts";

const group = "Write";
const pathSlot = { meaning: "The file as the model gave it.", example: "src/app.ts" };
const linesSlot = { meaning: "How many lines the file has now.", example: "52 lines" };

/** The texts of the Write tool that the model reads, which the user can edit. */
const writeTexts = {
  description: defineText({
    id: "write.description",
    group,
    section: "description",
    label: "Every request",
    builtIn:
      "Writes a file with the given content, creating it and any missing folders, or replacing it whole. Replacing a file that this chat has not seen, or that changed since this chat saw it, fails once with the reason, and the same call again goes through.",
    slots: {},
  }),
  path: defineText({
    id: "write.parameters.path",
    group,
    section: "parameter",
    label: "path",
    builtIn: "The file, as a path in the project folder or an absolute path.",
    slots: {},
  }),
  content: defineText({
    id: "write.parameters.content",
    group,
    section: "parameter",
    label: "content",
    builtIn: "The whole content of the file.",
    slots: {},
  }),
  created: defineText({
    id: "write.created",
    group,
    section: "result",
    label: "When the file is new",
    builtIn: "Created {path} with {lines}.",
    slots: { path: pathSlot, lines: linesSlot },
  }),
  createdFolder: defineText({
    id: "write.createdFolder",
    group,
    section: "result",
    label: "After it, when Write made a folder for the file",
    builtIn: "Created the folder {folder}.",
    slots: { folder: { meaning: "The first folder that Write made.", example: "src/new" } },
  }),
  replaced: defineText({
    id: "write.replaced",
    group,
    section: "result",
    label: "When the file existed and is replaced",
    builtIn: "Replaced {path}, which now has {lines}.",
    slots: { path: pathSlot, lines: linesSlot },
  }),
  notSeen: defineText({
    id: "write.notSeen",
    group,
    section: "result",
    label: "When the file exists and this chat has not seen it",
    builtIn: "{path} already exists, with {size}, and this chat has not seen it.",
    slots: {
      path: pathSlot,
      size: {
        meaning: "How much the file holds, in lines, or in bytes for a binary file.",
        example: "812 lines",
      },
    },
  }),
  changed: defineText({
    id: "write.changed",
    group,
    section: "result",
    label: "When the file changed since this chat last saw it",
    builtIn: "{path} changed since this chat last saw it, at {lines}, and now has {size}.",
    slots: {
      path: pathSlot,
      lines: { meaning: "The lines that differ now.", example: "lines 40 to 52 and 88" },
      size: { meaning: "How much the file holds now.", example: "815 lines" },
    },
  }),
  changedSomewhere: defineText({
    id: "write.changedSomewhere",
    group,
    section: "result",
    label:
      "The same, for a file with more than 100,000 lines, whose lines Independum does not track",
    builtIn: "{path} changed since this chat last saw it, and now has {size}.",
    slots: {
      path: pathSlot,
      size: { meaning: "How much the file holds now.", example: "120,000 lines" },
    },
  }),
};

/** The texts of the Write tool, in the order that the Agent place shows them. */
export const writeTextList: ModelText[] = Object.values(writeTexts);

const numberFormat = new Intl.NumberFormat("en-US");

/**
 * Creates the Write tool, which writes a whole file, and refuses once to replace a file that the
 * chat has not seen or that changed since it saw it.
 */
export function createWriteTool(texts: ModelTexts): ToolDefinition {
  return defineTool({
    name: "Write",
    label: "Write",
    get description() {
      return texts.get(writeTexts.description);
    },
    get parameters() {
      return Type.Object({
        path: pathParameterOf(texts.get(writeTexts.path)),
        content: Type.String({ description: texts.get(writeTexts.content) }),
      });
    },
    async execute(_toolCallId, { path, content }, _signal, _onUpdate, context) {
      const file = resolve(context.cwd, path);
      checkNotFolder(file, path, texts);
      return withFileMutationQueue(file, async () => {
        const existing = await readExisting(file);
        if (existing === undefined) {
          const madeFolder = await mkdir(dirname(file), { recursive: true });
          // A new file gets the content exactly as the model sent it.
          const bytes = Buffer.from(content, "utf8");
          await writeFile(file, bytes);
          const lines = splitLines(content);
          const { fingerprint } = versionOf(context, file, bytes, lines, path, texts);
          const created = texts.fill(writeTexts.created, {
            path,
            lines: describeLineCount(lines.length),
          });
          const folder =
            madeFolder === undefined
              ? undefined
              : texts.fill(writeTexts.createdFolder, {
                  folder: shownPathOf(madeFolder, context.cwd),
                });
          const details: WriteDetails & { fingerprint: FileFingerprint } = {
            isNew: true,
            hunks: [],
            added: lines.length,
            removed: 0,
            fingerprint,
          };
          return {
            content: [
              { type: "text", text: folder === undefined ? created : `${created}\n${folder}` },
            ],
            details,
          };
        }
        const { bytes, decoded } = existing;
        const wanted = content.replaceAll("\r\n", "\n");
        const lines = decoded === undefined ? undefined : splitLines(decoded.text);
        const version = versionOf(context, file, bytes, lines, path, texts);
        const refusal = refusalOf(version, bytes, lines, path, texts);
        if (refusal !== undefined) {
          // The refusal shows the model this version, so the same call again replaces it.
          return {
            content: [{ type: "text", text: refusal }],
            details: { fingerprint: version.fingerprint },
            isError: true,
          };
        }
        const text =
          decoded === undefined ? wanted : wanted.replaceAll("\n", lineBreakOf(decoded.text));
        const written =
          decoded === undefined ? Buffer.from(text, "utf8") : encodeText(text, decoded);
        await writeFile(file, written);
        const writtenLines = splitLines(wanted);
        const { fingerprint } = versionOf(context, file, written, writtenLines, path, texts);
        const details: WriteDetails & { fingerprint: FileFingerprint } = {
          isNew: false,
          ...diffOf(decoded === undefined ? "" : splitLines(decoded.text).join("\n"), wanted),
          fingerprint,
        };
        return {
          content: [
            {
              type: "text",
              text: texts.fill(writeTexts.replaced, {
                path,
                lines: describeLineCount(writtenLines.length),
              }),
            },
          ],
          details,
        };
      });
    },
  });
}

// A file that does not exist yet has no bytes, and a binary file has no text.
async function readExisting(
  file: string,
): Promise<{ bytes: Buffer; decoded: DecodedText | undefined } | undefined> {
  let bytes: Buffer;
  try {
    bytes = await readFile(file);
  } catch {
    return undefined;
  }
  return { bytes, decoded: decodeBytes(bytes) };
}

function refusalOf(
  version: ReturnType<typeof versionOf>,
  bytes: Buffer,
  lines: string[] | undefined,
  path: string,
  texts: ModelTexts,
): string | undefined {
  const size =
    lines === undefined
      ? `${numberFormat.format(bytes.length)} bytes`
      : describeLineCount(lines.length);
  if (!version.isSeen) {
    return texts.fill(writeTexts.notSeen, { path, size });
  }
  if (version.changedLines === undefined) {
    return undefined;
  }
  return version.changedLines === null
    ? texts.fill(writeTexts.changedSomewhere, { path, size })
    : texts.fill(writeTexts.changed, { path, lines: version.changedLines, size });
}

function describeLineCount(count: number): string {
  return count === 1 ? "1 line" : `${numberFormat.format(count)} lines`;
}

// A folder inside the project reads as a path from it, like the paths that the model gives. On
// Windows, mkdir names a folder that it made in its long form, which starts with a backslash, a
// backslash, a question mark, and a backslash.
function shownPathOf(made: string, cwd: string): string {
  const folder = made.startsWith("\\\\?\\") ? made.slice(4) : made;
  const inside = relative(cwd, folder);
  return inside === "" || inside.startsWith("..") || isAbsolute(inside)
    ? folder.replaceAll("\\", "/")
    : inside.replaceAll("\\", "/");
}
