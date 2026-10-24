import type { ChatState, ModelSummary } from "independum/api-types";
import { type ReactElement, useState } from "react";
import { CommandButton } from "./command-button.tsx";
import styles from "./model-picker.module.css";
import { PickList } from "./pick-list.tsx";
import { ScreenHeading } from "./screen-heading.tsx";
import { TextField } from "./text-field.tsx";

/** Properties of the model picker. */
interface ModelPickerProps {
  models: ModelSummary[] | undefined;
  current: ChatState["model"];
  onChoose: (model: ModelSummary) => void;
  onClose?: () => void;
}

/** The models of one provider, in the order the API lists them. */
interface ProviderModels {
  providerId: string;
  providerName: string;
  models: ModelSummary[];
}

/** Draws the models of every provider with a login, grouped by provider, with a search field. */
export function ModelPicker({
  models,
  current,
  onChoose,
  onClose,
}: ModelPickerProps): ReactElement {
  const [query, setQuery] = useState("");
  const search = query.trim().toLowerCase();
  const all = models ?? [];
  const shown = all.filter((model) =>
    `${model.name} ${model.id} ${model.providerName}`.toLowerCase().includes(search),
  );

  return (
    <section className={styles.picker} aria-label="Choose a model">
      <ScreenHeading
        title="Choose a model."
        intro="These come from the providers you are logged in to. The chat uses the model you choose from its next message on."
        command={
          onClose === undefined ? null : (
            <CommandButton shortcut="x" label="Close" onClick={onClose} isQuiet />
          )
        }
      />
      <TextField
        id="model-search"
        label="search models"
        value={query}
        onChange={setQuery}
        placeholder="type a name"
      />
      {groupByProvider(shown).map((group) => (
        <div key={group.providerId} className={styles.group}>
          <h2 className={styles.provider}>{group.providerName}</h2>
          <PickList
            entries={group.models.map((model) => ({
              id: model.id,
              name: model.name,
              detail: model.id,
              isDetailMarked: false,
            }))}
            pickedId={current?.providerId === group.providerId ? current.id : undefined}
            onPick={(id) => {
              const picked = group.models.find((model) => model.id === id);
              if (picked !== undefined) {
                onChoose(picked);
              }
            }}
          />
        </div>
      ))}
      <p className={styles.note}>
        {models === undefined
          ? "Loading the models."
          : all.length === 0
            ? "No models yet. Log in to a provider first."
            : `${shown.length} of ${all.length} models.`}
      </p>
    </section>
  );
}

function groupByProvider(models: ModelSummary[]): ProviderModels[] {
  const groups = new Map<string, ProviderModels>();
  for (const model of models) {
    const group = groups.get(model.providerId) ?? {
      providerId: model.providerId,
      providerName: model.providerName,
      models: [],
    };
    group.models.push(model);
    groups.set(model.providerId, group);
  }
  return [...groups.values()];
}
