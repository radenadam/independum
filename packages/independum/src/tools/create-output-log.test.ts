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

test("terminal colors and redrawn progress lines read as plain text", async () => {
  const log = createOutputLog(join(folder, "plain.log"), options);
  log.append("\u001b[32mpassed\u001b[0m\r\n");
  log.append("10%\r50%\r");
  log.append("100%\ndone");
  expect((await log.finish()).text).toBe("passed\n100%\ndone");
});
