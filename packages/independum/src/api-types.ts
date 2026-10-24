/** A sign-in method that a provider offers. */
export type LoginMethod = "apiKey" | "account";

/** An option of a choice question. */
interface ChoiceOption {
  id: string;
  label: string;
  description?: string;
}

/** One step of a login, as the UI receives it. */
export type LoginEvent =
  | {
      type: "question";
      questionId: string;
      kind: "text" | "secret" | "choice" | "code";
      message: string;
      placeholder?: string;
      options?: ChoiceOption[];
    }
  | { type: "questionClosed"; questionId: string }
  | { type: "link"; url: string; instructions?: string }
  | { type: "deviceCode"; code: string; url: string }
  | { type: "note"; message: string }
  | { type: "done" }
  | { type: "failed"; message: string };

/** A provider as the API describes it, with its sign-in methods and its current login. */
export interface ProviderSummary {
  id: string;
  name: string;
  apiKey: { label: string; canLogIn: boolean } | null;
  account: { label: string; buttonLabel: string | null; isSubscription: boolean } | null;
  login: { method: LoginMethod; source: string | null } | null;
}

/** A model the user can chat with, from a provider with a login. */
export interface ModelSummary {
  providerId: string;
  providerName: string;
  id: string;
  name: string;
}

/** A message of the chat, as the UI shows it. */
export interface ChatMessage {
  role: "user" | "assistant";
  text: string;
  error: string | null;
}

/** The whole chat, as the UI receives it when it connects and whenever the chat changes. */
export interface ChatState {
  model: { providerId: string; id: string } | null;
  messages: ChatMessage[];
  isReplying: boolean;
}

/** One change to the chat, as the UI receives it. */
export type ChatEvent =
  | { type: "state"; state: ChatState }
  | { type: "message"; message: ChatMessage }
  | { type: "replyDelta"; delta: string }
  | { type: "replying"; isReplying: boolean };
