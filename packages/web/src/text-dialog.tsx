import type { TextSection, TextSummary } from "independum/api-types";
import { type ReactElement, useState } from "react";
import { IconButton } from "./icon-button.tsx";
import { ModalDialog } from "./modal-dialog.tsx";
import { TextButton } from "./text-button.tsx";
import styles from "./text-dialog.module.css";
import { TextEditor } from "./text-editor.tsx";

/** Properties of a text dialog. */
interface TextDialogProps {
  isSource?: boolean;
  title: string;
  target?: string | undefined;
  texts: TextSummary[];
  parameters: unknown;
  onSave: (change: Record<string, string | null>) => Promise<void>;
  onClose: () => void;
}

const sections: { section: TextSection; heading: string | null }[] = [
  { section: "prompt", heading: null },
  { section: "description", heading: "Description" },
  { section: "parameter", heading: "Parameters" },
  { section: "result", heading: "Results" },
  { section: "note", heading: "Notes" },
];

// A text saved as its built-in text stops being an edit.
/**
 * Draws the model texts of one part of the agent over the page, grouped by when the model gets
 * them, and saves the ones that changed together.
 */
export function TextDialog({
  isSource = false,
  title,
  target,
  texts,
  parameters,
  onSave,
  onClose,
}: TextDialogProps): ReactElement {
  const [drafts, setDrafts] = useState<Record<string, string>>({});
  const [isSaving, setIsSaving] = useState(false);
  const [failure, setFailure] = useState<string | undefined>();
  const [saveDraft] = useState(() => onSave);

  function save(): void {
    const change = Object.fromEntries(
      texts.flatMap((text): [string, string | null][] => {
        const draft = drafts[text.id];
        return draft === undefined
          ? []
          : [[text.id, !isSource && draft === text.builtIn ? null : draft]];
      }),
    );
    if (Object.keys(change).length === 0) {
      onClose();
      return;
    }
    setIsSaving(true);
    setFailure(undefined);
    saveDraft(change).then(onClose, (error: unknown) => {
      setIsSaving(false);
      setFailure(error instanceof Error ? error.message : "The texts could not be saved.");
    });
  }

  return (
    <ModalDialog isOpen label={title} className={styles.dialog} isFullOnPhone onClose={onClose}>
      <div className={styles.frame}>
        <div className={styles.header}>
          <h2 className={styles.title}>{title}</h2>
          <IconButton icon="close" label="Close" size="small" tipAlign="end" onClick={onClose} />
        </div>
        <div className={styles.body}>
          {target === undefined ? null : <p className={styles.intro}>{target}</p>}
          <p className={styles.intro}>
            {isSource
              ? "Save the whole source file. The editor preserves its original line endings and byte order mark."
              : "The model reads these texts exactly as they stand here. A name in braces is a slot, and Independum puts its value there when it sends the text."}
          </p>
          {sections.map(({ section, heading }) => {
            const own = texts.filter((text) => text.section === section);
            return own.length === 0 ? null : (
              <section key={section} className={styles.section}>
                {heading === null ? null : <h3 className={styles.heading}>{heading}</h3>}
                {own.map((text) => (
                  <TextEditor
                    isSource={isSource}
                    key={text.id}
                    text={text}
                    draft={drafts[text.id] ?? text.text}
                    type={section === "parameter" ? typeOf(parameters, text.label) : undefined}
                    onChange={(draft) => setDrafts((current) => ({ ...current, [text.id]: draft }))}
                  />
                ))}
              </section>
            );
          })}
        </div>
        <div className={styles.footer}>
          {failure === undefined ? null : <p className={styles.failure}>{failure}</p>}
          <TextButton label="Cancel" onClick={onClose} />
          <TextButton label={isSaving ? "Saving" : "Save"} onClick={save} isPrimary />
        </div>
      </div>
    </ModalDialog>
  );
}

// A parameter reads as its type and whether the model must fill it in, as its schema says.
function typeOf(parameters: unknown, name: string): string | undefined {
  if (typeof parameters !== "object" || parameters === null) {
    return undefined;
  }
  const { properties, required } = parameters as {
    properties?: Record<string, { type?: unknown }>;
    required?: unknown;
  };
  const type = properties?.[name]?.type;
  if (typeof type !== "string") {
    return undefined;
  }
  const isRequired = Array.isArray(required) && required.includes(name);
  return `${type}, ${isRequired ? "required" : "optional"}`;
}
