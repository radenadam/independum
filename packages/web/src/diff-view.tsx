import type { DiffHunk } from "independum/api-types";
import type { ReactElement } from "react";
import styles from "./diff-view.module.css";

/** Properties of a diff view. */
interface DiffViewProps {
  path: string;
  hunks: DiffHunk[];
}

/**
 * One line of a diff with its number, in the file before for a removed line and after for the rest,
 * and whether it went or came.
 */
interface DiffRow {
  id: string;
  kind: "kept" | "added" | "removed" | "gap";
  number: number | undefined;
  text: string;
}

/**
 * Draws the change that a tool made to a file as its lines, each with one number,
 * the removed lines in red and the added lines in green.
 */
export function DiffView({ path, hunks }: DiffViewProps): ReactElement {
  return (
    <div className={styles.view}>
      <div className={styles.path}>{path}</div>
      <div className={styles.rows}>
        {rowsOf(hunks).map((row) => (
          <div key={row.id} className={styles.row} data-kind={row.kind}>
            <span className={styles.number}>{row.number ?? ""}</span>
            <span className={styles.sign}>{signOf(row.kind)}</span>
            <span className={styles.text}>{row.text}</span>
          </div>
        ))}
      </div>
    </div>
  );
}

function rowsOf(hunks: DiffHunk[]): DiffRow[] {
  const rows: DiffRow[] = [];
  for (const [index, hunk] of hunks.entries()) {
    if (index > 0) {
      rows.push({ id: `${index}`, kind: "gap", number: undefined, text: "" });
    }
    let before = hunk.oldStart;
    let after = hunk.newStart;
    for (const [place, line] of hunk.lines.entries()) {
      const id = `${index}:${place}`;
      const text = line.slice(1);
      if (line.startsWith("+")) {
        rows.push({ id, kind: "added", number: after, text });
        after += 1;
      } else if (line.startsWith("-")) {
        rows.push({ id, kind: "removed", number: before, text });
        before += 1;
      } else if (line.startsWith(" ")) {
        rows.push({ id, kind: "kept", number: after, text });
        before += 1;
        after += 1;
      }
    }
  }
  return rows;
}

function signOf(kind: DiffRow["kind"]): string {
  if (kind === "added") {
    return "+";
  }
  return kind === "removed" ? "-" : "";
}
