import type { ConfigurationIssue } from "independum/api-types";
import type { ReactElement } from "react";
import { PlaceNote } from "./place-frame.tsx";

interface ConfigurationIssuesProps {
  issues: ConfigurationIssue[];
  note?: string;
}

/** Shows the file, JSON pointer, and precise reason for each unavailable configuration. */
export function ConfigurationIssues({ issues, note }: ConfigurationIssuesProps): ReactElement {
  return (
    <>
      {issues.map((issue) => (
        <PlaceNote key={`${issue.file}:${issue.pointer}`}>
          {issue.file}
          {issue.pointer}: {issue.message} {note}
        </PlaceNote>
      ))}
    </>
  );
}
