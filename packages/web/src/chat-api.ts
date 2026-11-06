import type {
  AgentSummary,
  ArchivedChatSummary,
  ChatConfiguration,
  ChatEvent,
  ChatState,
  ChatsEvent,
  ComposePreview,
  ConfigurationResource,
  ContextRevision,
  ContextSummary,
  InputDelivery,
  InputOptions,
  ModelSummary,
  SettingsChange,
  UserSettingsDocument,
} from "independum/api-types";
import { fetchProfileAgent, profilePath, readResponse } from "./profile-api.ts";
import { readEvents } from "./read-events.ts";
import { requestApi } from "./request-api.ts";

/** Whether the UI is following the chat, waiting to follow it again, or has lost its link. */
export type ChatConnection = "following" | "reconnecting" | "expiredLink";

// A dropped stream, such as after a restart in development, is retried after this delay.
export const chatReconnectDelay = 1500;

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
export async function fetchAgent(id: string): Promise<AgentSummary> {
  const response = await requestApi(chatPath(id, "/agent"));
  if (!response.ok) {
    throw new Error("The agent could not be loaded.");
  }
  return (await response.json()) as AgentSummary;
}

/**
 * Changes an explicitly addressed profile or user model fact and returns its owner editor.
 */
export async function changeSettings(
  id: string | undefined,
  change: SettingsChange,
  configuration?: ChatConfiguration,
): Promise<AgentSummary> {
  if (change.knowledgeCutoffs !== undefined) {
    const user = configuration?.userSettings;
    if (user?.document == null || configuration === undefined) {
      throw new Error("The user settings have not loaded yet.");
    }
    await readResponse(
      await requestApi("/api/settings", {
        method: "PUT",
        revision: user.revision,
        body: { ...user.document, knowledgeCutoffs: change.knowledgeCutoffs },
      }),
    );
    return id === undefined ? fetchProfileAgent(configuration.profile) : fetchAgent(id);
  }
  if (configuration === undefined) {
    throw new Error("The profile has not loaded yet.");
  }
  return readResponse(
    await requestApi(profilePath(configuration.profile, "/settings"), {
      method: "PUT",
      revision: configuration.profile.revision,
      body: change,
    }),
  );
}

/** Returns what the model of the open chat works with, for the Session place. */
export async function fetchContext(id: string): Promise<ContextSummary> {
  const response = await requestApi(chatPath(id, "/context"));
  if (!response.ok) {
    throw new Error("The context could not be loaded.");
  }
  return (await response.json()) as ContextSummary;
}

/** Follows the chat and calls back with each change, reconnecting until the returned stop runs. */
export function followChat(
  id: string,
  onEvent: (event: ChatEvent) => void,
  onConnection: (connection: ChatConnection) => void,
  onMissing: () => void,
): () => void {
  return followEvents(chatPath(id, "/events"), onEvent, onConnection, onMissing);
}

/** Follows the projects and every reply that starts or ends. */
export function followChats(
  onEvent: (event: ChatsEvent) => void,
  onConnection: (connection: ChatConnection) => void,
): () => void {
  return followEvents("/api/chats/events", onEvent, onConnection, () => undefined);
}

function followEvents<Event>(
  path: string,
  onEvent: (event: Event) => void,
  onConnection: (connection: ChatConnection) => void,
  onMissing: () => void,
): () => void {
  const controller = new AbortController();

  async function follow(): Promise<void> {
    while (!controller.signal.aborted) {
      try {
        const response = await requestApi(path, { signal: controller.signal });
        if (controller.signal.aborted) {
          await response.body?.cancel();
          return;
        }
        if (response.status === 401) {
          onConnection("expiredLink");
          return;
        }
        if (response.status === 404) {
          onMissing();
          return;
        }
        if (response.ok) {
          onConnection("following");
          await readEvents<Event>(response, (event) => {
            if (!controller.signal.aborted) {
              onEvent(event);
            }
          });
        }
      } catch {
        // A failed or dropped stream is retried below, unless the UI stopped following.
      }
      if (controller.signal.aborted) {
        return;
      }
      onConnection("reconnecting");
      await new Promise((resolve) => setTimeout(resolve, chatReconnectDelay));
    }
  }

  follow();
  return () => controller.abort();
}

/** Sends a message to the chat. */
export async function sendMessage(
  id: string,
  text: string,
  options: InputOptions,
  previewId?: string,
): Promise<void> {
  const response = await requestApi(chatPath(id, "/messages"), {
    body: {
      kind: "send",
      ...options,
      text,
      approvalMode: "browser",
      ...(previewId === undefined ? {} : { previewId }),
    },
  });
  await expectSuccess(response, "The message was not sent.");
}

/** Returns a complete state after a conflicting submission. */
export async function fetchChatState(id: string): Promise<ChatState> {
  return readResponse(await requestApi(chatPath(id, "")));
}

