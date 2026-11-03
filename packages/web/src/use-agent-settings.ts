import type { AgentSummary, ChatState, SettingsChange, TextSummary } from "independum/api-types";
import { useState } from "react";
import { changeSettings, fetchAgent } from "./chat-api.ts";
import { useChatData } from "./use-chat-data.ts";

/** The agent of the open chat, with what changes its settings and its texts. */
export interface AgentSettings {
  agent: AgentSummary | undefined;
  failure: string | undefined;
  editing: string | undefined;
  setEditing: (group: string | undefined) => void;
  save: (next: SettingsChange) => Promise<void>;
  change: (next: SettingsChange) => void;
  textsOf: (group: string) => TextSummary[];
  isEditedGroup: (group: string) => boolean;
  markOf: (group: string, isChanged: boolean) => string | undefined;
  builtInTextsOf: (group: string) => Record<string, null>;
}

/** Loads the agent of the open chat, and changes its settings and its texts. */
export function useAgentSettings(chat: ChatState): AgentSettings {
  const loaded = useChatData(fetchAgent, chat);
  // A change answers with the agent as it now is, which holds until the agent loads again.
  const [changed, setChanged] = useState<{ from: AgentSummary | undefined; agent: AgentSummary }>();
  const [failure, setFailure] = useState<string | undefined>();
  const agent = changed !== undefined && changed.from === loaded ? changed.agent : loaded;
  // The group of model texts that is open to edit, such as a tool.
  const [editing, setEditing] = useState<string | undefined>();

  function save(next: SettingsChange): Promise<void> {
    setFailure(undefined);
    return changeSettings(next).then((updated) => setChanged({ from: loaded, agent: updated }));
  }

  function textsOf(group: string): TextSummary[] {
    return agent?.texts.filter((text) => text.group === group) ?? [];
  }

  function isEditedGroup(group: string): boolean {
    return textsOf(group).some((text) => text.isEdited);
  }

  return {
    agent,
    failure,
    editing,
    setEditing,
    save,
    change: (next) => {
      save(next).catch(() => setFailure("The setting could not be saved. Try again."));
    },
    textsOf,
    isEditedGroup,
    // A part of the agent is marked while the user has changed it, and more so when Independum has
    // changed a built-in text since the user edited it.
    markOf: (group, isChanged) => {
      if (textsOf(group).some((text) => text.editedFrom !== null)) {
        return "built-in changed";
      }
      return isChanged || isEditedGroup(group) ? "edited" : undefined;
    },
    builtInTextsOf: (group) => Object.fromEntries(textsOf(group).map((text) => [text.id, null])),
  };
}
