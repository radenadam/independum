import type { ContextResource, ContextSettings } from "independum/api-types";
import { piControls } from "independum/read-context-settings";
import { type ReactElement, useState } from "react";
import { CodeWell } from "./code-well.tsx";
import styles from "./context-resources-detail.module.css";
import { Disclosure } from "./disclosure.tsx";
import { PlaceBox } from "./place-box.tsx";
import { PlaceNote } from "./place-frame.tsx";
import { PlaceSection } from "./place-section.tsx";
import { readResponse } from "./profile-api.ts";
import { requestApi } from "./request-api.ts";
import { TextButton } from "./text-button.tsx";
import { TextDialog } from "./text-dialog.tsx";
import { TextField } from "./text-field.tsx";
import { TextListSetting } from "./text-list-setting.tsx";
import { ToggleSwitch } from "./toggle-switch.tsx";
import type { AgentSettings } from "./use-agent-settings.ts";

/** Profile context controls with pending and captured resource revisions. */
interface ContextResourcesDetailProps {
  settings: AgentSettings;
}

/** Draws resource switches, discovery settings, exact sources, and captured revisions. */
export function ContextResourcesDetail({ settings }: ContextResourcesDetailProps): ReactElement {
  const context = settings.agent?.contextSettings;
  const [search, setSearch] = useState("");
  const [editingSource, setEditingSource] = useState<ContextResource | undefined>();
  if (context === undefined) {
    return <PlaceNote>Loading context controls.</PlaceNote>;
  }
  function save(next: ContextSettings): void {
    settings.change({ context: next });
  }
  const catalog = settings.agent?.resources;
  const captured = settings.agent?.lastContext;
  const resources = catalog?.resources.filter((resource) =>
    `${resource.name} ${resource.path} ${resource.description}`
      .toLowerCase()
      .includes(search.toLowerCase()),
  );
  return (
    <>
      <PlaceSection
        heading="Project instructions"
        mark={settings.markOf("Project instructions", false)}
      >
        <PlaceBox>
          <ContextSwitch
            label="Send project instructions"
            isOn={context.instructions.isEnabled}
            onChange={(isEnabled) =>
              save({ ...context, instructions: { ...context.instructions, isEnabled } })
            }
          />
        </PlaceBox>
        <PlaceNote>
          Instruction files are read from the project folder through the chat folder, never from
          folders above the project. References to other files stay as text. Files with exactly the
          same contents are included once.
        </PlaceNote>
        <TextListSetting
          id="instruction-names"
          label="Instruction filename"
          values={context.instructions.names}
          onChange={(names) =>
            save({ ...context, instructions: { ...context.instructions, names } })
          }
        />
        <ContextTextActions group="Project instructions" settings={settings} />
      </PlaceSection>
      <PlaceSection heading="Skills" mark={settings.markOf("Skills", false)}>
        <PlaceBox>
          <ContextSwitch
            label="Make skills available"
            isOn={context.skills.isEnabled}
            onChange={(isEnabled) => save({ ...context, skills: { ...context.skills, isEnabled } })}
          />
          <ContextSwitch
            label="Send skill names and descriptions"
            isOn={context.skills.isAdvertised}
            onChange={(isAdvertised) =>
              save({ ...context, skills: { ...context.skills, isAdvertised } })
            }
          />
        </PlaceBox>
        <PlaceNote>
          Available skills can be added to a message with a slash command. Sending their names and
          descriptions tells the model which skills exist without sending their full instructions.
          Turning skills off stops both.
        </PlaceNote>
        <TextListSetting
          id="skill-paths"
          label="Additional skill path"
          values={context.skills.paths}
          onChange={(paths) => save({ ...context, skills: { ...context.skills, paths } })}
        />
        <ContextTextActions group="Skills" settings={settings} />
      </PlaceSection>
      <PlaceSection heading="Slash commands">
        <PlaceBox>
          <ContextSwitch
            label="Enable slash commands"
            isOn={context.slashCommands.isEnabled}
            onChange={(isEnabled) =>
              save({ ...context, slashCommands: { ...context.slashCommands, isEnabled } })
            }
          />
        </PlaceBox>
        <PlaceNote>
          A command fills the message box with text that can be edited before sending. A skill is
          added with <code>/skill:name</code>. A message starting with <code>{"//"}</code> sends one
          leading slash as text. When slash commands are off, slash text is sent unchanged.
        </PlaceNote>
        <TextListSetting
          id="command-paths"
          label="Additional command path"
          values={context.slashCommands.paths}
          onChange={(paths) =>
            save({ ...context, slashCommands: { ...context.slashCommands, paths } })
          }
        />
        <Disclosure label="How commands use the words after their name">
          <PlaceNote>
            In a command file, <code>$1</code> is replaced by the first value after the command
            name. <code>$2</code> uses the second. <code>$ARGUMENTS</code> and <code>$@</code> use
            all the values, joined with spaces. Words inside quotes count as one value. Backslashes
            stay as written.
          </PlaceNote>
          <PlaceNote>
            A command file can also supply text for a missing value or use a range of values. For
            example, <code>$&#123;1:-world&#125;</code> uses <code>world</code> when the first value
            is missing or empty, and <code>$&#123;@:2:3&#125;</code> uses three values starting at
            the second.
          </PlaceNote>
        </Disclosure>
      </PlaceSection>
      <PlaceSection heading="Resource catalog">
        <TextField
          id="resource-search"
          label="Search resources"
          kind="search"
          value={search}
          onChange={setSearch}
        />
        {resources?.map((resource) => (
          <Disclosure
            key={resource.id}
            label={
              <span className={styles.resourceLabel}>
                <code>{resource.name}</code>
                <span className={styles.resourceState}>
                  {resource.state}. {resource.scope}.
                </span>
              </span>
            }
          >
            <CodeWell code={resource.path} copyLabel="Copy resource path" />
            {resource.reason === "" ? null : <PlaceNote>{resource.reason}</PlaceNote>}
            {captured?.resources.some(
              (previous) =>
                previous.id === resource.id && previous.fingerprint !== resource.fingerprint,
            ) ? (
              <PlaceNote>Changed on disk.</PlaceNote>
            ) : null}
            {resource.description === "" ? null : <PlaceNote>{resource.description}</PlaceNote>}
            {resource.fingerprint === "" || settings.agent?.chatId === undefined ? null : (
              <TextButton label="Edit file" onClick={() => setEditingSource(resource)} />
            )}
            <PlaceBox>
              <ResourceSwitch resource={resource} context={context} onSave={save} />
            </PlaceBox>
            <Disclosure label="File contents">
              {resource.source === "" ? (
                <PlaceNote>No file contents are available.</PlaceNote>
              ) : (
                <CodeWell code={resource.source} copyLabel="Copy source" />
              )}
            </Disclosure>
            <Disclosure label="Text added to the system prompt">
              {resource.insertedText === "" ? (
                <PlaceNote>This file adds no text to the system prompt.</PlaceNote>
              ) : (
                <CodeWell code={resource.insertedText} copyLabel="Copy inserted text" />
              )}
            </Disclosure>
            <Disclosure label="File details">
              <PlaceNote>File size: {resource.bytes.toLocaleString()} bytes.</PlaceNote>
              <PlaceNote>The SHA-256 fingerprint identifies the exact file contents.</PlaceNote>
              {resource.fingerprint === "" ? (
                <PlaceNote>No file fingerprint is available.</PlaceNote>
              ) : (
                <CodeWell code={resource.fingerprint} copyLabel="Copy file fingerprint" />
              )}
              {resource.kind === "skill" ? (
                <PlaceNote>
                  For skills, only the name, description, and <code>disable-model-invocation</code>
                  setting affect behavior. That setting hides a skill from the model's list while
                  keeping it available through a slash command. Other file details have no effect.
                </PlaceNote>
              ) : null}
              <CodeWell
                code={JSON.stringify({ ...resource.metadata, aliases: resource.aliases }, null, 2)}
                copyLabel="Copy metadata"
              />
            </Disclosure>
          </Disclosure>
        ))}
        {catalog?.resources.length === 0 ? (
          <PlaceNote>No instruction files, skills, or commands are found.</PlaceNote>
        ) : resources?.length === 0 ? (
          <PlaceNote>No resources match your search.</PlaceNote>
        ) : null}
      </PlaceSection>
      <PlaceSection heading="Request revisions">
        <PlaceNote>
          {captured == null
            ? "No request has used these resources yet."
            : captured.revision === catalog?.revision
              ? "The next request uses the same resources as the last request."
              : "Resource changes are pending for the next request."}
        </PlaceNote>
        <Disclosure label="Next request resources">
          <CodeWell code={JSON.stringify(catalog, null, 2)} copyLabel="Copy pending resources" />
        </Disclosure>
        {captured == null ? null : (
          <Disclosure label="Last request resources">
            <CodeWell
              code={JSON.stringify(captured, null, 2)}
              copyLabel="Copy captured resources"
            />
          </Disclosure>
        )}
      </PlaceSection>
      <PlaceSection heading="Pi context">
        <PlaceNote>
          Pi runs the conversation with the model. These switches control the text and actions it
          can add. A switch that is on allows an addition when it applies. It does not make Pi
          search for files. Texts of Pi lists additions that cannot be turned off and explains why.
        </PlaceNote>
        {piControls.map((control) => {
          const text =
            control.section === null ? undefined : settings.agent?.piSections?.[control.section];
          return (
            <Disclosure key={control.id} label={control.label}>
              <PlaceNote>
                {control.section === null ? (
                  "Pi controls this addition through its conversation settings."
                ) : (
                  <>
                    Pi includes this text in its system prompt, in the{" "}
                    <code>{control.section}</code> section.
                  </>
                )}
              </PlaceNote>
              {control.section === null ? null : text == null ? (
                <PlaceNote>No request has captured this section yet.</PlaceNote>
              ) : (
                <CodeWell code={text} copyLabel={`Copy ${control.label.toLowerCase()}`} />
              )}
              <PlaceBox>
                <ContextSwitch
                  label={`Allow ${control.label.toLowerCase()}`}
                  isOn={!context.pi.disabled.includes(control.id)}
                  onChange={(isOn) =>
                    save({
                      ...context,
                      pi: {
                        disabled: isOn
                          ? context.pi.disabled.filter((id) => id !== control.id)
                          : [...context.pi.disabled, control.id],
                      },
                    })
                  }
                />
              </PlaceBox>
            </Disclosure>
          );
        })}
      </PlaceSection>
      {editingSource === undefined ? null : (
        <TextDialog
          isSource
          title={`Edit ${editingSource.name}`}
          target={editingSource.path}
          parameters={undefined}
          texts={[
            {
              id: "source",
              group: "Source",
              section: "prompt",
              label: editingSource.path,
              text: editingSource.source,
              builtIn: editingSource.source,
              isEdited: false,
              editedFrom: null,
              slots: [],
            },
          ]}
          onClose={() => setEditingSource(undefined)}
          onSave={async (change) => {
            const chatId = settings.agent?.chatId;
            if (chatId === undefined) {
              throw new Error("The chat is not open.");
            }
            const draft = change.source;
            if (draft === undefined || draft === null) {
              return;
            }
            let content = draft.replace(/\r\n/g, "\n");
            if (editingSource.source.includes("\r\n")) {
              content = content.replaceAll("\n", "\r\n");
            }
            if (editingSource.source.startsWith("\uFEFF") && !content.startsWith("\uFEFF")) {
              content = `\uFEFF${content}`;
            }
            await readResponse(
              await requestApi(
                `/api/chats/${encodeURIComponent(chatId)}/resources/${editingSource.id}`,
                { method: "PUT", body: { fingerprint: editingSource.fingerprint, content } },
              ),
            );
          }}
        />
      )}
    </>
  );
}