/** Saves the delivery mode as a conditional user setting. */
export async function changeInputDelivery(delivery: InputDelivery): Promise<void> {
  const current = await readResponse<ConfigurationResource<UserSettingsDocument>>(
    await requestApi("/api/settings"),
  );
  if (current.document === null) {
    throw new Error("Repair user settings before changing message delivery.");
  }
  await readResponse(
    await requestApi("/api/settings", {
      method: "PUT",
      revision: current.revision,
      body: { ...current.document, messages: { whileReplying: delivery } },
    }),
  );
}

/** Removes a waiting message before Pi owns its delivery. */
export async function removePendingInput(id: string, inputId: string): Promise<void> {
  await expectSuccess(
    await requestApi(chatPath(id, `/pending/${encodeURIComponent(inputId)}`), { method: "DELETE" }),
    "The waiting message could not be removed.",
  );
}

/** Resumes held messages through the current chat's saved delivery boundaries. */
export async function resumePendingInputs(id: string): Promise<void> {
  await expectSuccess(
    await requestApi(chatPath(id, "/pending/resume"), { method: "POST" }),
    "Delivery could not be resumed.",
  );
}

// A change that succeeds can answer with no content, and a refusal says why when it can.
async function expectSuccess(response: Response, fallback: string): Promise<void> {
  if (!response.ok) {
    const body = (await response.json().catch(() => undefined)) as { error?: string } | undefined;
    throw new Error(body?.error ?? fallback);
  }
}

/** Captures a literal message, expanded command, or built-in action before submission. */
export async function composeMessage(id: string, text: string): Promise<ComposePreview> {
  return readResponse(
    await requestApi(chatPath(id, "/compose"), { body: { text, interpretation: "commands" } }),
  );
}

/** Returns the current command and skill catalog without running either. */
export async function fetchResources(id: string): Promise<ContextRevision> {
  return readResponse(await requestApi(chatPath(id, "/resources")));
}

/** Executes a captured built-in command addressed to one chat. */
export async function runSlashAction(
  id: string,
  previewId: string,
): Promise<{ action: string; arguments: string; chatId?: string }> {
  return readResponse(await requestApi(chatPath(id, "/slash-actions"), { body: { previewId } }));
}

/** Chooses the model that the chat uses from now on. */
export async function chooseModel(id: string, providerId: string, modelId: string): Promise<void> {
  const response = await requestApi(chatPath(id, "/model"), {
    method: "PUT",
    body: { providerId, modelId },
  });
  if (!response.ok) {
    throw new Error("That model is not available.");
  }
}

/** Chooses how much the model of the chat thinks before it answers. */
export async function chooseThinking(id: string, level: string): Promise<void> {
  const response = await requestApi(chatPath(id, "/thinking"), { method: "PUT", body: { level } });
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

/** Returns the newest chat of the start folder, or an empty chat there. */
export async function fetchFirstChat(): Promise<string> {
  const response = await requestApi("/api/chats/first");
  if (!response.ok) {
    throw new Error("The first chat could not be loaded.");
  }
  return ((await response.json()) as { id: string }).id;
}

/** Moves a command of the reply to the background, and the reply goes on while it runs. */
export async function moveCommandToBackground(chatId: string, id: string): Promise<void> {
  const response = await requestApi(
    chatPath(chatId, `/commands/${encodeURIComponent(id)}/background`),
    {
      method: "POST",
    },
  );
  if (!response.ok && !hasEnded(response)) {
    throw new Error("The command could not move to the background.");
  }
}

/** Stops one running command, and the reply goes on with what it printed. */
export async function stopCommand(chatId: string, id: string): Promise<void> {
  const response = await requestApi(chatPath(chatId, `/commands/${encodeURIComponent(id)}/stop`), {
    method: "POST",
  });
  if (!response.ok && !hasEnded(response)) {
    throw new Error("The command could not be stopped.");
  }
}

// A command that ends on its own just before the user stops it or moves it to the background no
// longer runs, which the server answers with Not Found, so the action needs no notice.
function hasEnded(response: Response): boolean {
  return response.status === 404;
}

/** Stops the reply in progress. */
export async function stopReply(id: string): Promise<void> {
  const response = await requestApi(chatPath(id, "/stop"), { method: "POST" });
  if (!response.ok) {
    throw new Error("The reply could not be stopped.");
  }
}

/** Starts compaction of the open chat through Pi. */
export async function compactChat(id: string): Promise<void> {
  const response = await requestApi(chatPath(id, "/compact"), { method: "POST" });
  if (!response.ok) {
    throw new Error("The chat could not start compaction.");
  }
}

/** Starts an empty chat with the same model, in the folder of the open chat or in another project. */
export async function startNewChat(id: string, folder?: string): Promise<string> {
  const response = await requestApi(chatPath(id, "/new"), {
    body: folder === undefined ? {} : { folder },
  });
  if (!response.ok) {
    throw new Error("The new chat could not start.");
  }
  return ((await response.json()) as { id: string }).id;
}

function chatPath(id: string, part: string): string {
  return `/api/chats/${encodeURIComponent(id)}${part}`;
}
