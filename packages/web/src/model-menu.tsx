import type { ChatState, ModelSummary } from "independum/api-types";
import { type ReactElement, useState } from "react";
import { type MenuGroup, MenuList } from "./menu-list.tsx";
import styles from "./model-menu.module.css";
import { SearchField } from "./search-field.tsx";

/** Properties of the model menu. */
interface ModelMenuProps {
  models: ModelSummary[] | undefined;
  current: ChatState["model"];
  onChoose: (model: ModelSummary) => void;
  onManageLogins: () => void;
}

/** Draws the models of every provider with a login, grouped by provider, with a search field. */
export function ModelMenu({
  models,
  current,
  onChoose,
  onManageLogins,
}: ModelMenuProps): ReactElement {
  const [query, setQuery] = useState("");
  const search = query.trim().toLowerCase();
  const shown = (models ?? []).filter((model) =>
    `${model.name} ${model.id} ${model.providerName}`.toLowerCase().includes(search),
  );

  return (
    <>
      <SearchField label="Search models" value={query} onChange={setQuery} isFocusedFirst />
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
    const group = groups.get(model.providerId) ?? {
      key: model.providerId,
      heading: model.providerName,
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
