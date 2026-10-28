import type { TextSummary } from "independum/api-types";
import { fillText, slotNamesOf } from "independum/text-slots";
import { type ReactElement, useRef, useState } from "react";
import { Badge } from "./badge.tsx";
import { IconButton } from "./icon-button.tsx";
import { TextButton } from "./text-button.tsx";
import styles from "./text-editor.module.css";

/** Properties of a text editor. */
interface TextEditorProps {
  text: TextSummary;
  draft: string;
  type: string | undefined;
  onChange: (draft: string) => void;
}

// A field starts tall enough for its text at about this many characters a row, and browsers that
// can size a field to its content grow it as the text grows.
const rowLength = 64;

/**
 * Draws one model text to edit: when the model gets it, the text itself, the slots it can hold
 * with a preview filled with examples, and a way back to the built-in text.
 */
export function TextEditor({ text, draft, type, onChange }: TextEditorProps): ReactElement {
  const field = useRef<HTMLTextAreaElement>(null);
  const [isKept, setIsKept] = useState(false);
  const names = slotNamesOf(draft);
  const missing = text.slots.filter((slot) => !names.includes(slot.name));
  const unknown = names.filter((name) => !text.slots.some((slot) => slot.name === name));
  const examples = Object.fromEntries(text.slots.map((slot) => [slot.name, slot.example]));
  const id = `text-${text.id}`;
  const isBuiltInNew = text.editedFrom !== null && !isKept && draft === text.text;

  // A slot goes where the cursor stands, in place of any selected text.
  function insert(name: string): void {
    const start = field.current?.selectionStart ?? draft.length;
    const end = field.current?.selectionEnd ?? start;
    const slot = `{${name}}`;
    onChange(`${draft.slice(0, start)}${slot}${draft.slice(end)}`);
    requestAnimationFrame(() => {
      field.current?.focus();
      field.current?.setSelectionRange(start + slot.length, start + slot.length);
    });
  }

  return (
    <div className={styles.editor}>
      <div className={styles.head}>
        <span className={styles.title}>
          <label
            htmlFor={id}
            className={text.section === "parameter" ? styles.parameter : styles.label}
          >
            {text.label}
          </label>
          {type === undefined ? null : <span className={styles.type}>{type}</span>}
        </span>
        {draft === text.builtIn ? null : (
          <>
            <Badge label="edited" tone="quiet" />
            <IconButton
              icon="reset"
              label="Reset to the built-in text"
              size="small"
              tipAlign="end"
              onClick={() => onChange(text.builtIn)}
            />
          </>
        )}
      </div>
      {isBuiltInNew ? (
        <div className={styles.changed}>
          <p className={styles.changedNote}>
            Independum has a new built-in text since this one was edited:
          </p>
          <p className={styles.builtIn}>{text.builtIn}</p>
          <div className={styles.choices}>
            <TextButton label="Use the new built-in" onClick={() => onChange(text.builtIn)} />
            <TextButton
              label="Keep mine"
              onClick={() => {
                setIsKept(true);
                onChange(draft);
              }}
            />
          </div>
        </div>
      ) : null}
      <textarea
        ref={field}
        id={id}
        className={styles.field}
        value={draft}
        rows={rowsOf(draft)}
        spellCheck={false}
        onChange={(event) => onChange(event.target.value)}
      />
      {text.slots.length === 0 ? null : (
        <>
          <ul className={styles.slots} aria-label="Slots">
            {text.slots.map((slot) => (
              <li key={slot.name} className={styles.slot}>
                <button
                  type="button"
                  className={styles.slotName}
                  aria-label={`Insert {${slot.name}}`}
                  onClick={() => insert(slot.name)}
                >
                  {`{${slot.name}}`}
                </button>
                <span>{slot.meaning}</span>
              </li>
            ))}
          </ul>
          <div className={styles.preview}>
            <span className={styles.previewLabel}>Preview</span>
            <p className={styles.previewText}>{fillText(draft, examples)}</p>
          </div>
        </>
      )}
      {missing.map((slot) => (
        <p key={slot.name} className={styles.warning}>
          {`{${slot.name}} is gone, so the model no longer gets it.`}
        </p>
      ))}
      {unknown.map((name) => (
        <p key={name} className={styles.warning}>
          {`{${name}} is not a slot, so the model reads it as written.`}
        </p>
      ))}
    </div>
  );
}

function rowsOf(text: string): number {
  const rows = text
    .split("\n")
    .reduce((sum, line) => sum + Math.max(1, Math.ceil(line.length / rowLength)), 0);
  return Math.min(14, Math.max(2, rows));
}
