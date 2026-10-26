import { type ReactElement, useEffect, useRef } from "react";
import { hasKeyboard } from "./has-keyboard.ts";
import { Icon } from "./icon.tsx";
import styles from "./search-field.module.css";

/** Properties of a search field. */
interface SearchFieldProps {
  label: string;
  value: string;
  onChange: (value: string) => void;
  isFocusedFirst?: boolean;
}

/** Draws a search field with a lens, which can take the cursor as soon as it appears. */
export function SearchField({
  label,
  value,
  onChange,
  isFocusedFirst = false,
}: SearchFieldProps): ReactElement {
  const field = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (isFocusedFirst && hasKeyboard()) {
      field.current?.focus();
    }
  }, [isFocusedFirst]);

  return (
    <label className={styles.search}>
      <Icon name="search" />
      <span className={styles.label}>{label}</span>
      <input
        ref={field}
        className={styles.field}
        type="search"
        placeholder={label}
        value={value}
        onChange={(event) => onChange(event.target.value)}
      />
    </label>
  );
}
