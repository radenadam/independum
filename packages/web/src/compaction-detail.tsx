import type { ChatState, CompactionSettings } from "independum/api-types";
import { type ReactElement, useState } from "react";
import { compactChat } from "./chat-api.ts";
import { IconButton } from "./icon-button.tsx";
import { NumberSetting } from "./number-setting.tsx";
import { PlaceNote } from "./place-frame.tsx";
import { PlaceSection } from "./place-section.tsx";
import { ToggleSwitch } from "./toggle-switch.tsx";
import type { AgentSettings } from "./use-agent-settings.ts";

/** Properties of the compaction settings and action of the open chat. */
interface CompactionDetailProps {
  chat: ChatState;
  settings: AgentSettings;
  isProfileEditor?: boolean;
}

/** Returns whether the compaction settings differ from their built-in values. */
export function isCompactionChanged(settings: AgentSettings): boolean {
  const { agent } = settings;
  return (
    agent !== undefined &&
    Object.entries(agent.compaction).some(
      ([key, value]) => value !== agent.builtInCompaction[key as keyof CompactionSettings],
    )
  );
}

/** Draws the settings of automatic compaction and the action that compacts the open chat now. */
export function CompactionDetail({
  chat,
  settings,
  isProfileEditor = false,
}: CompactionDetailProps): ReactElement {
  const [failure, setFailure] = useState<string | undefined>();
  const { agent } = settings;
  if (agent === undefined) {
    return <PlaceNote>Loading the compaction settings.</PlaceNote>;
  }
  const current = agent.compaction;
  const builtIn = agent.builtInCompaction;
  const isEdited = isCompactionChanged(settings);
  return (
    <>
      <PlaceSection
        heading="Compaction"
        mark={isEdited ? "edited" : undefined}
        actions={
          <>
            {isEdited ? (
              <IconButton
                icon="reset"
                label="Reset compaction to built-in"
                size="small"
                onClick={() => settings.change({ compaction: builtIn })}
              />
            ) : null}
            <ToggleSwitch
              label="Automatic compaction"
              isOn={current.isEnabled}
              onChange={(isEnabled) => settings.change({ compaction: { isEnabled } })}
            />
          </>
        }
      >
        <PlaceNote>
          Automatic compaction is {current.isEnabled ? "on" : "off"}. These settings apply to chats
          using this profile. Built-in: {builtIn.isEnabled ? "on" : "off"}.
        </PlaceNote>
        <NumberSetting
          id="compaction-reserve"
          label="Room kept free in tokens"
          value={current.reserveTokens}
          builtIn={builtIn.reserveTokens}
          minimum={0}
          onChange={(value) =>
            settings.change({
              compaction: { reserveTokens: value ?? builtIn.reserveTokens },
            })
          }
        />
        <NumberSetting
          id="compaction-recent"
          label="Newest tokens kept whole"
          value={current.keepRecentTokens}
          builtIn={builtIn.keepRecentTokens}
          minimum={0}
          onChange={(value) =>
            settings.change({
              compaction: { keepRecentTokens: value ?? builtIn.keepRecentTokens },
            })
          }
        />
        <PlaceNote>
          When automatic compaction is on, Pi summarizes older messages when its token estimate
          exceeds the context window minus the room kept free. It can also compact after a context
          overflow and retry the request.
        </PlaceNote>
        <PlaceNote>
          Pi keeps the newest messages around the token budget above, choosing a message or turn
          boundary. It sends the summary in place of older messages. The room kept free sets the
          trigger, and the model output limit caps the summary.
        </PlaceNote>
        <PlaceNote>The prompts and messages of compaction are listed under Texts of Pi.</PlaceNote>
        {settings.failure === undefined ? null : <PlaceNote>{settings.failure}</PlaceNote>}
      </PlaceSection>
      {isProfileEditor ? null : (
        <PlaceSection
          heading="Compact now"
          actions={
            chat.model !== null && !chat.isReplying && !chat.isCompacting ? (
              <IconButton
                icon="compact"
                label="Compact now"
                onClick={() => {
                  setFailure(undefined);
                  compactChat(chat.id).catch(() =>
                    setFailure("The chat could not start compaction. Try again."),
                  );
                }}
              />
            ) : undefined
          }
        >
          <PlaceNote>
            {chat.isCompacting
              ? "Pi is compacting this chat."
              : chat.isReplying
                ? "Wait for the reply to end before compacting."
                : chat.model === null
                  ? "Choose a model before compacting."
                  : "Summarize older messages of this chat now, even while automatic compaction is off."}
          </PlaceNote>
          {chat.compactionError === null ? null : <PlaceNote>{chat.compactionError}</PlaceNote>}
          {failure === undefined ? null : <PlaceNote>{failure}</PlaceNote>}
        </PlaceSection>
      )}
    </>
  );
}
