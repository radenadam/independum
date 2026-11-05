import { type ReactElement, useEffect, useState } from "react";
import { Badge } from "./badge.tsx";
import { IconButton } from "./icon-button.tsx";
import styles from "./number-setting.module.css";
import { PlaceNote } from "./place-frame.tsx";
import { TextField } from "./text-field.tsx";

/** Properties of a number setting with its built-in value and reset. */
interface NumberSettingProps {
  id: string;
  label: string;
  value: number | null;
  builtIn: number | null;
  minimum?: number;
  isDecimal?: boolean;
  onChange: (value: number | null) => void;
}

/** Draws a number setting that saves after typing stops and resets to its built-in value. */
export function NumberSetting({
  id,
  label,
  value,
  builtIn,
  minimum = 1,
  isDecimal = false,
  onChange,
}: NumberSettingProps): ReactElement {
  const [text, setText] = useState(value === null ? "" : String(value));
  const [shown, setShown] = useState(value);
  if (shown !== value) {
    setShown(value);
    setText(value === null ? "" : String(value));
  }
  const next = text.trim() === "" ? builtIn : Number(text);
  const isValid =
    next === null ||
    (Number.isFinite(next) && next >= minimum && (isDecimal || Number.isSafeInteger(next)));
  useEffect(() => {
    if (!isValid || next === value) {
      return;
    }
    const timer = setTimeout(() => onChange(next), 600);
    return () => clearTimeout(timer);
  }, [isValid, next, value, onChange]);
  const isEdited = value !== builtIn;
  return (
    <div className={styles.setting}>
      <div className={styles.field}>
        <TextField
          id={id}
          label={label}
          kind={isDecimal ? "decimal" : "number"}
          value={text}
          onChange={setText}
          placeholder={builtIn === null ? "None" : String(builtIn)}
        />
        {isEdited ? <Badge label="edited" tone="quiet" /> : null}
        {isEdited ? (
          <IconButton
            icon="reset"
            label={`Reset ${label.toLowerCase()} to built-in`}
            size="small"
            onClick={() => {
              setText(builtIn === null ? "" : String(builtIn));
              onChange(builtIn);
            }}
          />
        ) : null}
      </div>
      <PlaceNote>Built-in: {builtIn === null ? "None" : builtIn.toLocaleString()}.</PlaceNote>
      {isValid ? null : (
        <PlaceNote>
          Enter {isDecimal ? "a finite number" : "a whole number"} of at least {minimum}.
        </PlaceNote>
      )}
    </div>
  );
}
