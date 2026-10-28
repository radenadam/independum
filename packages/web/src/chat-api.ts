import type {
  AgentSummary,
  ArchivedChatSummary,
  ChatEvent,
  ContextSummary,
  ModelSummary,
  SettingsChange,
} from "independum/api-types";
import { readEvents } from "./read-events.ts";
import { requestApi } from "./request-api.ts";

/** Whether the UI is following the chat, waiting to follow it again, or has lost its link. */
export type ChatConnection = "following" | "reconnecting" | "expiredLink";

// A dropped stream, such as after a restart in development, is retried after this delay.
const reconnectDelay = 1500;

/** Returns the models of every provider with a login. */
export async function fetchModels(): Promise<ModelSummary[]> {
  const response = await requestApi("/api/models");
  if (!response.ok) {
    throw new Error("The model list could not be loaded.");
  }
  const { models } = (await response.json()) as { models: ModelSummary[] };
  return models;
}

/** Returns what the agent of the open chat works with, including the last request it sent. */
export async function fetchAgent(): Promise<AgentSummary> {
  const response = await requestApi("/api/chat/agent");
  if (!response.ok) {
    throw new Error("The agent could not be loaded.");
  }
  return (await response.json()) as AgentSummary;
}

/**
 * Changes settings of the user, such as the shell, the tools that are off, or the model texts, and
 * returns the agent with them.
 */
export async function changeSettings(change: SettingsChange): Promise<AgentSummary> {
  const response = await requestApi("/api/settings", { method: "PUT", body: change });
  if (!response.ok) {
    throw new Error("The setting could not be saved.");
  }
  return (await response.json()) as AgentSummary;
}

/** Returns what the model of the open chat works with, for the Context place. */
export async function fetchContext(): Promise<ContextSummary> {
  const response = await requestApi("/api/chat/context");
  if (!response.ok) {
    throw new Error("The context could not be loaded.");
  }
  return (await response.json()) as ContextSummary;
}

/** Follows the chat and calls back with each change, reconnecting until the returned stop runs. */
export function followChat(
  onEvent: (event: ChatEvent) => void,
  onConnection: (connection: ChatConnection) => void,
): () => void {
  const controller = new AbortController();

  async function follow(): Promise<void> {
    while (!controller.signal.aborted) {
      try {
        const response = await requestApi("/api/chat/events", { signal: controller.signal });
        if (response.status === 401) {
          onConnection("expiredLink");
          return;
        }
        if (response.ok) {
          onConnection("following");
          await readEvents(response, onEvent);
        }
      } catch {
        // A failed or dropped stream is retried below, unless the UI stopped following.
      }
      if (controller.signal.aborted) {
        return;
      }
      onConnection("reconnecting");
      await new Promise((resolve) => setTimeout(resolve, reconnectDelay));
    }
  }

  follow();
  return () => controller.abort();
}

/** Sends a message to the chat. */
export async function sendMessage(text: string): Promise<void> {
  const response = await requestApi("/api/chat/messages", { body: { text } });
  if (!response.ok) {
    throw new Error("The message was not sent.");
  }
}

/** Chooses the model that the chat uses from now on. */
export async function chooseModel(providerId: string, modelId: string): Promise<void> {
  const response = await requestApi("/api/chat/model", {
    method: "PUT",
    body: { providerId, modelId },
  });
  if (!response.ok) {
    throw new Error("That model is not available.");
  }
}

/** Chooses how much the model of the chat thinks before it answers. */
export async function chooseThinking(level: string): Promise<void> {
  const response = await requestApi("/api/chat/thinking", { method: "PUT", body: { level } });
  if (!response.ok) {
    throw new Error("That thinking level is not available.");
  }
}

/** Returns the archived chats, newest first. */
export async function fetchArchivedChats(): Promise<ArchivedChatSummary[]> {
  const response = await requestApi("/api/chats/archived");
  if (!response.ok) {
    throw new Error("The archived chats could not be loaded.");
  }
  const { chats } = (await response.json()) as { chats: ArchivedChatSummary[] };
  return chats;
}

/** Renames a saved chat. */
export async function renameChat(id: string, name: string): Promise<void> {
  await changeChat(id, "/name", { name });
}

/** Pins a saved chat to the top of the sidebar, or unpins it. */
export async function pinChat(id: string, isPinned: boolean): Promise<void> {
  await changeChat(id, "/pinned", { isPinned });
}

/** Returns a saved chat written as Markdown, with a heading for each message. */
export async function fetchChatMarkdown(id: string): Promise<string> {
  const response = await requestApi(`/api/chats/${encodeURIComponent(id)}/markdown`);
  if (!response.ok) {
    throw new Error("The chat could not be exported.");
  }
  return response.text();
}

/** Moves a saved chat into the archive, or brings it back. */
export async function archiveChat(id: string, isArchived: boolean): Promise<void> {
  await changeChat(id, "/archived", { isArchived });
}

/** Deletes a saved chat for good, whether it is listed or archived. */
export async function deleteChat(id: string): Promise<void> {
  const response = await requestApi(`/api/chats/${encodeURIComponent(id)}`, { method: "DELETE" });
  if (!response.ok) {
    throw new Error("The chat could not be deleted.");
  }
}

async function changeChat(id: string, part: string, body: unknown): Promise<void> {
  const response = await requestApi(`/api/chats/${encodeURIComponent(id)}${part}`, {
    method: "PUT",
    body,
  });
  if (!response.ok) {
    throw new Error("The chat could not be changed.");
  }
}

/** Opens a saved chat in place of the current one. */
export async function openChat(id: string): Promise<void> {
  const response = await requestApi("/api/chat/open", { body: { id } });
  if (!response.ok) {
    throw new Error("That chat could not be opened.");
  }
}

/** Stops one running command, and the reply goes on with what it printed. */
export async function stopCommand(id: string): Promise<void> {
  await requestApi(`/api/chat/commands/${encodeURIComponent(id)}/stop`, { method: "POST" });
}

/** Stops the reply in progress. */
export async function stopReply(): Promise<void> {
  await requestApi("/api/chat/stop", { method: "POST" });
}

/** Starts an empty chat with the same model, in the folder of the open chat or in another project. */
export async function startNewChat(folder?: string): Promise<void> {
  const response = await requestApi("/api/chat/new", {
    body: folder === undefined ? {} : { folder },
  });
  if (!response.ok) {
    throw new Error("The new chat could not start.");
  }
}
