import { type CSSProperties, Fragment, type ReactElement } from "react";
import styles from "./fact-table.module.css";

/** A row of a fact table: what it holds, and its value in each column. */
export interface FactRow {
  name: string;
  values: string[];
  isPart?: boolean | undefined;
}

/** Properties of a fact table. */
interface FactTableProps {
  columns: string[];
  rows: FactRow[];
}

/**
 * Draws facts in rows, each named on the left with its values on the right, one in each column,
 * under the names of the columns when they have names.
 */
export function FactTable({ columns, rows }: FactTableProps): ReactElement {
  const hasHeadings = columns.some((column) => column !== "");
  return (
    <div className={styles.table} style={{ "--columns": columns.length } as CSSProperties}>
      {hasHeadings ? (
        <>
          <span />
          {columns.map((column) => (
            <span key={column} className={styles.column}>
              {column}
            </span>
          ))}
        </>
      ) : null}
      {rows.map((row) => (
        <Fragment key={row.name}>
          <span className={styles.name} data-part={row.isPart === true}>
            {row.name}
          </span>
          {columns
            .map((column, index) => ({ column, value: row.values[index] ?? "" }))
            .map(({ column, value }) => (
              <span key={column} className={styles.value}>
                {value}
              </span>
            ))}
        </Fragment>
      ))}
    </div>
  );
}
