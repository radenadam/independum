import type { ModelSummary } from "independum/api-types";
import { type ReactElement, useEffect, useState } from "react";
import { IconButton } from "./icon-button.tsx";
import { PlaceNote } from "./place-frame.tsx";
import { PlaceSection } from "./place-section.tsx";
import { TextField } from "./text-field.tsx";
import type { AgentSettings } from "./use-agent-settings.ts";

/** Properties of the model's knowledge cutoff field. */
interface KnowledgeCutoffFieldProps {
  model: ModelSummary;
  settings: AgentSettings;
}

/** Draws the cutoff set by the user for this provider and model, with a reset to unset. */
export function KnowledgeCutoffField({ model, settings }: KnowledgeCutoffFieldProps): ReactElement {
  const cutoffs = settings.agent?.knowledgeCutoffs ?? {};
  const saved = cutoffs[model.providerId]?.[model.id] ?? "";
  const [draft, setDraft] = useState(saved);
  const [shown, setShown] = useState(saved);
  if (shown !== saved) {
    setShown(saved);
    setDraft(saved);
  }
  function save(value: string): void {
    const models = { ...cutoffs[model.providerId] };
    if (value === "") {
      delete models[model.id];
    } else {
      models[model.id] = value;
    }
    const next = { ...cutoffs, [model.providerId]: models };
    if (Object.keys(models).length === 0) {
      delete next[model.providerId];
    }
    settings.change({ knowledgeCutoffs: next });
  }
  useEffect(() => {
    if (draft === saved) {
      return;
    }
    const timer = setTimeout(() => save(draft), 600);
    return () => clearTimeout(timer);
  });
  return (
    <PlaceSection
      heading="Knowledge cutoff"
      mark={saved === "" ? undefined : "edited"}
      actions={
        saved === "" ? undefined : (
          <IconButton
            icon="reset"
            label="Reset the knowledge cutoff"
            size="small"
            onClick={() => {
              setDraft("");
              save("");
            }}
          />
        )
      }
    >
      <TextField
        id="knowledge-cutoff"
        label="Cutoff"
        value={draft}
        onChange={setDraft}
        placeholder="Not set"
      />
      <PlaceNote>
        Pi has no knowledge cutoff for this model. This value is sent only for this provider and
        model, while its added fact is on.
      </PlaceNote>
      {settings.failure === undefined ? null : <PlaceNote>{settings.failure}</PlaceNote>}
    </PlaceSection>
  );
}
