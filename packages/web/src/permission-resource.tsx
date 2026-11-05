import type { ApprovalRequest } from "independum/api-types";
import type { ReactElement } from "react";
import { CodeWell } from "./code-well.tsx";
import { PlaceNote } from "./place-frame.tsx";

/** Describes the exact file, folder, or network access a user approves. */
export function PermissionResource({
  resource,
}: {
  resource: ApprovalRequest["resources"][number];
}): ReactElement {
  return resource.kind === "network" ? (
    <PlaceNote>
      Network connections, including the internet, incoming connections, and services on this
      computer.
    </PlaceNote>
  ) : (
    <>
      <PlaceNote>
        {resource.access === "write" ? "Read and write" : "Read"}{" "}
        {resource.scope === "tree" ? "this folder and everything inside it" : "this file"}.
      </PlaceNote>
      <CodeWell code={resource.path} copyLabel="Copy approved path" />
    </>
  );
}
