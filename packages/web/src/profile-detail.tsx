import type { ChatState, ModelSummary, ProfileResource } from "independum/api-types";
import { type ReactElement, useCallback, useState } from "react";
import { CodeWell } from "./code-well.tsx";
import { ConfigurationIssues } from "./configuration-issues.tsx";
import { PlaceNote } from "./place-frame.tsx";
import { PlaceSection } from "./place-section.tsx";
import { fetchProfiles, switchProfile } from "./profile-api.ts";
import { ProfileEditor } from "./profile-editor.tsx";
import { ProfileSelector } from "./profile-selector.tsx";
import { TextButton } from "./text-button.tsx";
import type { AgentSettings } from "./use-agent-settings.ts";
import { useServerData } from "./use-server-data.ts";

interface ProfileDetailProps {
  chat: ChatState;
  models: ModelSummary[] | undefined;
  settings: AgentSettings;
}

/** Reviews a chat's resulting model and effort before switching its profile. */
export function ProfileDetail({ chat, models, settings }: ProfileDetailProps): ReactElement {
  const configuration = settings.agent?.configuration;
  const projectId = configuration?.profile.projectId;
  // Configuration events refresh the profile files.
  const loaded = useServerData(
    useCallback(() => fetchProfiles(projectId), [projectId]),
    chat.contextVersion,
  );
  const profiles = loaded.data?.profiles ?? [];
  const [candidate, setCandidate] = useState<ProfileResource>();
  const [failure, setFailure] = useState<string>();
  const shownFailure = failure ?? loaded.failure;
  if (configuration === undefined) {
    return <PlaceNote>Loading the selected profile.</PlaceNote>;
  }
  const profile =
    profiles.find(
      (entry) =>
        entry.reference.scope === configuration.profile.reference.scope &&
        entry.reference.id === configuration.profile.reference.id,
    ) ?? configuration.profile;
  return (
    <>
      <PlaceSection heading="Selected profile">
        <ProfileSelector
          label="Chat profile"
          profiles={profiles}
          current={configuration.profile.reference}
          onChoose={(reference) =>
            setCandidate(
              profiles.find(
                (entry) =>
                  entry.reference.scope === reference?.scope && entry.reference.id === reference.id,
              ),
            )
          }
        />
        <PlaceNote>
          The chat keeps this profile. Editing it reaches every chat that uses it after current work
          finishes.
        </PlaceNote>
        {configuration.pendingRevision === null ? null : (
          <PlaceNote>Profile changes are pending until Pi settles after queued work.</PlaceNote>
        )}
        <ConfigurationIssues
          issues={configuration.issues}
          note="New work waits for repair. The last applied setup stays visible."
        />
        {shownFailure === undefined ? null : <PlaceNote>{shownFailure}</PlaceNote>}
        {candidate === undefined ? null : (
          <>
            <PlaceNote>
              Switch to {candidate.document?.profile.name}. Model:{" "}
              {candidate.document?.profile.settings?.model?.modelId ?? "No model chosen"}. Effort:{" "}
              {candidate.document?.profile.settings?.thinkingLevel ?? "Automatic, resolved by Pi"}.
              Applying clears the chat's model and effort choices.
            </PlaceNote>
            <TextButton
              label="Apply profile"
              onClick={() => {
                switchProfile(chat.id, configuration, candidate.reference).then(
                  () => setCandidate(undefined),
                  (error: unknown) => setFailure(String(error)),
                );
              }}
            />
            <TextButton label="Cancel switch" onClick={() => setCandidate(undefined)} />
          </>
        )}
        <CodeWell code={configuration.choices.path} copyLabel="Copy chat settings path" />
      </PlaceSection>
      <ProfileEditor profile={profile} chat={chat} models={models} onChanged={loaded.reload} />
    </>
  );
}
