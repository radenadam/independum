import type { KeyboardEvent, ReactElement } from "react";
import styles from "./text-field.module.css";

/** Properties of a text field. */
interface TextFieldProps {
  id: string;
  label: string;
  value: string;
  onChange: (value: string) => void;
  isSecret?: boolean;
  isMultiline?: boolean;
  placeholder?: string;
  onKeyDown?: (event: KeyboardEvent<HTMLInputElement | HTMLTextAreaElement>) => void;
}

/** Draws a labeled, underlined text field in the Margin style, on one line or several. */
export function TextField({
  id,
  label,
  value,
  onChange,
  isSecret = false,
  isMultiline = false,
  placeholder,
  onKeyDown,
}: TextFieldProps): ReactElement {
  return (
    <div className={styles.group}>
      <label className={styles.label} htmlFor={id}>
        {label}
      </label>
      {isMultiline ? (
        <textarea
          id={id}
          className={`${styles.field} ${styles.multiline}`}
          rows={2}
          value={value}
          placeholder={placeholder}
          onKeyDown={onKeyDown}
          onChange={(event) => onChange(event.target.value)}
        />
      ) : (
        <input
          id={id}
          className={styles.field}
          type={isSecret ? "password" : "text"}
          value={value}
          placeholder={placeholder}
          autoComplete="off"
          spellCheck={false}
          onKeyDown={onKeyDown}
          onChange={(event) => onChange(event.target.value)}
        />
      )}
    </div>
  );
}
