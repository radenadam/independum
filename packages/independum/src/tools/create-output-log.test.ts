import { existsSync, mkdtempSync, readFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterAll, expect, test } from "vitest";
import { createModelTexts } from "../model-texts.ts";
import { createOutputLog } from "./create-output-log.ts";

const folder = mkdtempSync(join(tmpdir(), "independum-output-"));
afterAll(() => rmSync(folder, { recursive: true, force: true }));
const limits = { maxLines: 10, maxBytes: 1000 };
const options = { limits, texts: createModelTexts(() => ({})) };

test("output within the limits reaches the model whole and leaves no file", async () => {
  const path = join(folder, "short.log");
  const log = createOutputLog(path, options);
  log.append("one\ntw");
  log.append("o\nthree");
  expect(log.latest()).toBe("one\ntwo\nthree");
  expect(await log.finish()).toEqual({ text: "one\ntwo\nthree", lineCount: 3, isCut: false });
  expect(existsSync(path)).toBe(false);
});

test("long output keeps its start and its end, and names the cut lines and the whole file", async () => {
  const path = join(folder, "long.log");
  const log = createOutputLog(path, options);
  log.append(Array.from({ length: 30 }, (_, index) => `line ${index + 1}`).join("\n"));
  const output = await log.finish();
  expect(output.isCut).toBe(true);
  expect(output.lineCount).toBe(30);
  expect(output.text.split("\n")).toEqual([
    "line 1",
    "line 2",
    `[Lines 3 to 22 of 30 are cut here. The whole output is in ${path}]`,
    ...Array.from({ length: 8 }, (_, index) => `line ${index + 23}`),
  ]);
  expect(readFileSync(path, "utf8").split("\n")).toHaveLength(31);
});

test("each take returns the output since the last one, and its cut note counts from the first line", async () => {
  const path = join(folder, "taken.log");
  const log = createOutputLog(path, { ...options, isKept: true });
  log.append("one\ntwo\n");
  expect(log.take()).toEqual({ text: "one\ntwo", lineCount: 2, isCut: false });
  log.append(`${Array.from({ length: 30 }, (_, index) => `line ${index + 3}`).join("\n")}\n`);
  expect(log.take().text.split("\n")).toEqual([
    "line 3",
    "line 4",
    `[Lines 5 to 24 of 32 are cut here. The whole output is in ${path}]`,
    ...Array.from({ length: 8 }, (_, index) => `line ${index + 25}`),
  ]);
  expect(log.take()).toEqual({ text: "", lineCount: 0, isCut: false });
  await log.finish();
});

test("a log finds a text since the last take, in its file too, and tells a watcher when it comes", async () => {
  const log = createOutputLog(join(folder, "watched.log"), { ...options, isKept: true });
  log.append(`${Array.from({ length: 30 }, (_, index) => `line ${index + 1}`).join("\n")}\n`);
  await new Promise((resolve) => setTimeout(resolve, 100));
  expect(log.hasPrinted("line 12")).toBe(true);
  log.take();
  expect(log.hasPrinted("line 12")).toBe(false);
  log.append("Listening on http://loc");
  expect(log.hasPrinted("Listening")).toBe(true);
  let found = 0;
  log.watch("localhost", () => {
    found += 1;
  });
  log.append("alhost:3000\n");
  log.append("localhost again\n");
  expect(found).toBe(1);
  await log.finish();
});

test("terminal colors and redrawn progress lines read as plain text", async () => {
  const log = createOutputLog(join(folder, "plain.log"), options);
  log.append("\u001b[32mpassed\u001b[0m\r\n");
  log.append("10%\r50%\r");
  log.append("100%\ndone");
  expect((await log.finish()).text).toBe("passed\n100%\ndone");
});
