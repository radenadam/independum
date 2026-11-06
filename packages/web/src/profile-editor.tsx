import type { ChatState, ModelSummary, ProfileResource } from "independum/api-types";
import { thinkingLevels } from "independum/api-types";
import { type ReactElement, useState } from "react";
import { AddedFactsDetail } from "./added-facts-detail.tsx";
import { SystemPromptDetail, ToolsDetail } from "./agent-details.tsx";
import { AttachmentSettingsDetail, NotesDetail } from "./attachment-settings-detail.tsx";
import { CodeWell } from "./code-well.tsx";
import { CompactionDetail } from "./compaction-detail.tsx";
import { ConfigurationIssues } from "./configuration-issues.tsx";
import { ContextResourcesDetail } from "./context-resources-detail.tsx";
import { Disclosure } from "./disclosure.tsx";
import { MenuList } from "./menu-list.tsx";
import { ModelDetail } from "./model-detail.tsx";
import { ModelMenu } from "./model-menu.tsx";
import { PermissionDetail } from "./permission-detail.tsx";
import { PlaceNote } from "./place-frame.tsx";
import { PlaceSection } from "./place-section.tsx";
import { saveProfile } from "./profile-api.ts";
import { ProfileEditingNote } from "./profile-editing-note.tsx";
import { ProfileFiles } from "./profile-files.tsx";
import { TextButton } from "./text-button.tsx";
import { TextDialog } from "./text-dialog.tsx";
import { TextField } from "./text-field.tsx";
import { useAgentSettings } from "./use-agent-settings.ts";

interface ProfileEditorProps {
  profile: ProfileResource;
  chat: ChatState | undefined;
  models: ModelSummary[] | undefined;
  onChanged: () => void;
}

/** Edits one profile with the same tool, fact, and text controls used by Session. */
export function ProfileEditor({
  profile,
  chat,
  models,
  onChanged,
}: ProfileEditorProps): ReactElement {
  const context: ChatState = chat ?? {
    pending: { revision: 0, isPaused: false, items: [], error: null },
    leafId: null,
    whileReplying: "queue",
    id: "profile-editor",
    folder: "",
    model: null,
    thinking: null,
    messages: [],
    isReplying: false,
    reply: [],
    toolRuns: {},
    isCompacting: false,
    compactionError: null,
    contextVersion: 0,
    backgroundCommands: [],
  };
  const settings = useAgentSettings(context, profile);
  const [nameEdit, setNameEdit] = useState<{ name: string; revision: string }>();
  const [failure, setFailure] = useState<string>();
  const bundle = settings.agent?.configuration?.profile.document ?? profile.document;
  const model = bundle?.profile.settings?.model;

  function save(
    document: NonNullable<ProfileResource["document"]>["profile"],
    revision?: string,
  ): void {
    if (bundle === null) {
      return;
    }
    const target = settings.agent?.configuration?.profile ?? profile;
    saveProfile(target, { ...bundle, profile: document }, revision ?? target.revision).then(
      () => {
        if (revision !== undefined) {
          setNameEdit(undefined);
        }
        onChanged();
      },
      (error: unknown) =>
        setFailure(error instanceof Error ? error.message : "The profile could not be saved."),
    );
  }

  return (
    <>
      <PlaceSection heading="Profile">
        <ProfileEditingNote profile={profile} />
        <Disclosure label="Effective values and sources">
          <CodeWell
            code={JSON.stringify(settings.agent?.configuration?.sources ?? {}, null, 2)}
            copyLabel="Copy effective values and sources"
          />
        </Disclosure>
        <ConfigurationIssues issues={profile.issues} />
        <Disclosure label="Permissions">
          <PermissionDetail settings={settings} project={context.folder} />
        </Disclosure>
        {(failure ?? settings.failure) ? (
          <PlaceNote>{failure ?? settings.failure}</PlaceNote>
        ) : null}
        {bundle === null ? null : (
          <>
            <TextField
              id="profile-name"
              label="Name"
              value={nameEdit?.name ?? bundle.profile.name}
              onChange={(name) =>
                setNameEdit((current) => ({
                  name,
                  revision:
                    current?.revision ??
                    settings.agent?.configuration?.profile.revision ??
                    profile.revision,
                }))
              }
            />
            <TextButton
              label="Save name"
              onClick={() =>
                save(
                  { ...bundle.profile, name: nameEdit?.name ?? bundle.profile.name },
                  nameEdit?.revision,
                )
              }
            />
          </>
        )}
      </PlaceSection>
      {bundle === null ? null : (
        <>
          <PlaceSection heading="Model and effort defaults">
            <PlaceNote>These choices apply when a chat has no explicit choice.</PlaceNote>
            <Disclosure
              label={model == null ? "No model chosen" : `${model.providerId}, ${model.modelId}`}
            >
              <ModelMenu
                models={models}
                current={model == null ? null : { providerId: model.providerId, id: model.modelId }}
                thinking={null}
                onChoose={(chosen) =>
                  save({
                    ...bundle.profile,
                    settings: {
                      ...bundle.profile.settings,
                      model: { providerId: chosen.providerId, modelId: chosen.id },
                    },
                  })
                }
                onChooseThinking={async () => undefined}
                onManageLogins={() =>
                  setFailure("Add a login in Settings, then return to this profile.")
                }
              />
              <TextButton
                label="Clear model default"
                onClick={() =>
                  save({ ...bundle.profile, settings: { ...bundle.profile.settings, model: null } })
                }
              />
            </Disclosure>
            <Disclosure
              label={`Thinking effort: ${bundle.profile.settings?.thinkingLevel ?? "Automatic"}`}
            >
              <MenuList
                groups={[
                  {
                    key: "effort",
                    choices: [null, ...thinkingLevels].map((level) => ({
                      key: level ?? "automatic",
                      name: level ?? "Automatic",
                      isCurrent: (bundle.profile.settings?.thinkingLevel ?? null) === level,
                      onChoose: () =>
                        save({
                          ...bundle.profile,
                          settings: { ...bundle.profile.settings, thinkingLevel: level },
                        }),
                    })),
                  },
                ]}
                layout="row"
                emptyNote="No effort choices."
              />
            </Disclosure>
          </PlaceSection>
          <SystemPromptDetail settings={settings} />
          <ToolsDetail settings={settings} />
          <AttachmentSettingsDetail settings={settings} />
          <NotesDetail settings={settings} />
          <AddedFactsDetail settings={settings} />
          <ContextResourcesDetail settings={settings} />
          <ModelDetail
            settings={settings}
            model={models?.find(
              (entry) => entry.providerId === model?.providerId && entry.id === model.modelId,
            )}
          />
          <CompactionDetail settings={settings} chat={context} isProfileEditor />
        </>
      )}
      <ProfileFiles profile={profile} onChanged={onChanged} />
      {settings.editing === undefined ? null : (
        <TextDialog
          title={settings.editing}
          target={`Editing ${profile.document?.profile.name ?? profile.reference.id}. ${profile.reference.scope} profile. ${profile.path}`}
          texts={settings.textsOf(settings.editing)}
          parameters={
            settings.agent?.tools.find((tool) => tool.name === settings.editing)?.parameters
          }
          onSave={(texts) => settings.save({ texts }).then(onChanged)}
          onClose={() => settings.setEditing(undefined)}
        />
      )}
    </>
  );
}
