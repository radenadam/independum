import type { ChatState, ModelSummary } from "independum/api-types";
import { type ReactElement, useState } from "react";
import { AgentPlace } from "./agent-place.tsx";
import { Icon } from "./icon.tsx";
import { IconButton } from "./icon-button.tsx";
import { PlaceSection } from "./place-section.tsx";
import { shortcuts } from "./shortcut.ts";
import styles from "./side-panel.module.css";
import { SlidingColumn } from "./sliding-column.tsx";

/** Properties of the side panel. */
interface SidePanelProps {
  isOpen: boolean;
  chat: ChatState;
  models: ModelSummary[] | undefined;
  onHide: () => void;
}

/** A place that opens in a side panel tab, or a new tab that lists the places. */
type TabPlace = "new" | "agent";

/** One tab of the side panel. */
interface Tab {
  id: number;
  place: TabPlace;
}

const titles: Record<TabPlace, string> = { new: "New tab", agent: "Agent" };
const icons = { new: "newTab", agent: "agent" } as const;

/** Draws the side panel with its tabs, where each tab holds a place such as Agent. */
export function SidePanel({ isOpen, chat, models, onHide }: SidePanelProps): ReactElement {
  const [tabs, setTabs] = useState<Tab[]>([{ id: 1, place: "new" }]);
  const [activeId, setActiveId] = useState(1);
  const active = tabs.find((tab) => tab.id === activeId) ?? tabs[0];

  function addTab(): void {
    const id = Math.max(...tabs.map((tab) => tab.id)) + 1;
    setTabs([...tabs, { id, place: "new" }]);
    setActiveId(id);
  }

  // Closing the last tab closes the panel, which opens again with a new tab.
  function closeTab(id: number): void {
    const rest = tabs.filter((tab) => tab.id !== id);
    if (rest.length === 0) {
      const fresh = Math.max(...tabs.map((tab) => tab.id)) + 1;
      setTabs([{ id: fresh, place: "new" }]);
      setActiveId(fresh);
      onHide();
      return;
    }
    setTabs(rest);
    if (id === activeId) {
      setActiveId(rest.at(-1)?.id ?? rest[0]?.id ?? id);
    }
  }

  function openPlace(place: TabPlace): void {
    setTabs(tabs.map((tab) => (tab.id === activeId ? { ...tab, place } : tab)));
  }

  return (
    <SlidingColumn element="aside" label="Side panel" edge="end" isOpen={isOpen}>
      <div className={styles.top}>
        <div className={styles.tabs} role="tablist" aria-label="Panel tabs">
          {tabs.map((tab) => (
            <div key={tab.id} className={styles.tab} data-active={tab.id === active?.id}>
              <button
                type="button"
                role="tab"
                className={styles.tabButton}
                aria-selected={tab.id === active?.id}
                onClick={() => setActiveId(tab.id)}
              >
                <Icon name={icons[tab.place]} size={15} />
                {titles[tab.place]}
              </button>
              <IconButton
                icon="close"
                label={`Close ${titles[tab.place]}`}
                size="tiny"
                onClick={() => closeTab(tab.id)}
              />
            </div>
          ))}
          <IconButton icon="add" label="New tab" size="small" onClick={addTab} />
        </div>
        <IconButton
          icon="sidePanel"
          label="Close panel"
          shortcut={shortcuts.sidePanel}
          tipAlign="end"
          onClick={onHide}
        />
      </div>
      <div className={styles.content} role="tabpanel">
        <div key={`${active?.id}-${active?.place}`} className={styles.view}>
          {active?.place === "agent" ? (
            <AgentPlace chat={chat} models={models} />
          ) : (
            <div className={styles.newTab}>
              <PlaceSection heading="Open in this tab">
                <div className={styles.places}>
                  <button type="button" className={styles.place} onClick={() => openPlace("agent")}>
                    <Icon name="agent" size={16} />
                    Agent
                  </button>
                </div>
              </PlaceSection>
              <p className={styles.note}>
                A terminal, a browser, files, and more will open here later.
              </p>
            </div>
          )}
        </div>
      </div>
    </SlidingColumn>
  );
}
