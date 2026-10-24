import type { ReactElement } from "react";
import styles from "./text-field.module.css";

/** Properties of a text field. */
interface TextFieldProps {
  id: string;
  label: string;
  value: string;
  onChange: (value: string) => void;
  isSecret?: boolean;
  placeholder?: string;
}

/** Draws a labeled, underlined text field in the Margin style. */
export function TextField({
  id,
  label,
  value,
  onChange,
  isSecret = false,
  placeholder,
}: TextFieldProps): ReactElement {
  return (
    <div className={styles.group}>
      <label className={styles.label} htmlFor={id}>
        {label}
      </label>
      <input
        id={id}
        className={styles.field}
        type={isSecret ? "password" : "text"}
        value={value}
        placeholder={placeholder}
        autoComplete="off"
        spellCheck={false}
        onChange={(event) => onChange(event.target.value)}
      />
    </div>
  );
}
