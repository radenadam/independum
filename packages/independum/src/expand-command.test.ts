import { expect, test } from "vitest";
import { expandCommand, parseCommandArguments } from "./expand-command.ts";

test("arguments preserve quoted empty values and literal backslashes", () => {
  expect(parseCommandArguments("one \"two words\" '' C:\\work")).toEqual([
    "one",
    "two words",
    "",
    "C:\\work",
  ]);
  expect(() => parseCommandArguments('"unfinished')).toThrow("unmatched quote");
  expect(parseCommandArguments("  \t")).toEqual([]);
});

test("substitution supports positions defaults and slices in one pass", () => {
  const body =
    "$1|$3|$9|$ARGUMENTS|$@|\x24{3:-empty}|\x24{9:-$1}|\x24{ARGUMENTS:-none}|\x24{@:-none}|\x24{@:2}|\x24{@:2:1}|\x24{@:2:0}|$$|$NAME|\x24{@:0}|$(command)";
  expect(expandCommand(body, 'first "two words" ""')).toBe(
    "first|||first two words |first two words |empty|$1|first two words |first two words |two words |two words||$$|$NAME|\x24{@:0}|$(command)",
  );
  expect(expandCommand("$1 \x24{ARGUMENTS:-none} \x24{@:-none}", "")).toBe(" none none");
  expect(expandCommand("$1", '"$2"')).toBe("$2");
});
