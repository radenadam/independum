import type { PiTextSummary } from "independum/api-types";
import type { ReactElement } from "react";
import { Badge } from "./badge.tsx";
import { CodeWell } from "./code-well.tsx";
import { Disclosure } from "./disclosure.tsx";
import styles from "./pi-text-list.module.css";
import { SlotList } from "./slot-list.tsx";

/** Properties of the list of the texts of Pi. */
interface PiTextListProps {
  texts: PiTextSummary[];
}

/**
 * Draws every text that Pi can send to the model, grouped by where the model gets it. Each one says
 * when Pi sends it and opens to its exact text and its slots, and a mark shows the texts in the
 * last request.
 */
export function PiTextList({ texts }: PiTextListProps): ReactElement {
  const groups = [...new Set(texts.map((text) => text.group))];
  return (
    <div className={styles.list}>
      {groups.map((group) => (
        <div key={group} className={styles.group}>
          <h4 className={styles.heading}>{group}</h4>
          {texts
            .filter((text) => text.group === group)
            .map((text) => (
              <Disclosure
                key={text.id}
                label={
                  <span className={styles.condition}>
                    {text.isInLastRequest ? (
                      <Badge label="in the last request" tone="signal" />
                    ) : null}
                    {text.condition}
                  </span>
                }
              >
                <CodeWell code={text.text} copyLabel="Copy the text" />
                {text.slots.length === 0 ? null : <SlotList slots={text.slots} />}
              </Disclosure>
            ))}
        </div>
      ))}
    </div>
  );
}
