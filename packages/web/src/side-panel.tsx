import type { ChatState, ContextSummary, ModelSummary } from "independum/api-types";
import { type ReactElement, useEffect, useEffectEvent, useState } from "react";
import { AgentPlace } from "./agent-place.tsx";
import { ContextPlace } from "./context-place.tsx";
import { Icon } from "./icon.tsx";
import { IconButton } from "./icon-button.tsx";
import { PlaceSection } from "./place-section.tsx";
import { shortcuts } from "./shortcut.ts";
import styles from "./side-panel.module.css";
import { SlidingColumn } from "./sliding-column.tsx";
import { SlidingTitle } from "./sliding-title.tsx";

/** Properties of the side panel. */
interface SidePanelProps {
  isOpen: boolean;
  chat: ChatState;
  context: ContextSummary | undefined;
  models: ModelSummary[] | undefined;
  placeRequest: PlaceRequest | undefined;
  onHide: () => void;
}

/** A request from outside the panel to open a place, such as Context from its meter. */
export interface PlaceRequest {
  place: "agent" | "context";
  at: number;
}

/** A place that opens in a side panel tab, or a new tab that lists the places. */
type TabPlace = "new" | "agent" | "context";

/** One tab of the side panel. */
interface Tab {
  id: number;
  place: TabPlace;
}

const titles: Record<TabPlace, string> = { new: "New tab", agent: "Agent", context: "Context" };
const icons = { new: "newTab", agent: "agent", context: "context" } as const;
// The places that a new tab offers, in the order it lists them.
const places = ["agent", "context"] as const;

/** Draws the side panel with its tabs, where each tab holds a place such as Agent. */
export function SidePanel({
  isOpen,
  chat,
  context,
  models,
  placeRequest,
  onHide,
}: SidePanelProps): ReactElement {
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

  // A requested place comes to the front in the tab that already holds it, takes over a new tab in
  // front, or opens in a tab of its own.
  const openRequested = useEffectEvent((place: TabPlace): void => {
    const holding = tabs.find((tab) => tab.place === place);
    if (holding !== undefined) {
      setActiveId(holding.id);
    } else if (active?.place === "new") {
      openPlace(place);
    } else {
      const id = Math.max(...tabs.map((tab) => tab.id)) + 1;
      setTabs([...tabs, { id, place }]);
      setActiveId(id);
    }
  });

  useEffect(() => {
    if (placeRequest !== undefined) {
      openRequested(placeRequest.place);
    }
  }, [placeRequest]);

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
                <SlidingTitle text={titles[tab.place]} />
              </button>
              <IconButton
                icon="close"
                label={`Close ${titles[tab.place]}`}
                size="tiny"
                isBlended
                onClick={() => closeTab(tab.id)}
              />
            </div>
          ))}
          <IconButton icon="add" label="New tab" size="small" onClick={addTab} />
        </div>
        <IconButton
          icon="sidePanel"
          label="Hide side panel"
          shortcut={shortcuts.sidePanel}
          tipAlign="end"
          onClick={onHide}
        />
      </div>
      <div className={styles.content} role="tabpanel">
        <div key={`${active?.id}-${active?.place}`} className={styles.view}>
          {active?.place === "agent" ? (
            <AgentPlace chat={chat} models={models} />
          ) : active?.place === "context" ? (
            <ContextPlace context={context} />
          ) : (
            <div className={styles.newTab}>
              <PlaceSection heading="Open in this tab">
                <div className={styles.places}>
                  {places.map((place) => (
                    <button
                      key={place}
                      type="button"
                      className={styles.place}
                      onClick={() => openPlace(place)}
                    >
                      <Icon name={icons[place]} size={16} />
                      {titles[place]}
                    </button>
                  ))}
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
