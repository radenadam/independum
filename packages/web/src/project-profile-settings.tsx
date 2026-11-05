import { type ReactElement, useEffect, useState } from "react";
import { CodeWell } from "./code-well.tsx";
import { PlaceNote } from "./place-frame.tsx";
import { fetchProfiles, type ProfileList, saveProfileDefault } from "./profile-api.ts";
import { ProfileSelector } from "./profile-selector.tsx";

interface ProjectProfileSettingsProps {
  projectId: string;
}

/** Edits the default for new chats in the exact project folder. */
export function ProjectProfileSettings({ projectId }: ProjectProfileSettingsProps): ReactElement {
  const [list, setList] = useState<ProfileList>();
  const [failure, setFailure] = useState<string>();
  useEffect(() => {
    fetchProfiles(projectId).then(setList, (error: unknown) => setFailure(String(error)));
  }, [projectId]);
  return (
    <>
      {failure === undefined ? null : <PlaceNote>{failure}</PlaceNote>}
      {list === undefined ? (
        <PlaceNote>Loading project settings.</PlaceNote>
      ) : (
        <>
          <PlaceNote>This default applies to new chats in this folder.</PlaceNote>
          <ProfileSelector
            label="Project default"
            profiles={list.profiles}
            current={list.project.document?.profile ?? null}
            hasUserDefault
            onChoose={(reference) => {
              saveProfileDefault(list.project, reference, projectId)
                .then(() => fetchProfiles(projectId))
                .then(setList, (error: unknown) => setFailure(String(error)));
            }}
          />
          <CodeWell code={list.project.path} copyLabel="Copy project settings path" />
          {list.project.issues.map((issue) => (
            <PlaceNote key={issue.file}>
              {issue.file}
              {issue.pointer}: {issue.message}
            </PlaceNote>
          ))}
        </>
      )}
    </>
  );
}
