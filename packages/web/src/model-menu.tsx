import type { ChatState, ModelSummary } from "independum/api-types";
import { type ReactElement, useState } from "react";
import { EffortSlider } from "./effort-slider.tsx";
import { type MenuGroup, MenuList } from "./menu-list.tsx";
import styles from "./model-menu.module.css";
import { ProviderLogo } from "./provider-logo.tsx";
import { TextField } from "./text-field.tsx";

/** Properties of the model menu. */
interface ModelMenuProps {
  models: ModelSummary[] | undefined;
  current: ChatState["model"];
  thinking: ChatState["thinking"];
  onChoose: (model: ModelSummary) => void;
  onChooseThinking: (level: string) => void;
  onManageLogins: () => void;
}

/**
 * Draws a search field, the thinking effort of the current model, and the models of every provider
 * with a login, grouped by provider.
 */
export function ModelMenu({
  models,
  current,
  thinking,
  onChoose,
  onChooseThinking,
  onManageLogins,
}: ModelMenuProps): ReactElement {
  const [query, setQuery] = useState("");
  const search = query.trim().toLowerCase();
  const shown = (models ?? []).filter((model) =>
    `${model.name} ${model.id} ${model.providerName}`.toLowerCase().includes(search),
  );

  return (
    <>
      <TextField
        id="model-search"
        label="Search models"
        kind="search"
        value={query}
        onChange={setQuery}
        isFocusedFirst
      />
      {thinking === null ? null : <EffortSlider thinking={thinking} onChoose={onChooseThinking} />}
      <MenuList
        groups={groupByProvider(shown, current, onChoose)}
        layout="row"
        emptyNote={
          models === undefined
            ? "Loading the models."
            : models.length === 0
              ? "No models yet. Add a login first."
              : "No models match."
        }
      />
      <div className={styles.footer}>
        <button type="button" className={styles.logins} onClick={onManageLogins}>
          Add or manage logins
        </button>
      </div>
    </>
  );
}

function groupByProvider(
  models: ModelSummary[],
  current: ChatState["model"],
  onChoose: (model: ModelSummary) => void,
): MenuGroup[] {
  const groups = new Map<string, MenuGroup>();
  for (const model of models) {
    const group: MenuGroup = groups.get(model.providerId) ?? {
      key: model.providerId,
      heading: model.providerName,
      logo: <ProviderLogo providerId={model.providerId} size={14} keepsSpace />,
      choices: [],
    };
    group.choices.push({
      key: model.id,
      name: model.name,
      detail: model.id,
      isCurrent: model.providerId === current?.providerId && model.id === current.id,
      onChoose: () => onChoose(model),
    });
    groups.set(model.providerId, group);
  }
  return [...groups.values()];
}
