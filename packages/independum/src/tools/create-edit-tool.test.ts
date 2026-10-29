import { readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { expect, test } from "vitest";
import { createModelTexts } from "../model-texts.ts";
import { createEditTool } from "./create-edit-tool.ts";
import { createReadTool } from "./create-read-tool.ts";
import { createTestFolder } from "./create-test-folder.ts";

const folder = createTestFolder("edit");
const texts = createModelTexts(() => ({}));
const editTool = createEditTool(texts);
const readTool = createReadTool({
  getLimits: () => ({ maxLines: 2000, maxBytes: 51_200 }),
  texts,
});
// The results that the chat keeps, as Pi saves them, so a tool can tell what the chat saw before.
const branch: unknown[] = [];
const context = {
  cwd: folder,
  sessionManager: { getBranch: () => branch },
} as unknown as Parameters<typeof editTool.execute>[4];

interface EditOutcome {
  text: string;
  isError: boolean;
  details: unknown;
}

async function run(tool: typeof editTool, input: Record<string, unknown>): Promise<EditOutcome> {
  try {
    const result = await tool.execute("call", input as never, undefined, undefined, context);
    branch.push({ type: "message", message: { role: "toolResult", details: result.details } });
    const text = result.content.map((block) => (block.type === "text" ? block.text : "")).join("");
    return { text, isError: false, details: result.details };
  } catch (error) {
    return { text: (error as Error).message, isError: true, details: null };
  }
}

/** What a test asks Edit for, in the names that this code uses. */
interface EditInput {
  path: string;
  oldString: string;
  newString: string;
  replaceAll?: boolean;
  line?: number;
  column?: number;
}

function edit({ oldString, newString, replaceAll, ...rest }: EditInput): Promise<EditOutcome> {
  // biome-ignore-start lint/style/useNamingConvention: These are the names of the parameters of Edit.
  return run(editTool, {
    ...rest,
    old_string: oldString,
    new_string: newString,
    replace_all: replaceAll,
  });
  // biome-ignore-end lint/style/useNamingConvention: These are the names of the parameters of Edit.
}

function write(name: string, content: string | Buffer): string {
  const path = join(folder, name);
  writeFileSync(path, content);
  return path;
}

test("an exact text is replaced, and the result names the lines before and after", async () => {
  const path = write("fruits.txt", "apples are red\nbananas are blue\ncherries are red\n");
  expect(await edit({ path: "fruits.txt", oldString: "blue", newString: "yellow" })).toMatchObject({
    text: "Replaced line 2 of fruits.txt with line 2.",
    isError: false,
    details: { added: 1, removed: 1 },
  });
  expect(readFileSync(path, "utf8")).toBe("apples are red\nbananas are yellow\ncherries are red\n");
  expect(
    (
      await edit({
        path: "fruits.txt",
        oldString: "bananas are yellow\n",
        newString: "bananas are yellow\nlimes are green\nplums are purple\n",
      })
    ).text,
  ).toBe("Replaced line 2 of fruits.txt with lines 2 to 4.");
  expect(
    (await edit({ path: "fruits.txt", oldString: "limes are green\n", newString: "" })).text,
  ).toBe("Removed the text at line 3 of fruits.txt.");
});

test("line breaks of Windows, a byte order mark, and UTF-16 stay as the file had them", async () => {
  const windows = write(
    "windows.txt",
    Buffer.concat([Buffer.from([0xef, 0xbb, 0xbf]), Buffer.from("one\r\ntwo\r\nthree\r\n")]),
  );
  await edit({ path: "windows.txt", oldString: "two\nthree", newString: "two\n2.5\nthree" });
  expect(readFileSync(windows).toString("utf8")).toBe("\ufeffone\r\ntwo\r\n2.5\r\nthree\r\n");
  const utf16 = write(
    "utf16.txt",
    Buffer.from([0xff, 0xfe, ...Buffer.from("one\ntwo\n", "utf16le")]),
  );
  await edit({ path: "utf16.txt", oldString: "two", newString: "zwei" });
  expect(readFileSync(utf16)).toEqual(
    Buffer.from([0xff, 0xfe, ...Buffer.from("one\nzwei\n", "utf16le")]),
  );
});

test("a space at the end of a line blocks a match only when old_string goes past it", async () => {
  const path = write("spaces.txt", "apples\napple is not a banana \ncherry is red\n");
  expect(
    await edit({
      path: "spaces.txt",
      oldString: "apple is not a banana\ncherry is red",
      newString: "an apple\na cherry",
    }),
  ).toMatchObject({
    text: "old_string is not in spaces.txt. It matches lines 2 to 3 except for the space at the end of line 2, which the file has and old_string does not.",
    isError: true,
  });
  await edit({ path: "spaces.txt", oldString: "apple is not a banana", newString: "an apple" });
  expect(readFileSync(path, "utf8")).toBe("apples\nan apple \ncherry is red\n");
});

test("tabs, lookalike quotes, and the line numbers of Read are named as the difference", async () => {
  write("indent.ts", "function a() {\n\treturn 1;\n}\n");
  expect(
    (
      await edit({
        path: "indent.ts",
        oldString: "function a() {\n    return 1;",
        newString: "x",
      })
    ).text,
  ).toBe(
    "old_string is not in indent.ts. It matches lines 1 to 2 except for the start of line 2, where the file has a tab and old_string has 4 spaces.",
  );
  write("nested.ts", "if (a) {\n\tfor (const b of c) {\n\t\tuse(b);\n\t}\n}\n");
  expect(
    (
      await edit({
        path: "nested.ts",
        oldString: "\t\tfor (const b of c) {\n\t\t\tuse(b);",
        newString: "x",
      })
    ).text,
  ).toBe(
    "old_string is not in nested.ts. It matches lines 2 to 3 except for the start of line 2, where the file has a tab and old_string has 2 tabs, and the start of line 3, where the file has 2 tabs and old_string has 3 tabs.",
  );
  write("quotes.md", "It\u2019s done.\n");
  expect(
    (await edit({ path: "quotes.md", oldString: "It's done.", newString: "Done." })).text,
  ).toBe(
    "old_string is not in quotes.md. It matches line 1 except for the character at line 1, column 3, where the file has `\u2019` and old_string has `'`.",
  );
  write("numbered.ts", "const a = 1;\nconst b = 2;\n");
  expect(
    (
      await edit({
        path: "numbered.ts",
        oldString: "1\tconst a = 1;\n2\tconst b = 2;",
        newString: "x",
      })
    ).text,
  ).toBe(
    "old_string is not in numbered.ts. It matches lines 1 to 2 except for the line number and tab at the start of each line of old_string, which Read adds and the file does not hold.",
  );
});

test("a miss with no near match shows the closest text, or only says it is missing", async () => {
  write("closest.ts", "const total = items.length;\nconst name = user.name;\n");
  expect(
    (await edit({ path: "closest.ts", oldString: "const total = items.size;", newString: "x" }))
      .text,
  ).toBe(
    "old_string is not in closest.ts. The closest text is at line 1:\n1\tconst total = items.length;",
  );
  expect(
    (await edit({ path: "closest.ts", oldString: "nothing like it", newString: "x" })).text,
  ).toBe("old_string is not in closest.ts.");
});

test("repeated text needs replace_all, or line and column, to choose its place", async () => {
  const path = write(
    "repeat.txt",
    "apple, apple, apple\nbanana\napple, apple, apple\napple, apple, apple\n",
  );
  expect((await edit({ path: "repeat.txt", oldString: "apple", newString: "pear" })).text).toBe(
    "old_string occurs 9 times in repeat.txt, at lines 1, 3, and 4, and replace_all is not set.",
  );
  expect(
    (await edit({ path: "repeat.txt", oldString: "apple", newString: "pear", line: 2 })).text,
  ).toBe("old_string does not start at line 2 of repeat.txt. It starts at lines 1, 3, and 4.");
  expect(
    (await edit({ path: "repeat.txt", oldString: "apple", newString: "pear", line: 3 })).text,
  ).toBe("old_string occurs 3 times on line 3 of repeat.txt, at columns 1, 8, and 15.");
  expect(
    (
      await edit({
        path: "repeat.txt",
        oldString: "apple",
        newString: "pear",
        line: 3,
        column: 9,
      })
    ).text,
  ).toBe(
    "old_string does not start at line 3, column 9 of repeat.txt. On that line it starts at columns 1, 8, and 15.",
  );
  expect(
    (
      await edit({
        path: "repeat.txt",
        oldString: "apple",
        newString: "pear",
        line: 3,
        column: 8,
      })
    ).text,
  ).toBe("Replaced line 3 of repeat.txt with line 3.");
  expect(readFileSync(path, "utf8").split("\n")[2]).toBe("apple, pear, apple");
  expect(
    (await edit({ path: "repeat.txt", oldString: "apple", newString: "plum", replaceAll: true }))
      .text,
  ).toBe("Replaced 8 places in repeat.txt, at lines 1, 3, and 4.");
});

test("an input that cannot work fails before the file is read", async () => {
  write("input.txt", "text\n");
  const cases: [Omit<EditInput, "path">, string][] = [
    [{ oldString: "", newString: "x" }, "old_string is empty."],
    [{ oldString: "text", newString: "text" }, "old_string and new_string are the same."],
    [{ oldString: "text", newString: "x", column: 2 }, "column needs line."],
    [
      { oldString: "text", newString: "x", replaceAll: true, line: 1 },
      "replace_all and line cannot be used together.",
    ],
  ];
  for (const [input, message] of cases) {
    expect(await edit({ path: "input.txt", ...input })).toMatchObject({
      text: message,
      isError: true,
    });
  }
});

test("a file that is not valid UTF-8, a binary file, and a missing file are refused", async () => {
  write("latin1.txt", Buffer.from([0x63, 0x61, 0x66, 0xe9]));
  expect((await edit({ path: "latin1.txt", oldString: "caf", newString: "x" })).text).toBe(
    "latin1.txt is not valid UTF-8, so Edit cannot change it without losing bytes.",
  );
  write("font.woff2", Buffer.concat([Buffer.from("wOF2"), Buffer.alloc(100)]));
  expect((await edit({ path: "font.woff2", oldString: "wOF2", newString: "x" })).text).toBe(
    "font.woff2 is a binary file of 104 bytes, so it has no text to show.",
  );
  expect((await edit({ path: "nowhere.txt", oldString: "a", newString: "b" })).text).toBe(
    "No file at nowhere.txt.",
  );
});

test("an edit of a file that changed since the chat saw it goes through with a note", async () => {
  write("seen.txt", "one\ntwo\nthree\n");
  await run(readTool, { path: "seen.txt" });
  write("seen.txt", "one\nTWO\nthree\n");
  expect((await edit({ path: "seen.txt", oldString: "three", newString: "3" })).text).toBe(
    "Replaced line 3 of seen.txt with line 3.\n[seen.txt changed since this chat last saw it, at line 2.]",
  );
  expect((await edit({ path: "seen.txt", oldString: "one", newString: "1" })).text).toBe(
    "Replaced line 1 of seen.txt with line 1.",
  );
});

test("a read that comes after an edit in the same reply sees the edit", async () => {
  write("order.txt", "before\n");
  const [edited, read] = await Promise.all([
    edit({ path: "order.txt", oldString: "before", newString: "after" }),
    run(readTool, { path: "order.txt" }),
  ]);
  expect(edited.isError).toBe(false);
  expect(read.text).toBe("1\tafter");
});
