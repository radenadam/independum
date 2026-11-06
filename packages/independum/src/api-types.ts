import type { ModelThinkingLevel } from "@earendil-works/pi-ai";
import type { ApprovalRequest, ChatPermissionApproval } from "./create-approvals.ts";
import type { SandboxRuntime } from "./create-sandbox.ts";
import type { HookConfiguration, HookSummary } from "./hook-contract.ts";
import type { PermissionPolicy } from "./permission-policy.ts";

export type { ApprovalRequest };

/** The effort choices accepted by the installed Pi runtime. */
export const thinkingLevels: ModelThinkingLevel[] = [
  "off",
  "minimal",
  "low",
  "medium",
  "high",
  "xhigh",
  "max",
];

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

/**
 * A model the user can chat with, from a provider with a login, with what Pi knows of it: where its
 * requests go, its limits, its prices, and how long its provider keeps the prompt cache.
 */
export interface ModelSummary {
  thinkingLevels?: string[];
  providerId: string;
  providerName: string;
  id: string;
  name: string;
  api: string;
  baseUrl: string;
  contextWindow: number;
  maxOutput: number;
  images: ModelImages | null;
  requestBytes: number | null;
  prices: ModelPrices;
  priceTiers: { inputAbove: number; prices: ModelPrices }[];
  cacheSeconds: { short: number | null; long: number | null };
}

/** The prices of a model for a million tokens, in USD. */
export interface ModelPrices {
  input: number;
  output: number;
  cacheRead: number;
  cacheWrite: number;
}

/** What a model takes of images: how many at once, and the size that Pi resizes larger ones to. */
export interface ModelImages {
  perRequest: number | null;
  perMessage: number | null;
  resizedTo: { width: number | null; height: number | null; bytes: number | null } | null;
}

/** Thinking that the model did before it went on, with how long it took when Independum saw it. */
export interface ThinkingPart {
  type: "thinking";
  text: string;
  isRedacted: boolean;
  durationMs: number | null;
}

/** An image that a tool sent back to the model, as base64 data. */
export interface ToolImage {
  mimeType: string;
  data: string;
}

