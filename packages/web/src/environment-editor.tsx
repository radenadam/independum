import type { EnvironmentSuggestion } from "independum/api-types";
import { type ReactElement, useState } from "react";
import styles from "./environment-editor.module.css";
import { IconButton } from "./icon-button.tsx";
import { PlaceNote } from "./place-frame.tsx";
import { PlaceSection } from "./place-section.tsx";
import { TextField } from "./text-field.tsx";

/** Properties of the environment editor. */
interface EnvironmentEditorProps {
  environment: Record<string, string>;
  suggestions: EnvironmentSuggestion[];
  onChange: (environment: Record<string, string>) => void;
}

// A name of a variable starts with a letter or an underscore, as every shell accepts.
const namePattern = /^[A-Za-z_][A-Za-z0-9_]*$/;

/**
 * Draws the variables that the user adds to the environment of commands, each with a button that
 * takes it away, fields that add one, and suggestions that each add one with a click.
 */
export function EnvironmentEditor({
  environment,
  suggestions,
  onChange,
}: EnvironmentEditorProps): ReactElement {
  const [name, setName] = useState("");
  const [value, setValue] = useState("");
  const entries = Object.entries(environment);
  const isNameValid = namePattern.test(name);
  const offered = suggestions.filter((suggestion) => !Object.hasOwn(environment, suggestion.name));

  function add(added: string, addedValue: string): void {
    onChange({ ...environment, [added]: addedValue });
  }

  return (
    <div className={styles.editor}>
      <PlaceNote>
        Each command gets these variables on top of your own environment. The model reads their
        names, never their values.
      </PlaceNote>
      {entries.length === 0 ? null : (
        <ul className={styles.list}>
          {entries.map(([each, text]) => (
            <li key={each} className={styles.variable}>
              <code className={styles.pair}>{`${each}=${text}`}</code>
              <IconButton
                icon="delete"
                label={`Remove ${each}`}
                size="small"
                tipAlign="end"
                onClick={() =>
                  onChange(Object.fromEntries(entries.filter(([key]) => key !== each)))
                }
              />
            </li>
          ))}
        </ul>
      )}
      <div className={styles.fields}>
        <TextField id="environment-name" label="Name" value={name} onChange={setName} />
        <TextField id="environment-value" label="Value" value={value} onChange={setValue} />
        <div className={styles.add}>
          <IconButton
            icon="add"
            label="Add the variable"
            tipAlign="end"
            onClick={() => {
              if (isNameValid) {
                add(name, value);
                setName("");
                setValue("");
              }
            }}
          />
        </div>
      </div>
      {name === "" || isNameValid ? null : (
        <PlaceNote>
          A name starts with a letter or an underscore, and holds only letters, digits, and
          underscores.
        </PlaceNote>
      )}
      {offered.length === 0 ? null : (
        <PlaceSection heading="Suggestions">
          <ul className={styles.list}>
            {offered.map((suggestion) => (
              <li key={suggestion.name} className={styles.suggestion}>
                <code className={styles.pair}>{`${suggestion.name}=${suggestion.value}`}</code>
                <span className={styles.reason}>{suggestion.reason}</span>
                <span className={styles.addSuggestion}>
                  <IconButton
                    icon="add"
                    label={`Add ${suggestion.name}`}
                    size="small"
                    tipAlign="end"
                    onClick={() => add(suggestion.name, suggestion.value)}
                  />
                </span>
              </li>
            ))}
          </ul>
        </PlaceSection>
      )}
    </div>
  );
}
