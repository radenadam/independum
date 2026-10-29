import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterAll, expect, test } from "vitest";
import type { OutputLimits } from "../api-types.ts";
import { createModelTexts } from "../model-texts.ts";
import { createReadTool } from "./create-read-tool.ts";

const folder = mkdtempSync(join(tmpdir(), "independum-read-"));
afterAll(() => rmSync(folder, { recursive: true, force: true }));
const texts = createModelTexts(() => ({}));
const builtInLimits = { maxLines: 2000, maxBytes: 51_200 };
const visionModel = { input: ["text", "image"] };
// A PNG image of one pixel.
const pixel =
  "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mNkYAAAAAYAAjCB0C8AAAAASUVORK5CYII=";

interface ReadOutcome {
  text: string;
  images: number;
  details: unknown;
  isError: boolean;
}

async function read(
  input: Record<string, unknown>,
  limits: OutputLimits = builtInLimits,
  model: unknown = visionModel,
): Promise<ReadOutcome> {
  const tool = createReadTool({ getLimits: () => limits, texts });
  const context = { cwd: folder, model } as unknown as Parameters<typeof tool.execute>[4];
  try {
    const result = await tool.execute("call", input as never, undefined, undefined, context);
    return {
      text: result.content.map((block) => (block.type === "text" ? block.text : "")).join(""),
      images: result.content.filter((block) => block.type === "image").length,
      details: result.details,
      isError: false,
    };
  } catch (error) {
    return { text: (error as Error).message, images: 0, details: null, isError: true };
  }
}

function numbered(count: number, from = 1): string {
  return Array.from({ length: count }, (_, index) => `line ${index + from}`).join("\n");
}

function write(name: string, content: string | Buffer): void {
  writeFileSync(join(folder, name), content);
}

test("a file comes back as numbered lines, and a read that reaches its end has no note", async () => {
  write("short.ts", "one\ntwo\nthree\n");
  expect(await read({ path: "short.ts" })).toEqual({
    text: "1\tone\n2\ttwo\n3\tthree",
    images: 0,
    details: { kind: "text", firstLine: 1, lastLine: 3, lineCount: 3 },
    isError: false,
  });
  expect((await read({ path: "short.ts", offset: 2 })).text).toBe("2\ttwo\n3\tthree");
});

test("a limit ends the read with a note of the lines that are not shown", async () => {
  write("long.ts", numbered(30));
  expect((await read({ path: "long.ts", offset: 5, limit: 3 })).text).toBe(
    "5\tline 5\n6\tline 6\n7\tline 7\n[Lines 8 to 30 are not shown.]",
  );
  expect((await read({ path: "long.ts", offset: 28, limit: 2 })).text).toBe(
    "28\tline 28\n29\tline 29\n[Line 30 is not shown.]",
  );
});

test("the output limit ends the read between lines and names which limit it was", async () => {
  write("many.ts", numbered(30));
  const byLines = await read({ path: "many.ts" }, { maxLines: 10, maxBytes: 51_200 });
  expect(byLines.text.split("\n").slice(-2)).toEqual([
    "10\tline 10",
    "[Lines 11 to 30 are not shown. The read stops at the output limit of 10 lines.]",
  ]);
  write("wide-lines.ts", Array.from({ length: 30 }, () => "b".repeat(100)).join("\n"));
  const byBytes = await read({ path: "wide-lines.ts" }, { maxLines: 2000, maxBytes: 1024 });
  expect(byBytes.text.split("\n").at(-1)).toBe(
    "[Lines 10 to 30 are not shown. The read stops at the output limit of 1 KB.]",
  );
  expect(byBytes.details).toEqual({ kind: "text", firstLine: 1, lastLine: 9, lineCount: 30 });
});

test("a next line longer than the whole limit is named with its length", async () => {
  write("wide.ts", `short\n${"x".repeat(5000)}\nend`);
  expect((await read({ path: "wide.ts" }, { maxLines: 2000, maxBytes: 2048 })).text).toBe(
    "1\tshort\n[Lines 2 to 3 are not shown. The read stops at the output limit of 2 KB. Line 2 alone has 5,000 characters.]",
  );
});

test("a first line longer than the limit is cut, and a read from its column goes on", async () => {
  const minified = "a".repeat(3000);
  write("app.min.js", `${minified}\nnext`);
  const limits = { maxLines: 2000, maxBytes: 1024 };
  const first = await read({ path: "app.min.js" }, limits);
  expect(first.text).toBe(
    `1\t${"a".repeat(1022)}\n[Columns 1,023 to 3,000 of line 1 and line 2 are not shown. The read stops at the output limit of 1 KB.]`,
  );
  const next = await read({ path: "app.min.js", column: 1023 }, limits);
  expect(next.text.startsWith(`1\t${"a".repeat(1022)}\n[Columns 2,045 to 3,000`)).toBe(true);
});

