import type {
  ChatState,
  ModelSummary,
  ProfileReference,
  ProfileResource,
} from "independum/api-types";
import { type ReactElement, useCallback, useEffect, useState } from "react";
import { ChoiceGroup } from "./choice-group.tsx";
import { PlaceBox } from "./place-box.tsx";
import { PlaceNote } from "./place-frame.tsx";
import { PlaceRow } from "./place-row.tsx";
import { PlaceSection } from "./place-section.tsx";
import { fetchProfiles, type ProfileList, saveProfile, saveProfileDefault } from "./profile-api.ts";
import { ProfileEditor } from "./profile-editor.tsx";
import { ProfileSelector } from "./profile-selector.tsx";
import { TextButton } from "./text-button.tsx";
import { TextField } from "./text-field.tsx";

interface ProfilesSectionProps {
  chat: ChatState | undefined;
  models: ModelSummary[] | undefined;
}

/** Manages complete user and project profiles and the user default in Settings. */
export function ProfilesSection({ chat, models }: ProfilesSectionProps): ReactElement {
  const [list, setList] = useState<ProfileList>();
  const [selected, setSelected] = useState<ProfileReference>();
  const [failure, setFailure] = useState<string>();
  const [id, setId] = useState("");
  const [name, setName] = useState("");
  const [scope, setScope] = useState<"user" | "project">("user");
  const [isCreating, setIsCreating] = useState(false);
  const folder = chat?.folder;
  const load = useCallback((): void => {
    fetchProfiles()
      .then(async (initial) => {
        const projectId = initial.projects.find((project) => project.folder === folder)?.id;
        const next = projectId === undefined ? initial : await fetchProfiles(projectId);
        setList((current) => (JSON.stringify(current) === JSON.stringify(next) ? current : next));
      })
      .catch((error: unknown) =>
        setFailure(error instanceof Error ? error.message : "The profiles could not be loaded."),
      );
  }, [folder]);
  useEffect(() => {
    load();
    const timer = setInterval(load, 1000);
    return () => clearInterval(timer);
  }, [load]);
  const profile = list?.profiles.find(
    (entry) => entry.reference.id === selected?.id && entry.reference.scope === selected.scope,
  );

  function create(source?: ProfileResource): void {
    if (list === undefined) {
      return;
    }
    const projectId =
      list.projects.find((project) => project.folder === folder)?.id ?? list.projects[0]?.id ?? "";
    const target: ProfileResource = {
      path: "",
      projectId,
      reference: { scope, id },
      revision: "*",
      document: null,
      issues: [],
      usedBy: [],
    };
    const bundle = source?.document ?? {
      profile: { formatVersion: 1, name },
      systemPrompt: null,
      modelTexts: null,
    };
    saveProfile(target, { ...bundle, profile: { ...bundle.profile, name } }, "*").then(
      () => {
        setSelected(target.reference);
        setIsCreating(false);
        load();
      },
      (error: unknown) =>
        setFailure(error instanceof Error ? error.message : "The profile could not be created."),
    );
  }

  return (
    <>
      {failure === undefined ? null : <PlaceNote>{failure}</PlaceNote>}
      {list?.user.issues.map((issue) => (
        <PlaceNote key={issue.file}>
          {issue.file}
          {issue.pointer}: {issue.message}
        </PlaceNote>
      ))}
      {list === undefined ? (
        <PlaceNote>Loading profiles.</PlaceNote>
      ) : (
        <>
          <PlaceSection heading="Default for new chats">
            <ProfileSelector
              label="User default"
              profiles={list.profiles.filter((entry) => entry.reference.scope === "user")}
              current={list.user.document?.defaultProfile ?? null}
              onChoose={(reference) => {
                saveProfileDefault(list.user, reference).then(load, (error: unknown) =>
                  setFailure(String(error)),
                );
              }}
            />
            <PlaceNote>Project and user defaults apply to new chats.</PlaceNote>
          </PlaceSection>
          <PlaceSection heading="Profiles">
            <PlaceBox>
              {list.profiles.map((entry) => (
                <PlaceRow
                  key={`${entry.reference.scope}:${entry.reference.id}`}
                  label={entry.document?.profile.name ?? entry.reference.id}
                  glance={`${entry.reference.scope} profile${entry.issues.length === 0 ? "" : ", unavailable"}`}
                  isBoxed
                  isCurrent={
                    entry.reference.id === selected?.id && entry.reference.scope === selected.scope
                  }
                  onOpen={() => setSelected(entry.reference)}
                />
              ))}
            </PlaceBox>
            <TextButton label="New profile" onClick={() => setIsCreating(true)} />
          </PlaceSection>
          {isCreating ? (
            <PlaceSection heading="Create profile">
              <TextField id="new-profile-id" label="Profile id" value={id} onChange={setId} />
              <TextField
                id="new-profile-name"
                label="Profile name"
                value={name}
                onChange={setName}
              />
              <ChoiceGroup
                label="Profile scope"
                choices={[
                  { value: "user", label: "User" },
                  { value: "project", label: "Project" },
                ]}
                current={scope}
                onChoose={setScope}
              />
              <TextButton label="Create profile" onClick={() => create()} />
              {profile?.document == null ? null : (
                <TextButton label="Duplicate selected profile" onClick={() => create(profile)} />
              )}
              <TextButton label="Cancel" onClick={() => setIsCreating(false)} />
            </PlaceSection>
          ) : null}
          {profile === undefined ? null : (
            <ProfileEditor
              key={`${profile.reference.scope}:${profile.reference.id}`}
              profile={profile}
              chat={chat}
              models={models}
              onChanged={load}
            />
          )}
        </>
      )}
    </>
  );
}