function ContextTextActions({
  group,
  settings,
}: {
  group: string;
  settings: AgentSettings;
}): ReactElement {
  return (
    <div className={styles.actions}>
      <TextButton
        icon="edit"
        label={group === "Skills" ? "Edit skill texts" : "Edit instruction texts"}
        onClick={() => settings.setEditing(group)}
      />
      {settings.isEditedGroup(group) ? (
        <TextButton
          icon="reset"
          label="Reset texts to built-in"
          onClick={() => settings.change({ texts: settings.builtInTextsOf(group) })}
        />
      ) : null}
    </div>
  );
}

function ContextSwitch({
  label,
  isOn,
  onChange,
}: {
  label: string;
  isOn: boolean;
  onChange: (isOn: boolean) => void;
}): ReactElement {
  return (
    <div className={styles.switchRow}>
      <span className={styles.switchLabel}>{label}</span>
      <ToggleSwitch label={label} isOn={isOn} onChange={onChange} />
    </div>
  );
}

function ResourceSwitch({
  resource,
  context,
  onSave,
}: {
  resource: ContextResource;
  context: ContextSettings;
  onSave: (context: ContextSettings) => void;
}): ReactElement {
  const key =
    resource.kind === "skill"
      ? "skills"
      : resource.kind === "command"
        ? "slashCommands"
        : "instructions";
  const disabled = context[key].disabledPaths;
  return (
    <ContextSwitch
      label={
        resource.kind === "instructions"
          ? "Send this file"
          : resource.kind === "skill"
            ? "Use this skill"
            : "Use this command"
      }
      isOn={!disabled.includes(resource.path)}
      onChange={(isOn) =>
        onSave({
          ...context,
          [key]: {
            ...context[key],
            disabledPaths: isOn
              ? disabled.filter((path) => path !== resource.path)
              : [...disabled, resource.path],
          },
        })
      }
    />
  );
}