test("a length ends the read inside a line, from the column that the read starts at", async () => {
  write("trace.js", `${numbered(11)}\n${"y".repeat(2100)}\n${numbered(800, 13)}`);
  expect((await read({ path: "trace.js", offset: 12, column: 1, length: 500 })).text).toBe(
    `12\t${"y".repeat(500)}\n[Columns 501 to 2,100 of line 12 and lines 13 to 812 are not shown.]`,
  );
  expect((await read({ path: "trace.js", offset: 3, column: 6, length: 4 })).text).toBe(
    "3\t3\n4\tlin\n[Columns 4 to 6 of line 4 and lines 5 to 812 are not shown.]",
  );
});

test("line breaks of Windows and a byte order mark read as plain lines", async () => {
  write("windows.txt", Buffer.from([0xef, 0xbb, 0xbf, ...Buffer.from("one\r\ntwo\r\n")]));
  expect((await read({ path: "windows.txt" })).text).toBe("1\tone\n2\ttwo");
  write("utf16.txt", Buffer.from([0xff, 0xfe, ...Buffer.from("one\ntwo", "utf16le")]));
  expect((await read({ path: "utf16.txt" })).text).toBe("1\tone\n2\ttwo");
});

test("a file that is not valid UTF-8 reads with a note", async () => {
  write("latin1.txt", Buffer.from([0x63, 0x61, 0x66, 0xe9]));
  expect((await read({ path: "latin1.txt" })).text).toBe(
    "1\tcaf\uFFFD\n[The file is not valid UTF-8, so bytes that are not text show as \uFFFD.]",
  );
});

test("an empty file, a folder, and a read past the end each say so", async () => {
  write("empty.ts", "");
  expect(await read({ path: "empty.ts" })).toMatchObject({
    text: "empty.ts is empty.",
    isError: false,
    details: { kind: "empty" },
  });
  mkdirSync(join(folder, "src"), { recursive: true });
  expect(await read({ path: "src" })).toMatchObject({
    text: "src is a folder, not a file.",
    isError: true,
  });
  write("lines.ts", "one\n\nthree");
  expect(await read({ path: "lines.ts", offset: 9 })).toMatchObject({
    text: "lines.ts ends at line 3, so line 9 is past its end.",
    isError: true,
  });
  expect((await read({ path: "lines.ts", column: 7 })).text).toBe(
    "Line 1 of lines.ts ends at column 3, so column 7 is past its end.",
  );
  expect((await read({ path: "lines.ts", offset: 2, column: 2 })).text).toBe(
    "Line 2 of lines.ts is empty, so column 2 is past its end.",
  );
});

test("a missing file names files with similar names in its folder", async () => {
  mkdirSync(join(folder, "web"), { recursive: true });
  write(join("web", "app.ts"), "");
  write(join("web", "apps"), "");
  write(join("web", "other.css"), "");
  expect(await read({ path: "web/app.tsx" })).toMatchObject({
    text: "No file at web/app.tsx. Similar names: web/app.ts, web/apps.",
    isError: true,
  });
  expect((await read({ path: "nowhere/file.ts" })).text).toBe("No file at nowhere/file.ts.");
});

test("a binary file says its size, and a bitmap counts as binary", async () => {
  write("font.woff2", Buffer.concat([Buffer.from("wOF2"), Buffer.alloc(2500)]));
  expect(await read({ path: "font.woff2" })).toMatchObject({
    text: "font.woff2 is a binary file of 2.4 KB, so it has no text to show.",
    isError: true,
  });
  write("picture.bmp", Buffer.concat([Buffer.from("BM"), Buffer.alloc(60)]));
  expect((await read({ path: "picture.bmp" })).text).toMatch(/^picture\.bmp is a binary file/);
});

test("an image comes back as an image, or as a note for a model that cannot take images", async () => {
  write("pixel.png", Buffer.from(pixel, "base64"));
  expect(await read({ path: "pixel.png" })).toMatchObject({
    text: "pixel.png is an image of 1 by 1 pixels.",
    images: 1,
    details: { kind: "image", width: 1, height: 1 },
  });
  expect(await read({ path: "pixel.png" }, builtInLimits, { input: ["text"] })).toMatchObject({
    text: "pixel.png is an image, and the model of this chat cannot take images.",
    images: 0,
    isError: false,
  });
});
