import type { OutputLimits } from "independum/api-types";
import { outputKilobyteRange, outputLineRange } from "independum/output-limit-ranges";
import { type ReactElement, useEffect, useEffectEvent, useState } from "react";
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
const numberFormat = new Intl.NumberFormat("en-US");

/** Draws the two limits on the output of a tool, in lines and in kilobytes, which save as they change. */
export function OutputLimitFields({ limits, onChange }: OutputLimitFieldsProps): ReactElement {
  const [lines, setLines] = useState(String(limits.maxLines));
  const [kilobytes, setKilobytes] = useState(String(Math.round(limits.maxBytes / 1024)));
  // The fields follow the limits when they change elsewhere, such as with a reset.
  const limitsKey = `${limits.maxLines}:${limits.maxBytes}`;
  const [shownKey, setShownKey] = useState(limitsKey);
  if (shownKey !== limitsKey) {
    setShownKey(limitsKey);
    setLines(String(limits.maxLines));
    setKilobytes(String(Math.round(limits.maxBytes / 1024)));
  }
  const maxLines = Number(lines);
  const maxBytes = Number(kilobytes) * 1024;
  const isValid =
    isWithin(maxLines, outputLineRange) && isWithin(Number(kilobytes), outputKilobyteRange);
  const isChanged = maxLines !== limits.maxLines || maxBytes !== limits.maxBytes;
  const save = useEffectEvent(onChange);

  useEffect(() => {
    if (!isValid || !isChanged) {
      return;
    }
    const timer = setTimeout(() => save({ maxLines, maxBytes }), saveDelay);
    return () => clearTimeout(timer);
  }, [isValid, isChanged, maxLines, maxBytes]);

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
          : `Lines go from ${numberFormat.format(outputLineRange.min)} to ${numberFormat.format(outputLineRange.max)}, and kilobytes from ${numberFormat.format(outputKilobyteRange.min)} to ${numberFormat.format(outputKilobyteRange.max)}.`}
      </PlaceNote>
    </>
  );
}

function isWithin(value: number, range: { min: number; max: number }): boolean {
  return Number.isInteger(value) && value >= range.min && value <= range.max;
}
