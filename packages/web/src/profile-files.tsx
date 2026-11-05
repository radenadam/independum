import type { ProfileResource } from "independum/api-types";
import { type ReactElement, useEffect, useState } from "react";
import { CodeWell } from "./code-well.tsx";
import { DiffView } from "./diff-view.tsx";
import { Disclosure } from "./disclosure.tsx";
import { PlaceNote } from "./place-frame.tsx";
import { PlaceSection } from "./place-section.tsx";
import { saveProfile } from "./profile-api.ts";
import styles from "./profile-files.module.css";
import { TextButton } from "./text-button.tsx";

interface ProfileFilesProps {
  profile: ProfileResource;
  onChanged: () => void;
}

/** Keeps file drafts and their original revision while showing external edits for review. */
export function ProfileFiles({ profile, onChanged }: ProfileFilesProps): ReactElement {
  const [base, setBase] = useState(profile);
  const [draft, setDraft] = useState(JSON.stringify(profile.document, null, 2));
  const [failure, setFailure] = useState<string>();
  const isDirty = draft !== JSON.stringify(base.document, null, 2);
  const hasChanged = base.revision !== profile.revision;
  useEffect(() => {
    if (!isDirty) {
      setBase(profile);
      setDraft(JSON.stringify(profile.document, null, 2));
    }
  }, [profile, isDirty]);
  function save(revision: string): void {
    saveProfile(profile, draft, revision).then(
      (saved) => {
        setBase(saved);
        setDraft(JSON.stringify(saved.document, null, 2));
        setFailure(undefined);
        onChanged();
      },
      (error: unknown) => {
        setFailure(error instanceof Error ? error.message : "The files could not be saved.");
        onChanged();
      },
    );
  }
  return (
    <PlaceSection heading="Profile files">
      <Disclosure label="Files and sources">
        <PlaceNote>
          Profile settings come from profile.json at /settings. Omitted settings follow their
          built-in values. SYSTEM.md supplies the base prompt. model-texts.json supplies text edits
          at /texts.
        </PlaceNote>
        {Object.entries(profile.files ?? {}).map(([name, text]) => (
          <div key={name}>
            <PlaceNote>{name}</PlaceNote>
            <CodeWell code={text ?? "File absent"} copyLabel={`Copy ${name}`} />
          </div>
        ))}
      </Disclosure>
      <Disclosure label="Edit the file bundle">
        <PlaceNote>
          A null systemPrompt or modelTexts removes its optional file. An empty systemPrompt keeps
          an empty SYSTEM.md.
        </PlaceNote>
        {hasChanged && isDirty ? (
          <PlaceNote>
            The files changed in another editor. This draft keeps its original revision.
          </PlaceNote>
        ) : null}
        <textarea
          className={styles.field}
          aria-label="Profile file bundle"
          rows={16}
          value={draft}
          spellCheck={false}
          onChange={(event) => setDraft(event.target.value)}
        />
        {failure === undefined ? null : <PlaceNote>{failure}</PlaceNote>}
        <TextButton label="Save files" onClick={() => save(base.revision)} />
        <TextButton
          label="Reload files"
          onClick={() => {
            setBase(profile);
            setDraft(JSON.stringify(profile.document, null, 2));
            setFailure(undefined);
          }}
        />
        {hasChanged && isDirty ? (
          <Disclosure label="Review file conflict">
            <CodeWell
              code={JSON.stringify(base.document, null, 2)}
              copyLabel="Copy original bundle"
            />
            <DiffView
              path={profile.path}
              hunks={[
                {
                  oldStart: 1,
                  newStart: 1,
                  lines: [
                    ...JSON.stringify(profile.document, null, 2)
                      .split("\n")
                      .map((line) => `-${line}`),
                    ...draft.split("\n").map((line) => `+${line}`),
                  ],
                },
              ]}
            />
            <TextButton label="Save reviewed draft" onClick={() => save(profile.revision)} />
          </Disclosure>
        ) : null}
      </Disclosure>
    </PlaceSection>
  );
}
