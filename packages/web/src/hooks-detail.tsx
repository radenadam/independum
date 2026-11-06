import type { ScriptHook } from "independum/hook-contract";
import { type ReactElement, useState } from "react";
import { ChoiceGroup } from "./choice-group.tsx";
import { CodeWell } from "./code-well.tsx";
import { Disclosure } from "./disclosure.tsx";
import { FactTable } from "./fact-table.tsx";
import styles from "./hooks-detail.module.css";
import { PlaceNote } from "./place-frame.tsx";
import { PlaceSection } from "./place-section.tsx";
import { requestApi } from "./request-api.ts";
import { TextButton } from "./text-button.tsx";
import { ToggleSwitch } from "./toggle-switch.tsx";
import type { AgentSettings } from "./use-agent-settings.ts";

/** Shows ordered script hooks, their switches, and exact invocation evidence. */
export function HooksDetail({ settings }: { settings: AgentSettings }): ReactElement {
  const [failure, setFailure] = useState<string>();
  const summary = settings.agent?.hooks;
  if (summary === undefined) {
    return <PlaceNote>Loading hooks.</PlaceNote>;
  }
  function changeHook(hook: ScriptHook, change: Partial<ScriptHook>): void {
    settings.change({
      hooks:
        summary?.hooks.map((entry) => (entry.id === hook.id ? { ...entry, ...change } : entry)) ??
        [],
    });
  }
  async function reload(): Promise<void> {
    setFailure(undefined);
    try {
      const response = await requestApi(
        `/api/chats/${encodeURIComponent(settings.agent?.chatId ?? "")}/hooks/reload`,
        { method: "POST", revision: summary?.revision ?? "" },
      );
      if (!response.ok) {
        const body = (await response.json()) as { error: string };
        throw new Error(body.error);
      }
    } catch (error) {
      setFailure(error instanceof Error ? error.message : "The scripts could not reload.");
    }
  }
  return (
    <PlaceSection heading="Hooks">
      <PlaceNote>
        {summary.hooks.length} configured. {summary.hooks.length - summary.disabledHooks.length}{" "}
        enabled.
      </PlaceNote>
      <PlaceNote>
        A hook is a script that runs at a chosen point in a message, model request, or tool call.
      </PlaceNote>
      <PlaceNote>
        Hooks and their limits are saved in <code>profile.json</code> in the profile folder shown
        above.
      </PlaceNote>
      <PlaceNote>
        Independum checks the program and script files it has already used. A changed file stops the
        next run until you reload scripts. Reloading is blocked while a hook is running.
      </PlaceNote>
      <TextButton
        label="Reload scripts"
        onClick={() => {
          reload();
        }}
      />
      <TextButton label="Edit hook failure text" onClick={() => settings.setEditing("Hooks")} />
      {failure === undefined ? null : <PlaceNote>{failure}</PlaceNote>}
      {summary.hooks.map((hook) => {
        const eventHooks = summary.hooks.filter((entry) => entry.event === hook.event);
        const order = summary.hookOrder[hook.event] ?? eventHooks.map((entry) => entry.id);
        const position = order.indexOf(hook.id);
        const invocations = summary.invocations
          .filter((record) => record.hookId === hook.id)
          .reverse();
        return (
          <div key={hook.id} className={styles.card}>
            <div className={styles.head}>
              <span className={styles.name}>{hook.id}</span>
              <ToggleSwitch
                label={`Use ${hook.id}`}
                isOn={!summary.disabledHooks.includes(hook.id)}
                onChange={(isEnabled) =>
                  settings.change({
                    disabledHooks: [
                      ...summary.disabledHooks.filter((id) => id !== hook.id),
                      ...(isEnabled ? [] : [hook.id]),
                    ],
                  })
                }
              />
            </div>
            <FactTable
              columns={[""]}
              rows={[
                { name: "Event", values: [hook.event] },
                { name: "Mode", values: [hook.mode] },
                { name: "Order", values: [`${position + 1} of ${order.length}`] },
                {
                  name: "Tool filter",
                  values: [
                    hook.match === undefined
                      ? "Every tool"
                      : hook.match.toolNames.join(", ") || "No tools",
                  ],
                },
                {
                  name: "Deadline",
                  values: [hook.timeoutMs === null ? "None" : `${hook.timeoutMs ?? 10000} ms`],
                },
                { name: "Last invocation", values: [invocations[0]?.status ?? "Never run"] },
              ]}
            />
            <div className={styles.setting}>
              <span className={styles.settingLabel}>When this hook fails</span>
              <ChoiceGroup
                label="When this hook fails"
                current={hook.onError ?? (hook.mode === "observe" ? "continue" : "stop")}
                choices={[
                  { value: "stop", label: "Stop" },
                  { value: "continue", label: "Continue" },
                ]}
                onChoose={(onError) => changeHook(hook, { onError })}
              />
            </div>
            {position === 0 ? null : (
              <TextButton
                label={`Run ${hook.id} earlier`}
                onClick={() => {
                  const next = [...order];
                  const previous = next[position - 1];
                  if (previous !== undefined) {
                    next[position - 1] = hook.id;
                    next[position] = previous;
                  }
                  settings.change({ hookOrder: { ...summary.hookOrder, [hook.event]: next } });
                }}
              />
            )}
            {settings.textsOf(`Hook ${hook.id}`).length === 0 ? null : (
              <TextButton
                label={`Edit the texts of ${hook.id}`}
                onClick={() => settings.setEditing(`Hook ${hook.id}`)}
              />
            )}
            <Disclosure label="Script and limits">
              <CodeWell code={JSON.stringify(hook, null, 2)} copyLabel="Copy the hook definition" />
            </Disclosure>
            <Disclosure label={`Completed invocations of ${hook.id}`}>
              {invocations
                .filter((record) => record.status !== "running")
                .map((record) => (
                  <Disclosure key={record.id} label={`${record.input.startedAt} ${record.status}`}>
                    <FactTable
                      columns={[""]}
                      rows={[
                        { name: "Duration", values: [`${record.durationMs} ms`] },
                        {
                          name: "Exit code",
                          values: [
                            record.exitCode === null ? "No exit code" : String(record.exitCode),
                          ],
                        },
                        { name: "Script version", values: [String(record.generation)] },
                      ]}
                    />
                    {record.error === null ? null : <PlaceNote>{record.error}</PlaceNote>}
                    <Disclosure label="Exact input">
                      <CodeWell
                        code={JSON.stringify(record.input, null, 2)}
                        copyLabel="Copy the hook input"
                      />
                    </Disclosure>
                    <Disclosure label="Standard output">
                      <CodeWell code={record.stdout} copyLabel="Copy standard output" />
                    </Disclosure>
                    <Disclosure label="Standard error">
                      <CodeWell code={record.stderr} copyLabel="Copy standard error" />
                    </Disclosure>
                    <Disclosure label="Accepted changes">
                      <CodeWell
                        code={JSON.stringify(record.accepted, null, 2)}
                        copyLabel="Copy accepted changes"
                      />
                    </Disclosure>
                  </Disclosure>
                ))}
            </Disclosure>
          </div>
        );
      })}
    </PlaceSection>
  );
}
