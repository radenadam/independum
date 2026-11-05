import { type ReactElement, useState } from "react";
import styles from "./added-facts-detail.module.css";
import { Badge } from "./badge.tsx";
import { CodeWell } from "./code-well.tsx";
import { EditActions } from "./edit-actions.tsx";
import { PlaceBox } from "./place-box.tsx";
import { PlaceNote } from "./place-frame.tsx";
import { PlaceRow } from "./place-row.tsx";
import { PlaceSection } from "./place-section.tsx";
import { ToggleSwitch } from "./toggle-switch.tsx";
import type { AgentSettings } from "./use-agent-settings.ts";

/** Properties of the added facts of a request. */
interface AddedFactsDetailProps {
  settings: AgentSettings;
  selectedId?: string;
  sentText?: string;
}

/** Draws the added facts in one box, with a switch and text actions for each fact. */
export function AddedFactsDetail({
  settings,
  selectedId,
  sentText,
}: AddedFactsDetailProps): ReactElement {
  const [chosen, setChosen] = useState(selectedId);
  const { agent, markOf, change, setEditing, builtInTextsOf } = settings;
  const facts = agent?.addedFacts ?? [];
  const disabledFacts = facts.filter((fact) => !fact.isEnabled).map((fact) => fact.id);
  const selected = facts.find((fact) => fact.id === chosen);
  const text = chosen === selectedId && sentText !== undefined ? sentText : selected?.text;
  return (
    <>
      <PlaceSection heading="Added facts" badge="built-in">
        {settings.failure === undefined ? null : <PlaceNote>{settings.failure}</PlaceNote>}
        <PlaceBox>
          {facts.map((fact) => {
            const mark = markOf(fact.label, !fact.isEnabled);
            return (
              <div key={fact.id} className={styles.row}>
                <div className={styles.name}>
                  <PlaceRow
                    label={fact.label}
                    isBoxed
                    isCurrent={chosen === fact.id}
                    onOpen={() => setChosen(fact.id)}
                  />
                </div>
                {mark === undefined ? null : <Badge label={mark} tone="quiet" />}
                <EditActions
                  editLabel={`Edit ${fact.label.toLowerCase()}`}
                  resetLabel={`Reset ${fact.label.toLowerCase()} to built-in`}
                  isEdited={mark !== undefined}
                  onEdit={() => setEditing(fact.label)}
                  onReset={() =>
                    change({
                      texts: builtInTextsOf(fact.label),
                      disabledFacts: disabledFacts.filter((id) => id !== fact.id),
                    })
                  }
                />
                <ToggleSwitch
                  label={`Send ${fact.label.toLowerCase()}`}
                  isOn={fact.isEnabled}
                  onChange={(isOn) =>
                    change({
                      disabledFacts: isOn
                        ? disabledFacts.filter((id) => id !== fact.id)
                        : [...disabledFacts, fact.id],
                    })
                  }
                />
              </div>
            );
          })}
        </PlaceBox>
      </PlaceSection>
      {selected === undefined ? null : (
        <PlaceSection heading={selected.label}>
          <PlaceNote>{settings.textsOf(selected.label)[0]?.label}.</PlaceNote>
          {text === null || text === undefined ? (
            <PlaceNote>Set the knowledge cutoff in the detail of the model.</PlaceNote>
          ) : (
            <CodeWell code={text} copyLabel="Copy the fact" />
          )}
        </PlaceSection>
      )}
    </>
  );
}
