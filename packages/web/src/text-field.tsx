import { type ReactElement, useEffect, useRef } from "react";
import { hasKeyboard } from "./has-keyboard.ts";
import { Icon } from "./icon.tsx";
import styles from "./text-field.module.css";

/** Properties of a text field. */
interface TextFieldProps {
  id: string;
  label: string;
  value: string;
  onChange: (value: string) => void;
  kind?: "text" | "secret" | "search" | "number";
  placeholder?: string;
  isFocusedFirst?: boolean;
}

/**
 * Draws a text field on one line, which hides a secret as it is typed, shows a search with a lens
 * and its label as the placeholder, and offers the digits of a phone keyboard for a number.
 */
export function TextField({
  id,
  label,
  value,
  onChange,
  kind = "text",
  placeholder,
  isFocusedFirst = false,
}: TextFieldProps): ReactElement {
  const field = useRef<HTMLInputElement>(null);
  const isSearch = kind === "search";

  useEffect(() => {
    if (isFocusedFirst && hasKeyboard()) {
      field.current?.focus();
    }
  }, [isFocusedFirst]);

  return (
    <div className={styles.field}>
      <label className={isSearch ? styles.hiddenLabel : styles.label} htmlFor={id}>
        {label}
      </label>
      <div className={styles.box}>
        {isSearch ? <Icon name="search" /> : null}
        <input
          ref={field}
          id={id}
          className={styles.input}
          type={kind === "secret" ? "password" : kind === "number" ? "text" : kind}
          inputMode={kind === "number" ? "numeric" : undefined}
          value={value}
          placeholder={placeholder ?? (isSearch ? label : undefined)}
          autoComplete="off"
          spellCheck={false}
          onChange={(event) => onChange(event.target.value)}
        />
      </div>
    </div>
  );
}
