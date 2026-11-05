import type { ComposePreview } from "independum/api-types";
import type { ReactElement } from "react";
import { CodeWell } from "./code-well.tsx";
import styles from "./command-preview.module.css";
import { Disclosure } from "./disclosure.tsx";
import { OneLineTitle } from "./one-line-title.tsx";
import { PlaceNote } from "./place-frame.tsx";
import { PlaceSection } from "./place-section.tsx";
import { TextButton } from "./text-button.tsx";

/** Properties of the captured command above an editable message. */
interface CommandPreviewProps {
  preview: ComposePreview;
  isEdited: boolean;
  onRestore: () => void;
}

/** Draws the original command and its captured details above the message that Send submits. */
export function CommandPreview({
  preview,
  isEdited,
  onRestore,
}: CommandPreviewProps): ReactElement {
  return (
    <div className={styles.preview}>
      <Disclosure
        label={
          <span className={styles.label}>
            Command preview{isEdited ? " (edited)" : ""}
            <code>
              <OneLineTitle text={preview.invocation} />
            </code>
          </span>
        }
      >
        <div className={styles.details}>
          <PlaceSection heading="Original command">
            <CodeWell code={preview.invocation} copyLabel="Copy original command" />
          </PlaceSection>
          <PlaceSection heading="Values after the command">
            {preview.arguments === "" ? (
              <PlaceNote>No values follow this command.</PlaceNote>
            ) : (
              <CodeWell code={preview.arguments} copyLabel="Copy command values" />
            )}
          </PlaceSection>
          <PlaceSection heading="Original message text">
            <CodeWell code={preview.text} copyLabel="Copy original message text" />
          </PlaceSection>
          <PlaceSection heading="File fingerprint">
            <PlaceNote>
              The SHA-256 fingerprint identifies the file used for this preview.
            </PlaceNote>
            <CodeWell code={preview.fingerprint} copyLabel="Copy command fingerprint" />
          </PlaceSection>
          <PlaceNote>
            This preview expires at {new Date(preview.expires).toLocaleString()}.
          </PlaceNote>
          <TextButton label="Restore command" onClick={onRestore} />
        </div>
      </Disclosure>
      <PlaceNote>Send submits the text shown in the message box.</PlaceNote>
    </div>
  );
}
