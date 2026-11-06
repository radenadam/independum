import { type ReactElement, useState } from "react";
import { ChoiceGroup } from "./choice-group.tsx";
import { CodeWell } from "./code-well.tsx";
import { ConfirmDialog } from "./confirm-dialog.tsx";
import { Disclosure } from "./disclosure.tsx";
import { PermissionResource } from "./permission-resource.tsx";
import { PlaceNote } from "./place-frame.tsx";
import { PlaceSection } from "./place-section.tsx";
import { requestApi } from "./request-api.ts";
import { TextButton } from "./text-button.tsx";
import { timeFormat } from "./time-format.ts";
import type { AgentSettings } from "./use-agent-settings.ts";

/** Shows permissions, denied paths, saved decisions, and the exact saved file. */
export function PermissionDetail({
  settings,
  project,
}: {
  settings: AgentSettings;
  project: string;
}): ReactElement {
  const [failure, setFailure] = useState<string>();
  const [removed, setRemoved] = useState<string[]>([]);
  const [isConfirmingUnrestricted, setIsConfirmingUnrestricted] = useState(false);
  const agent = settings.agent;
  const policy = agent?.permissions;
  if (policy === undefined || agent === undefined) {
    return <PlaceNote>Loading permissions.</PlaceNote>;
  }
  const canonicalProject = agent.permissionProject ?? project;
  const runtimes = [
    { label: "Shell", runtime: agent.sandbox },
    { label: "File tools", runtime: agent.fileSandbox },
  ];
  async function removeChatApproval(id: string): Promise<void> {
    try {
      const response = await requestApi(
        `/api/chats/${encodeURIComponent(agent?.chatId ?? "")}/permissions/${encodeURIComponent(id)}`,
        { method: "DELETE" },
      );
      if (!response.ok) {
        throw new Error("The saved chat approval could not be removed.");
      }
      setRemoved((previous) => [...previous, id]);
    } catch (error) {
      setFailure(error instanceof Error ? error.message : "The approval could not be removed.");
    }
  }
  return (
    <>
      <PlaceSection heading="Permission mode">
        <ChoiceGroup
          label="Permission mode"
          current={policy.mode}
          choices={[
            { value: "project", label: "Project" },
            {
              value: "unrestricted",
              label: "Unrestricted",
              unavailable:
                policy.rules.length > 0
                  ? "Remove saved rules from the profile file before choosing unrestricted mode."
                  : undefined,
            },
          ]}
          onChoose={(mode) => {
            if (mode === policy.mode) {
              return;
            }
            if (mode === "unrestricted") {
              setIsConfirmingUnrestricted(true);
              return;
            }
            settings.change({ permissions: { ...policy, mode } });
          }}
        />
        {isConfirmingUnrestricted ? (
          <ConfirmDialog
            title="Switch to unrestricted mode?"
            text="Commands and file tools in every chat that uses this profile then have all the access of your account, with no sandbox and no approvals."
            confirmLabel="Switch to unrestricted"
            onConfirm={() => {
              setIsConfirmingUnrestricted(false);
              settings.change({ permissions: { ...policy, mode: "unrestricted" } });
            }}
            onCancel={() => setIsConfirmingUnrestricted(false)}
          />
        ) : null}
        <PlaceNote>
          {policy.mode === "project"
            ? "Tools can read everywhere except denied paths and can change project files. Writes outside the project and network connections need approval unless a saved rule or approval allows them. A sandbox enforces these permissions while each program runs."
            : "Tools have the same access as your account. Project permissions and saved rules do not restrict them."}
        </PlaceNote>
        <PlaceNote>
          These settings belong to the selected profile. Programs that are already running keep the
          access they started with.
        </PlaceNote>
        <TextButton
          label="Edit permission texts"
          icon="edit"
          onClick={() => settings.setEditing("Permissions")}
        />
      </PlaceSection>
      <PlaceSection heading="Command environment">
        <PlaceNote>
          Environment variables are named values passed to a program when it starts.
        </PlaceNote>
        <ChoiceGroup
          label="Environment inheritance"
          current={policy.environment}
          choices={[
            { value: "minimal", label: "Minimal" },
            { value: "inherit", label: "Inherit everything" },
          ]}
          onChoose={(environment) => settings.change({ permissions: { ...policy, environment } })}
        />
        <PlaceNote>
          {policy.environment === "minimal"
            ? "Commands inherit only the names listed below when those values exist."
            : "Commands inherit all environment variables from Independum, including any secrets in them."}{" "}
          Variables set in this profile are added afterward. Independum's access token is always
          removed. File tools use the minimal list without the profile's variables.
        </PlaceNote>
        <Disclosure label="Exact minimal environment names">
          <CodeWell
            code={(agent.minimalEnvironmentNames ?? []).join("\n")}
            copyLabel="Copy minimal environment names"
          />
        </Disclosure>
      </PlaceSection>
      <PlaceSection heading="Sandbox boundary">
        <PlaceNote>
          System roots are readable without approval. Denied paths stay inaccessible.
        </PlaceNote>
        {runtimes.map(({ label, runtime }) =>
          runtime === undefined ? null : (
            <Disclosure key={label} label={`${label} sandbox details`}>
              {runtime.unavailable === null ? null : <PlaceNote>{runtime.unavailable}</PlaceNote>}
              <CodeWell
                code={runtime.readonlyPaths.join("\n")}
                copyLabel={`Copy ${label} system read roots`}
              />
              <PlaceNote>{runtime.implicitAccess}</PlaceNote>
              <CodeWell
                code={JSON.stringify(runtime, null, 2)}
                copyLabel={`Copy ${label} sandbox details`}
              />
            </Disclosure>
          ),
        )}
      </PlaceSection>
      <PlaceSection heading="Denied paths">
        <PlaceNote>
          In project mode, commands and file tools cannot access Independum's state folder, which
          holds the logins. Profile rules can deny more paths. An approval cannot override a denial.
        </PlaceNote>
        <CodeWell code={(agent.deniedPaths ?? []).join("\n")} copyLabel="Copy denied paths" />
        <PlaceNote>
          On Linux, the sandbox shows denied folders as empty. That view does not describe their
          actual contents.
        </PlaceNote>
      </PlaceSection>
      <PlaceSection heading="Saved approvals">
        <PlaceNote>
          Remove an approval to ask again on the next operation that needs it. Removing an approval
          does not stop a running program.
          {policy.rules.some((rule) => rule.effect === "deny")
            ? " Deny rules still apply, even to an approved access."
            : ""}
        </PlaceNote>
        {failure === undefined ? null : <PlaceNote>{failure}</PlaceNote>}
        {policy.savedApprovals.map((approval) => (
          <Disclosure
            key={approval.id}
            label={`${approval.resource.kind === "network" ? "Network" : approval.resource.access === "write" ? "Write path" : "Read path"} approved for project`}
          >
            <PermissionResource resource={approval.resource} />
            <PlaceNote>
              Always for this project, in this profile. Saved{" "}
              {timeFormat.format(new Date(approval.approvedAt))}.
            </PlaceNote>
            <CodeWell code={approval.project} copyLabel="Copy approval project" />
            <TextButton
              label="Remove project approval"
              onClick={() =>
                settings.change({
                  permissions: {
                    ...policy,
                    savedApprovals: policy.savedApprovals.filter(
                      (entry) => entry.id !== approval.id,
                    ),
                  },
                })
              }
            />
          </Disclosure>
        ))}
        {(agent.chatPermissionApprovals ?? [])
          .filter((approval) => !removed.includes(approval.id))
          .map((approval) => (
            <Disclosure
              key={approval.id}
              label={`${approval.resource.kind === "network" ? "Network" : "Path"} approved for this chat`}
            >
              <PermissionResource resource={approval.resource} />
              <PlaceNote>
                This chat only, until Independum stops. Saved{" "}
                {timeFormat.format(new Date(approval.approvedAt))}.
              </PlaceNote>
              <TextButton
                label="Remove chat approval"
                onClick={() => {
                  void removeChatApproval(approval.id);
                }}
              />
            </Disclosure>
          ))}
        {policy.savedApprovals.length +
          (agent.chatPermissionApprovals ?? []).filter((approval) => !removed.includes(approval.id))
            .length ===
        0 ? (
          <PlaceNote>No saved approvals.</PlaceNote>
        ) : null}
      </PlaceSection>
      <PlaceSection heading="Saved rules">
        {policy.rules.length === 0 ? (
          <PlaceNote>No saved rules. Project access uses the defaults described above.</PlaceNote>
        ) : (
          policy.rules.map((rule) => (
            <Disclosure
              key={rule.id}
              label={`${rule.effect === "allow" ? "Allow" : rule.effect === "ask" ? "Ask about" : "Deny"} ${rule.resource.kind === "network" ? "network access" : "path access"}`}
            >
              <PermissionResource resource={rule.resource} />
              <PlaceNote>
                {rule.project === "*"
                  ? "Applies to every project that uses this profile."
                  : "Applies to this project:"}
              </PlaceNote>
              {rule.project === "*" ? null : (
                <CodeWell code={rule.project} copyLabel="Copy rule project" />
              )}
              <TextButton
                label="Remove rule"
                onClick={() =>
                  settings.change({
                    permissions: {
                      ...policy,
                      rules: policy.rules.filter((entry) => entry.id !== rule.id),
                    },
                  })
                }
              />
            </Disclosure>
          ))
        )}
      </PlaceSection>
      <PlaceSection heading="Protected settings folders">
        <PlaceNote>
          Project settings stay in these folders. They stay readable, and changing them needs
          explicit approval, even when a rule allows writes to the surrounding folder.
        </PlaceNote>
        <CodeWell
          code={(agent.protectedConfigurationPaths ?? []).join("\n")}
          copyLabel="Copy protected settings folders"
        />
        <PlaceNote>
          The command cannot change these folders through its usual project access. If the sandbox
          cannot enforce a requested permission, the operation does not run.
        </PlaceNote>
      </PlaceSection>
      <Disclosure label="File as saved">
        <PlaceNote>
          The selected profile stores permissions in its <code>profile.json</code> file.
        </PlaceNote>
        <CodeWell code={agent.configuration?.profile.path ?? ""} copyLabel="Copy profile folder" />
        <CodeWell
          code={agent.configuration?.profile.files?.["profile.json"] ?? ""}
          copyLabel="Copy saved profile file"
        />
        <PlaceNote>Project folder</PlaceNote>
        <CodeWell code={canonicalProject} copyLabel="Copy permission project" />
      </Disclosure>
      <Disclosure label="What the sandbox protects">
        <PlaceNote>
          The sandbox restricts tool programs and the programs they start. Independum itself, Pi,
          and add-ons that run inside Independum are outside it. Data already passed to a program
          remains available to it. A file can have other names through hard links. A development
          server that reloads code changed by a tool is outside this protection. Permission changes
          do not undo file changes.
        </PlaceNote>
      </Disclosure>
    </>
  );
}
