import { type ReactElement, useState } from "react";
import { PlaceNote } from "./place-frame.tsx";
import { TextButton } from "./text-button.tsx";
import { TextField } from "./text-field.tsx";
import styles from "./text-list-setting.module.css";

/** Properties of an ordered list setting with immediate additions and removals. */
interface TextListSettingProps {
  id: string;
  label: string;
  values: string[];
  onChange: (values: string[]) => void;
}

/** Draws individual values and a field that adds one value at a time. */
export function TextListSetting({
  id,
  label,
  values,
  onChange,
}: TextListSettingProps): ReactElement {
  const [draft, setDraft] = useState("");
  const isDuplicate = values.includes(draft);
  return (
    <div className={styles.setting}>
      {values.length === 0 ? null : (
        <ul className={styles.list} aria-label={`${label} list`}>
          {values.map((value) => (
            <li key={value} className={styles.item}>
              <code className={styles.value}>{value}</code>
              <TextButton
                label="Remove"
                onClick={() => onChange(values.filter((each) => each !== value))}
              />
            </li>
          ))}
        </ul>
      )}
      <form
        className={styles.add}
        onSubmit={(event) => {
          event.preventDefault();
          if (draft.trim() !== "" && !isDuplicate) {
            onChange([...values, draft]);
            setDraft("");
          }
        }}
      >
        <TextField id={id} label={label} value={draft} onChange={setDraft} />
        <TextButton label="Add" isSubmit />
      </form>
      {isDuplicate ? <PlaceNote>This value is already in the list.</PlaceNote> : null}
    </div>
  );
}
