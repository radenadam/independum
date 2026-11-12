import { parseArgs } from "node:util";
import type { PreviewFixture } from "./create-preview-fixture.ts";

/** Reads preview flags shared by both commands. */
export function previewOptions(
  arguments_: string[],
  isQa: boolean,
): {
  fixture: PreviewFixture;
  port: number;
  hasRealLogins: boolean;
  url: string | undefined;
  browser: string | undefined;
  scenario: string | undefined;
  comparison: string;
} {
  const { values, positionals } = parseArgs({
    args: arguments_,
    allowPositionals: isQa,
    options: {
      fixture: { type: "string", default: "chats" },
      port: { type: "string", default: "0" },
      "real-logins": { type: "boolean", default: false },
      ...(isQa
        ? {
            url: { type: "string" as const },
            browser: { type: "string" as const },
            base: { type: "string" as const },
          }
        : {}),
    },
  });
  const fixture = values.fixture;
  if (
    fixture !== "empty" &&
    fixture !== "chats" &&
    fixture !== "compacted" &&
    fixture !== "hooks"
  ) {
    throw new Error("The fixture must be empty, chats, compacted, or hooks.");
  }
  const port = Number(values.port);
  if (!/^\d+$/.test(values.port) || !Number.isInteger(port) || port < 0 || port > 65535) {
    throw new Error("The port must be an integer from 0 to 65535.");
  }
  if (isQa && positionals.length !== 1) {
    throw new Error("Pass exactly one scenario name or JSON path.");
  }
  return {
    fixture,
    port,
    hasRealLogins: values["real-logins"],
    url: typeof values.url === "string" ? values.url : undefined,
    browser: typeof values.browser === "string" ? values.browser : undefined,
    scenario: positionals[0],
    comparison: typeof values.base === "string" ? values.base : "main",
  };
}
