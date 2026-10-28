import type { OutputLimits } from "independum/api-types";
import { type ReactElement, useEffect, useState } from "react";
import styles from "./output-limit-fields.module.css";
import { PlaceNote } from "./place-frame.tsx";
import { TextField } from "./text-field.tsx";

/** Properties of the output limit fields. */
interface OutputLimitFieldsProps {
  limits: OutputLimits;
  onChange: (limits: OutputLimits) => void;
}

// A pair of valid limits saves itself this long after the typing stops.
const saveDelay = 600;
const lineRange = { min: 10, max: 1_000_000 };
const kilobyteRange = { min: 1, max: 102_400 };

/** Draws the two limits on the output of a tool, in lines and in kilobytes, which save as they change. */
export function OutputLimitFields({ limits, onChange }: OutputLimitFieldsProps): ReactElement {
  const [lines, setLines] = useState(String(limits.maxLines));
  const [kilobytes, setKilobytes] = useState(String(Math.round(limits.maxBytes / 1024)));
  const maxLines = Number(lines);
  const maxBytes = Number(kilobytes) * 1024;
  const isValid = isWithin(maxLines, lineRange) && isWithin(Number(kilobytes), kilobyteRange);
  const isChanged = maxLines !== limits.maxLines || maxBytes !== limits.maxBytes;

  useEffect(() => {
    if (!isValid || !isChanged) {
      return;
    }
    const timer = setTimeout(() => onChange({ maxLines, maxBytes }), saveDelay);
    return () => clearTimeout(timer);
  }, [isValid, isChanged, maxLines, maxBytes, onChange]);

  return (
    <>
      <div className={styles.fields}>
        <TextField
          id="output-lines"
          label="Lines"
          kind="number"
          value={lines}
          onChange={setLines}
        />
        <TextField
          id="output-kilobytes"
          label="Kilobytes"
          kind="number"
          value={kilobytes}
          onChange={setKilobytes}
        />
      </div>
      <PlaceNote>
        {isValid
          ? "Longer output reaches the model as its start and its end, with the path of a file that holds all of it."
          : "Lines go from 10 to 1,000,000, and kilobytes from 1 to 102,400."}
      </PlaceNote>
    </>
  );
}

function isWithin(value: number, range: { min: number; max: number }): boolean {
  return Number.isInteger(value) && value >= range.min && value <= range.max;
}
