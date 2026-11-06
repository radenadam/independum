import type { ApprovalRequest } from "independum/api-types";
import { type ReactElement, useState } from "react";
import styles from "./approval-actions.module.css";
import { CodeBlock } from "./code-block.tsx";
import { CodeWell } from "./code-well.tsx";
import { Disclosure } from "./disclosure.tsx";
import { PermissionResource } from "./permission-resource.tsx";
import { PlaceNote } from "./place-frame.tsx";
import { requestApi } from "./request-api.ts";
import { TextButton } from "./text-button.tsx";

/** How long an approval lasts. */
type Persistence = NonNullable<ApprovalRequest["persistences"]>[number];

/** One way to allow a request, with what it means. */
interface Choice {
  persistence: Persistence;
  label: string;
  meaning: string;
}

const listFormat = new Intl.ListFormat("en", { type: "conjunction" });

// The choices run from the narrowest to the widest and share one look, so none reads as the
// default. Deny comes last.
/** Shows what a request asks for, the command it would run, and each explicit approval choice. */
export function ApprovalActions({ approval }: { approval: ApprovalRequest }): ReactElement {
  const [failure, setFailure] = useState<string>();
  const [isSaving, setSaving] = useState(false);
  const required = approval.requiredResources ?? approval.resources;
  const persistences = approval.persistences ?? ["once"];
  const profile = `the ${approval.profileName} profile`;
  const command =
    approval.toolName === "Shell" && typeof approval.input.command === "string"
      ? approval.input.command
      : undefined;
  const allChoices: Choice[] = [
    {
      persistence: "once",
      label: "Allow once",
      meaning: "Allow once covers only this operation and the programs it starts.",
    },
    {
      persistence: "chat",
      label: "Allow for this chat",
      meaning: "Allow for this chat remembers this access in this chat until Independum stops.",
    },
    {
      persistence: "project",
      label: "Always for this project",
      meaning: `Always for this project saves this access for this project in ${profile}, the agent setup that this chat uses.`,
    },
  ];
  const choices = allChoices.filter((choice) => persistences.includes(choice.persistence));
  const saving = choices.filter(
    (choice) => choice.persistence === "chat" || choice.persistence === "project",
  );
  const meanings = [
    ...choices.map((choice) => choice.meaning),
    ...(saving.length > 0
      ? ["A remembered choice applies only when a command asks for the same access."]
      : []),
    "Deny skips the operation.",
  ];

  async function answer(decision: "allow" | "deny", persistence: Persistence): Promise<void> {
    if (isSaving) {
      return;
    }
    setSaving(true);
    setFailure(undefined);
    try {
      const response = await requestApi(`/api/approvals/${encodeURIComponent(approval.id)}`, {
        method: "POST",
        body: { revision: approval.revision, decision, persistence },
      });
      if (!response.ok) {
        const body = (await response.json()) as { error: string };
        setFailure(body.error);
      }
    } catch (error) {
      setFailure(error instanceof Error ? error.message : "The approval could not be answered.");
    } finally {
      setSaving(false);
    }
  }

  return (
    <div className={styles.approval} aria-busy={isSaving}>
      <strong>{headingOf(required)}</strong>
      {[...new Set(approval.reasons)].map((reason) => (
        <PlaceNote key={reason}>{reason}</PlaceNote>
      ))}
      {required.map((resource) => (
        <PermissionResource key={JSON.stringify(resource)} resource={resource} />
      ))}
      {command === undefined ? null : <CodeBlock language="shell" code={command} isFlush />}
      {approval.runtime === undefined ? null : (
        <Disclosure label="All access for this command">
          <PlaceNote>The command can read everywhere except the denied paths below.</PlaceNote>
          <CodeWell
            code={approval.runtime.readonlyPaths.join("\n")}
            copyLabel="Copy system read roots"
          />
          {approval.project === undefined ? null : (
            <>
              <PlaceNote>Project folder</PlaceNote>
              <CodeWell code={approval.project} copyLabel="Copy resolved project" />
            </>
          )}
          {approval.resources.map((resource) => (
            <PermissionResource key={JSON.stringify(resource)} resource={resource} />
          ))}
          <PlaceNote>
            {approval.resources.some((resource) => resource.kind === "network")
              ? "This command can use the network."
              : "This command cannot connect to the internet or other network services."}
          </PlaceNote>
          {!approval.readonlyPaths?.length ? null : (
            <>
              <PlaceNote>
                These settings folders stay readable, and the command cannot change them.
              </PlaceNote>
              <CodeWell
                code={approval.readonlyPaths.join("\n")}
                copyLabel="Copy protected settings folders"
              />
            </>
          )}
          {!approval.restrictions?.length ? null : (
            <>
              <PlaceNote>
                The command cannot access these paths. Linux shows denied folders as empty, which
                does not describe their actual contents.
              </PlaceNote>
              <CodeWell code={approval.restrictions.join("\n")} copyLabel="Copy blocked paths" />
            </>
          )}
          {!approval.matchingRules?.length ? null : (
            <Disclosure label="Matching saved rules">
              <CodeWell
                code={JSON.stringify(approval.matchingRules, null, 2)}
                copyLabel="Copy matching saved rules"
              />
            </Disclosure>
          )}
        </Disclosure>
      )}
      <PlaceNote>{meanings.join(" ")}</PlaceNote>
      <div className={styles.actions}>
        {choices.map((choice) => (
          <TextButton
            key={choice.persistence}
            label={choice.label}
            onClick={() => {
              void answer("allow", choice.persistence);
            }}
          />
        ))}
        <TextButton
          label="Deny"
          onClick={() => {
            void answer("deny", "once");
          }}
        />
      </div>
      {failure === undefined ? null : <PlaceNote>{failure}</PlaceNote>}
    </div>
  );
}

// The heading names each kind of access in the order of the reasons below it.
function headingOf(required: ApprovalRequest["resources"]): string {
  const names = new Set([
    ...required.map((resource) =>
      resource.kind === "network"
        ? "network access"
        : resource.scope === "tree"
          ? "folder access"
          : "file access",
    ),
  ]);
  const text = listFormat.format(names);
  return `${text.charAt(0).toUpperCase()}${text.slice(1)}`;
}
