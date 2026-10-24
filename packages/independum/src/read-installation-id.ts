import { randomUUID } from "node:crypto";
import { mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";

const uuid = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/** Returns the stable id of this installation, and creates it in the given folder on first use. */
export function readInstallationId(directory: string): string {
  const path = join(directory, "installation.json");
  try {
    const { id } = JSON.parse(readFileSync(path, "utf8")) as { id?: unknown };
    if (typeof id === "string" && uuid.test(id)) {
      return id;
    }
  } catch {
    // A missing or unreadable file means this is the first use, so a new id follows.
  }
  const id = randomUUID();
  mkdirSync(directory, { recursive: true });
  writeFileSync(path, `${JSON.stringify({ id }, null, 2)}\n`);
  return id;
}
