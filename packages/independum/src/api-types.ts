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

/** Thinking that the model did before it went on, with how long it took when Independum saw it. */
export interface ThinkingPart {
  type: "thinking";
  text: string;
  isRedacted: boolean;
  durationMs: number | null;
}

/** What a tool sent back to the model, and the details it keeps for the chat. */
export interface ToolResult {
  text: string;
  isError: boolean;
  details: unknown;
}

/** A call that the model made to a tool, with what the tool sent back once it ended. */
export interface ToolCallPart {
  type: "toolCall";
  id: string;
  name: string;
  input: Record<string, unknown>;
  result: ToolResult | null;
}

/** One part of a message: its text, thinking that the model did, or a call to a tool. */
export type MessagePart = { type: "text"; text: string } | ThinkingPart | ToolCallPart;

/** The latest output of the Shell tool while its command runs. */
export interface ShellProgress {
  shell: string;
  output: string;
}

/** What the Shell tool keeps about a command once it has ended. */
export interface ShellDetails {
  shell: string;
  ending: "exited" | "timedOut" | "stopped";
  exitCode: number | null;
  durationMs: number;
  outputPath: string | null;
}

/** A message of the chat, as the UI shows it. */
export interface ChatMessage {
  role: "user" | "assistant";
  parts: MessagePart[];
  error: string | null;
  timestamp: number;
  durationMs: number | null;
}

/** The whole chat, as the UI receives it when it connects and whenever the chat changes. */
export interface ChatState {
  id: string | null;
  folder: string;
  model: { providerId: string; id: string } | null;
  thinking: { level: string; levels: string[] } | null;
  messages: ChatMessage[];
  isReplying: boolean;
}

/** What the agent of the open chat works with, as the Agent place shows it. */
export interface AgentSummary {
  systemPrompt: string;
  addedByPi: string;
  tools: ToolSummary[];
  shells: ShellChoice[];
  outputLimits: OutputLimits;
}

/** A tool of the agent, with why it cannot run when it cannot, as the Agent place shows it. */
export interface ToolSummary {
  name: string;
  description: string;
  parameters: unknown;
  isEnabled: boolean;
  unavailable: string | null;
}

/** A kind of shell that the Shell tool can run. */
export type ShellKind = "bash" | "powershell";

/** A shell that the user can choose for the Shell tool, with its name when it is installed. */
export interface ShellChoice {
  kind: ShellKind;
  name: string | null;
  isChosen: boolean;
}

/** How much of the output of a tool reaches the model, whichever limit comes first. */
export interface OutputLimits {
  maxLines: number;
  maxBytes: number;
}

/** The settings of the user other than logins, which hold for every chat. */
export interface Settings {
  shell: ShellKind | null;
  disabledTools: string[];
  outputLimits: OutputLimits;
}

/** One entry of the open chat as Pi saves it, as the Context place lists it. */
export interface ContextEntry {
  id: string;
  type: string;
  role: string | null;
  timestamp: string;
  data: unknown;
}

/** What the model of the open chat works with, as the Context place shows it. */
export interface ContextSummary {
  chatId: string | null;
  provider: string | null;
  model: string | null;
  contextWindow: number | null;
  contextTokens: number | null;
  tokens: {
    input: number;
    output: number;
    reasoning: number;
    cacheRead: number;
    cacheWrite: number;
  };
  cost: number;
  userMessages: number;
  assistantMessages: number;
  toolCalls: number;
  created: string | null;
  lastActivity: string | null;
  entries: ContextEntry[];
  lastRequest: unknown;
}

/** A saved chat, as a project lists it. */
export interface ChatSummary {
  id: string;
  title: string;
  modified: number;
  isPinned: boolean;
}

/** An archived chat, with the folder it worked in and the name of that folder. */
export interface ArchivedChatSummary extends ChatSummary {
  folder: string;
  projectName: string;
}

/** A folder that chats work in, with its saved chats, newest first. */
export interface ProjectSummary {
  folder: string;
  name: string;
  chats: ChatSummary[];
}

/** One change to the chat or to the projects, as the UI receives it. */
export type ChatEvent =
  | { type: "state"; state: ChatState }
  | { type: "projects"; projects: ProjectSummary[] }
  | { type: "message"; message: ChatMessage }
  | { type: "replyDelta"; index: number; partType: "text" | "thinking"; delta: string }
  | { type: "replyPart"; index: number; part: MessagePart }
  | { type: "replying"; isReplying: boolean }
  | { type: "toolStart"; id: string }
  | { type: "toolProgress"; id: string; details: unknown }
  | { type: "toolResult"; id: string; result: ToolResult };