/** What a tool sent back to the model, and the details it keeps for the chat. */
export interface ToolResult {
  text: string;
  images: ToolImage[];
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

/** The latest output of the Shell tool while its command runs, and when it last printed. */
export interface ShellProgress {
  shell: string;
  output: string;
  lastOutputAt: number;
}

/** What the Read tool keeps about a read: the lines that it returned, or the size of an image. */
export type ReadDetails =
  | { kind: "text"; firstLine: number; lastLine: number; lineCount: number }
  | { kind: "image"; width: number; height: number }
  | { kind: "empty" };

/** One part of a diff: where it starts in the file before and after, and its lines, each after +, -, or a space. */
export interface DiffHunk {
  oldStart: number;
  newStart: number;
  lines: string[];
}

/** The diff of a file that a tool changed, with how many lines it added and removed. */
export interface FileDiff {
  hunks: DiffHunk[];
  added: number;
  removed: number;
}

/** What the Write tool keeps about a write: whether the file is new, and its diff. */
export interface WriteDetails extends FileDiff {
  isNew: boolean;
}

/** What the Shell tool keeps about a command once it has ended. */
export interface ShellDetails {
  shell: string;
  ending: "exited" | "timedOut" | "stopped" | "background";
  exitCode: number | null;
  signal: string | null;
  durationMs: number;
  outputPath: string | null;
  backgroundId: number | null;
}

/** How a background command ended, as the note about it in the chat tells. */
export interface CommandEnd {
  id: number;
  toolCallId: string;
  ending: "exited" | "timedOut" | "stopped";
  exitCode: number | null;
  signal: string | null;
  durationMs: number;
  isStoppedByUser: boolean;
}

/** A background command of the open chat that still runs, with its id, its command, and the latest lines it printed. */
export interface RunningCommand {
  id: number;
  command: string;
  toolCallId: string;
  startedAt: number;
  progress: ShellProgress;
}

/**
 * A message of the chat, as the UI shows it: a prompt, a turn of the agent, or a note that wakes the
 * agent, such as the end of a background command.
 */
export interface ChatMessage {
  attachments?: AttachmentPreview[];
  attempt?: InputModel | undefined;
  submittedText?: string;
  imageCount?: number;
  entryId?: string;
  isSteered?: boolean;
  role: "user" | "assistant" | "note";
  parts: MessagePart[];
  error: string | null;
  timestamp: number;
  durationMs: number | null;
  commandEnd: CommandEnd | null;
}

/** The whole chat, as the UI receives it when it connects and whenever the chat changes. */
export interface ChatState {
  attachmentSettings?: AttachmentSettings;
  branchSelectionId?: string | null;
  branches?: Record<string, { prompt: BranchCount; reply: BranchCount }>;
  branchBlockedReason?: string | null;
  pending: PendingInputsState;
  leafId: string | null;
  whileReplying: InputDelivery;
  hookInvocations?: { id: string; hookId: string; startedAt: string }[];
  contextApprovals?: ApprovalRequest[];
  id: string;
  folder: string;
  model: { providerId: string; id: string } | null;
  thinking: { level: string; levels: string[] } | null;
  messages: ChatMessage[];
  isReplying: boolean;
  reply: MessagePart[];
  toolRuns: Record<string, { startedAt: number; details: unknown }>;
  isCompacting: boolean;
  compactionError: string | null;
  contextVersion: number;
  backgroundCommands: RunningCommand[];
}

/**
 * What the agent of the open chat works with, as the Session place shows it, with the built-in
 * settings that a reset goes back to.
 */
export interface AgentSummary {
  deniedPaths?: string[];
  hooks?: HookSummary;
  attachments?: AttachmentSettings;
  builtInAttachments?: AttachmentSettings;
  chatPermissionApprovals?: ChatPermissionApproval[];
  protectedConfigurationPaths?: string[];
  piSections?: Record<string, string | null>;
  chatId?: string;
  contextSettings?: ContextSettings;
  resources?: ContextRevision;
  lastContext?: ContextRevision | null;
  permissionProject?: string;
  sandbox?: SandboxRuntime;
  fileSandbox?: SandboxRuntime;
  permissions?: PermissionPolicy;
  minimalEnvironmentNames?: string[];
  configuration?: ChatConfiguration;
  modelSettings: ModelSettingsSummary | null;
  compaction: CompactionSettings;
  builtInCompaction: CompactionSettings;
  systemPrompt: string;
  addedByPi: string;
  addedFacts: AddedFactSummary[];
  knowledgeCutoffs: Record<string, Record<string, string>>;
  tools: ToolSummary[];
  shells: ShellChoice[];
  chosenShell: ShellKind | null;
  outputLimits: OutputLimits;
  builtInOutputLimits: OutputLimits;
  handBackSeconds: number;
  builtInHandBackSeconds: number;
  texts: TextSummary[];
  piTexts: PiTextSummary[];
  environment: Record<string, string>;
  environmentSuggestions: EnvironmentSuggestion[];
}

/** A variable that the user can add to the environment of commands, with what it changes. */
export interface EnvironmentSuggestion {
  name: string;
  value: string;
  reason: string;
}

/**
 * A text that Pi sends to the model, with when it sends it and the slots where it puts values,
 * marked when the last request of the open chat holds it.
 */
export interface PiTextSummary {
  control?: string | null;
  source?: string;
  limitation?: string;
  id: string;
  group: string;
  condition: string;
  text: string;
  slots: { name: string; meaning: string }[];
  isInLastRequest: boolean;
}

/** Where a model text sits among the texts of its group. */
export type TextSection = "prompt" | "description" | "parameter" | "result" | "note";

/** A value that Independum puts into a model text where its name stands in braces. */
export interface TextSlot {
  name: string;
  meaning: string;
  example: string;
}

// The built-in text that an edit started from shows when Independum has changed it since.
/**
 * A model text as the user sees and edits it: when the model gets it, the text it has now, and
 * its built-in text.
 */
export interface TextSummary {
  id: string;
  group: string;
  section: TextSection;
  label: string;
  text: string;
  builtIn: string;
  isEdited: boolean;
  editedFrom: string | null;
  hasBaseline?: boolean;
  slots: TextSlot[];
}

/** A model text that the user edited, with the built-in text that the edit started from. */
export interface EditedText {
  text: string;
  builtIn?: string;
}

/** A profile identified within the user or the exact project folder. */
export interface ProfileReference {
  scope: "user" | "project";
  id: string;
}

/** A model selection stored without requiring a current login. */
export interface ModelChoice {
  providerId: string;
  modelId: string;
}

/** The model and effort choices that a chat can override. */
export interface ChatOverrides {
  model?: ModelChoice | null;
  thinkingLevel?: ModelThinkingLevel | null;
}

/** The complete setup of one profile, with omitted settings following built-in values. */
export interface ProfileDocument {
  formatVersion: 1;
  name: string;
  settings?: Partial<Omit<Settings, "texts" | "knowledgeCutoffs">> & ChatOverrides;
}

/** Model text edits with optional baselines for files written by hand. */
export interface ModelTextDocument {
  formatVersion: 1;
  systemPromptBuiltIn?: string;
  texts?: Record<string, EditedText>;
}

/** The three configuration files owned by a profile. */
export interface ProfileBundle {
  profile: ProfileDocument;
  systemPrompt: string | null;
  modelTexts: ModelTextDocument | null;
}

/** User settings that own the default profile and facts about models. */
export interface UserSettingsDocument {
  formatVersion: 1;
  defaultProfile: ProfileReference;
  knowledgeCutoffs?: Settings["knowledgeCutoffs"];
  messages?: { whileReplying?: InputDelivery };
}

/** The boundary at which a pending input reaches Pi. */
export type InputDelivery = "queue" | "steer";

/** The model and exact effort captured for one input. */
export interface InputModel {
  providerId: string;
  modelId: string;
  thinkingLevel: string | null;
}

/** The saved prompt that an edit or retry branches from. */
export interface BranchInput {
  kind: "edit" | "retry";
  sourceUserEntryId: string;
  sourceAssistantEntryId?: string;
}

/** The position of the selected prompt or reply among its alternatives. */
export interface BranchCount {
  selected: number;
  count: number;
}

/** One saved prompt variant or reply attempt in creation order. */
export interface BranchChoice {
  id: string;
  label: string;
  detail: string;
  isCurrent: boolean;
}

/** A durable edit or retry with its expected shared chat state. */
export interface BranchRequest extends BranchInput {
  attachmentIds?: string[];
  fileAttachmentIds?: string[];
  id: string;
  expectedRevision: number;
  expectedLeafId: string | null;
  model: InputModel | null;
  text?: string;
  hasBrowserApprovals?: boolean;
}

/** A durable submission that Pi has not saved as a user message. */
export interface PendingInput {
  attachmentIds?: string[];
  fileAttachmentIds?: string[];
  attachments?: AttachmentSummary[];
  branch?: BranchInput;
  id: string;
  sequence: number;
  createdAt: number;
  delivery: InputDelivery;
  state: "waiting" | "handingOff" | "held";
  reason: string | null;
  text: string;
  model: InputModel;
  hasBrowserApprovals: boolean;
  command: ComposePreview | null;
  submission?: { operationId: string; submissionId: string };
}

/** The pending inputs and their durable revision, including a recovery failure. */
export interface PendingInputsState {
  revision: number;
  isPaused: boolean;
  items: PendingInput[];
  error: string | null;
}

/** The identity and starting state of one message submission. */
export interface InputOptions {
  attachmentIds?: string[];
  fileAttachmentIds?: string[];
  id: string;
  expectedRevision: number;
  expectedLeafId: string | null;
  delivery: InputDelivery;
}

/** The default profile for new chats in one project. */
export interface ProjectSettingsDocument {
  formatVersion: 1;
  profile?: ProfileReference;
}

/** A chat's durable profile selection and explicit choices. */
export interface ChatSettingsDocument {
  formatVersion: 1;
  profile: ProfileReference;
  overrides?: ChatOverrides;
}

/** A precise problem in a configuration file. */
export interface ConfigurationIssue {
  file: string;
  pointer: string;
  message: string;
}

/** A file resource and the revision required for replacing it. */
export interface ConfigurationResource<Document> {
  path: string;
  revision: string;
  document: Document | null;
  issues: ConfigurationIssue[];
}

/** A profile bundle with its scope, disk revision, and validation issues. */
export interface ProfileResource extends ConfigurationResource<ProfileBundle> {
  reference: ProfileReference;
  projectId: string;
  usedBy: string[];
  files?: Record<string, string | null>;
}

/** The desired and applied setup of a chat. */
export interface ChatConfiguration {
  profile: ProfileResource;
  choices: ConfigurationResource<ChatSettingsDocument>;
  appliedRevision: string;
  pendingRevision: string | null;
  issues: ConfigurationIssue[];
  model: ModelChoice | null;
  thinkingLevel: ChatOverrides["thinkingLevel"];
  sources?: Record<string, { file: string | null; pointer: string; value: unknown }>;
  userSettings?: ConfigurationResource<UserSettingsDocument>;
}

/** A tool of the agent, with why it cannot run when it cannot, as the Session place shows it. */
export interface ToolSummary {
  name: string;
  description: string;
  parameters: unknown;
  isEnabled: boolean;
  unavailable: string | null;
}

/** A kind of shell that the Shell tool can run. */
export type ShellKind = "bash" | "powershell";

/**
 * A shell that the user can choose for the Shell tool, with its name when it is installed, or what
 * is missing when it is not.
 */
export interface ShellChoice {
  kind: ShellKind;
  name: string | null;
  missing: string;
  isChosen: boolean;
}

/** How much of the output of a tool reaches the model, whichever limit comes first. */
export interface OutputLimits {
  maxLines: number;
  maxBytes: number;
}

/** The limits and temperature of one model in chats using a profile. */
export interface ModelOverrides {
  contextWindow?: number;
  maxOutput?: number;
  temperature?: number;
}

/** Changes to the overrides of one model, with null resetting one field. */
export type ModelOverrideChange = Partial<Record<keyof ModelOverrides, number | null>>;

/** The settings of one model, with the values that Pi knows before any edit. */
export interface ModelSettingsSummary {
  providerId: string;
  modelId: string;
  builtIn: { contextWindow: number; maxOutput: number; temperature: number | null };
  overrides: ModelOverrides;
}

/** How Pi compacts chats using a profile, with its free room and newest token budget. */
export interface CompactionSettings {
  isEnabled: boolean;
  reserveTokens: number;
  keepRecentTokens: number;
}

/** The resolved runtime settings of a profile with user facts about models. */
export interface Settings extends HookConfiguration {
  attachments: AttachmentSettings;
  context: ContextSettings;
  permissions: PermissionPolicy;
  modelOverrides: Record<string, Record<string, ModelOverrides>>;
  compaction: CompactionSettings;
  shell: ShellKind | null;
  disabledTools: string[];
  disabledFacts: string[];
  knowledgeCutoffs: Record<string, Record<string, string>>;
  outputLimits: OutputLimits;
  handBackSeconds: number;
  environment: Record<string, string>;
  texts: Record<string, EditedText>;
}

/** Limits and preparation choices for explicitly attached files. */
export interface AttachmentSettings {
  maxCount: number;
  maxFileBytes: number;
  maxTotalBytes: number;
  maxTextBytes: number;
  maxTotalTextBytes: number;
  includeDetails: boolean;
  resizeImages: boolean;
}

/** An original attachment retained independently of its prepared model input. */
export interface AttachmentSummary {
  id: string;
  name: string;
  mimeType: string;
  bytes: number;
  kind: "text" | "image" | "file";
  encoding: "utf-8" | "utf-16le" | "utf-16be" | null;
  textBytes: number;
}

/** The exact prepared input and any reason an attachment cannot be sent. */
export interface AttachmentPreview extends AttachmentSummary {
  text?: string;
  isFile: boolean;
  modelText: string;
  image: ToolImage | null;
  notice: string | null;
  error: string | null;
}

/** Profile controls for discovered resources and Pi additions. */
export interface ContextSettings {
  version: 1;
  isBasePromptEnabled: boolean;
  instructions: { isEnabled: boolean; names: string[]; disabledPaths: string[] };
  skills: { isEnabled: boolean; isAdvertised: boolean; paths: string[]; disabledPaths: string[] };
  slashCommands: { isEnabled: boolean; paths: string[]; disabledPaths: string[] };
  pi: { disabled: string[] };
}

/** A discovered source, including exclusions and the exact bytes captured for a request. */
export interface ContextResource {
  permissionScope?: "file" | "tree";
  id: string;
  kind: "instructions" | "skill" | "command";
  scope: "user" | "profile" | "project";
  path: string;
  name: string;
  state: "enabled" | "off" | "duplicate" | "overridden" | "invalid" | "needsPermission";
  reason: string;
  aliases: string[];
  bytes: number;
  fingerprint: string;
  source: string;
  insertedText: string;
  body: string;
  description: string;
  metadata: Record<string, unknown>;
}

/** An immutable discovered revision saved through Pi when a request uses it. */
export interface ContextRevision {
  piSections?: Record<string, string | null>;
  version: 1;
  revision: string;
  settings: ContextSettings;
  resources: ContextResource[];
  renderedInstructions: string;
  renderedSkills: string;
}

/** An expansion captured before the user submits the shown text. */
export interface ComposePreview {
  kind: "literal" | "preview" | "action";
  action?: string;
  id: string;
  chatId: string;
  invocation: string;
  arguments: string;
  fingerprint: string;
  text: string;
  expires: number;
}

// Each model text in it gets a new text, or goes back to its built-in text with null.
/** A change to the settings. */
export type SettingsChange = Partial<Omit<Settings, "texts" | "modelOverrides" | "compaction">> & {
  tool?: { name: string; isEnabled: boolean };
  modelOverrides?: Record<string, Record<string, ModelOverrideChange | null>>;
  compaction?: Partial<CompactionSettings>;
  texts?: Record<string, string | null>;
};

/** One saved entry of the open chat as the Session place lists it, without file fingerprints. */
export interface ContextEntry {
  id: string;
  type: string;
  role: string | null;
  timestamp: string;
  data: unknown;
}

/** Who put a part of a request there: the user, the model, a tool, Independum, Pi, or no one known. */
export type PartSource = "you" | "model" | "tool" | "independum" | "pi" | "other";

/** What a part of a request is, so the place that shows it can open what it came from. */
export type PartLink =
  | { kind: "systemPrompt" | "addedByPi" | "effort" }
  | { kind: "addedFact"; id: string; entryId?: string }
  | { kind: "piText"; id: string }
  | { kind: "tool"; name: string }
  | { kind: "entry"; id: string }
  | { kind: "other" };

/** A fact that Independum adds to a request, with its text and switch. */
export interface AddedFactSummary {
  id: string;
  label: string;
  text: string | null;
  isEnabled: boolean;
}

/** A group of the parts of a request, in the order a model reads them. */
export type RequestGroup = "instructions" | "tools" | "messages";

/**
 * One part of the last request: its group, the key of the request that holds it, who put it there,
 * what kind of part it is, the start of its text, its text as it was sent, and its size in tokens,
 * estimated from its length.
 */
export interface RequestPart {
  group: RequestGroup;
  section: string;
  source: PartSource;
  label: string;
  preview: string;
  link: PartLink;
  text: string;
  tokens: number;
}

/** Something that came in before a request, such as a message of the user or a tool result. */
export interface RequestInput {
  source: PartSource;
  label: string;
  preview: string;
  entryId: string;
}

/**
 * A setting that changed before a request, the record of its system prompt and tools that Pi saved,
 * or a compaction, with how many tokens the chat held before it and how many requests it summarized.
 */
export type RequestChange =
  | { kind: "model"; provider: string; model: string }
  | { kind: "effort"; effort: string }
  | { kind: "setup" }
  | {
      kind: "compaction";
      entryId: string;
      timestamp: string;
      tokensBefore: number;
      summarizedRequests: number;
    };

/**
 * One request that the model answered: when, with which model, what came in since the request
 * before it, the settings that changed just before it, its reply, and its use.
 */
export interface RequestSummary {
  id: string;
  timestamp: string;
  provider: string;
  model: string;
  tokens: TokenCounts;
  cost: number;
  inputs: RequestInput[];
  changes: RequestChange[];
  reply: { label: string; preview: string };
  isSummarized: boolean;
}

/** The tokens of a request, a reply, or a whole chat. */
export interface TokenCounts {
  input: number;
  output: number;
  reasoning: number;
  cacheRead: number;
  cacheWrite: number;
}

/** What the model of the open chat works with, as the Session place shows it. */
export interface ContextSummary {
  submissions?: { operationId: string; submissionId: string }[];
  chatId: string | null;
  provider: string | null;
  model: string | null;
  contextWindow: number | null;
  contextTokens: number | null;
  // Pi compacts the chat before a request would fill this much of the window, or never when it is null.
  compactionReserve: number | null;
  tokens: TokenCounts;
  cost: number;
  lastUse: { tokens: TokenCounts; cost: number } | null;
  userMessages: number;
  assistantMessages: number;
  toolCalls: number;
  created: string | null;
  lastActivity: string | null;
  entries: ContextEntry[];
  lastRequest: unknown;
  requestParts: RequestPart[];
  isNextRequest: boolean;
  requests: RequestSummary[];
  pendingChanges: RequestChange[];
  cacheWarmings: number;
  files: { chat: string | null; toolOutput: string | null; savedRequest: string | null };
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

/** One change to the projects or the chats that reply, as every client receives it. */
export type ChatsEvent =
  | { type: "projects"; projects: ProjectSummary[] }
  | { type: "replyingChats"; ids: string[] }
  | { type: "replyEnded"; chatId: string; reply: ChatMessage | null };

/** One change to a chat, as its followers receive it. */
export type ChatEvent =
  | { type: "state"; state: ChatState }
  | { type: "pending"; chatId: string; leafId: string | null; pending: PendingInputsState }
  | {
      type: "contextChanged";
      state: Pick<ChatState, "contextVersion" | "isCompacting" | "compactionError">;
    }
  | { type: "removed"; replacementId: string }
  | { type: "message"; message: ChatMessage }
  | { type: "replyDelta"; index: number; partType: "text" | "thinking"; delta: string }
  | { type: "replyPart"; index: number; part: MessagePart }
  | { type: "replying"; isReplying: boolean }
  | { type: "toolStart"; id: string }
  | { type: "toolProgress"; id: string; details: unknown }
  | { type: "toolResult"; id: string; result: ToolResult }
  | { type: "commandEnd"; end: CommandEnd };
