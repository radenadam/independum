import type { ProfileResource } from "independum/api-types";
import type { ReactElement } from "react";
import { CodeWell } from "./code-well.tsx";
import { PlaceNote } from "./place-frame.tsx";
import styles from "./profile-editing-note.module.css";

/** Draws the profile being edited, its affected chats, and its copyable folder path. */
export function ProfileEditingNote({ profile }: { profile: ProfileResource }): ReactElement {
  const count = profile.usedBy.length;
  return (
    <div className={styles.note}>
      <PlaceNote>
        You are editing the {profile.document?.profile.name ?? profile.reference.id}{" "}
        {profile.reference.scope} profile used by {count} {count === 1 ? "chat" : "chats"}.
      </PlaceNote>
      <CodeWell code={profile.path} copyLabel="Copy profile folder" />
    </div>
  );
}
