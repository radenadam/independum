import type { ChatState } from "independum/api-types";
import { afterEach, beforeEach, expect, test, vi } from "vitest";
import {
  fetchContext,
  fetchModels,
  followChat,
  followChats,
  moveCommandToBackground,
  stopCommand,
  stopReply,
} from "./chat-api.ts";
import { MessageBox } from "./message-box.tsx";
import { findElement, renderHook } from "./render-hook.ts";
import type { ToolCalls } from "./tool-step.tsx";
import { WorkingScreen } from "./working-screen.tsx";

vi.mock("react", async () => (await import("./render-hook.ts")).mockReact());
vi.mock("./chat-api.ts");

beforeEach(() => {
  vi.stubGlobal("window", {
    location: { href: "http://localhost/?chat=chat" },
    matchMedia: () => ({ matches: false }),
    addEventListener: vi.fn(),
    removeEventListener: vi.fn(),
  });
  const chat: ChatState = {
    id: "chat",
    pending: { revision: 0, isPaused: false, items: [], error: null },
    leafId: null,
    whileReplying: "queue",
    folder: "folder",
    model: null,
    thinking: null,
    messages: [],
    isReplying: true,
    isCompacting: false,
    compactionError: null,
    contextVersion: 0,
    backgroundCommands: [],
    reply: [],
    toolRuns: {},
  };
  vi.mocked(followChats).mockReturnValue(vi.fn());
  vi.mocked(fetchModels).mockResolvedValue([]);
  vi.mocked(fetchContext).mockImplementation(() => new Promise(() => undefined));
  vi.mocked(followChat).mockImplementation((_id, onEvent) => {
    onEvent({ type: "state", state: chat });
    return vi.fn();
  });
});

afterEach(() => {
  vi.unstubAllGlobals();
  vi.resetAllMocks();
});

test.each([
  {
    action: "stop a command",
    request: stopCommand,
    failure: "The command could not be stopped. Try again.",
  },
  {
    action: "background a command",
    request: moveCommandToBackground,
    failure: "The command could not move to the background. Try again.",
  },
  {
    action: "stop a reply",
    request: stopReply,
    failure: "The reply could not be stopped. Try again.",
  },
])("a failed action to $action shows a notice", async ({ action, request, failure }) => {
  vi.mocked(request).mockRejectedValueOnce(new Error("The request failed."));
  const onExpiredLink = vi.fn();
  const view = renderHook(() => WorkingScreen({ startsWithLogins: false, onExpiredLink }));
  const tree = view.render();
  if (action === "stop a reply") {
    findElement<{ onStop: () => void }>(
      tree,
      (element) => element.type === MessageBox,
    ).props.onStop();
  } else {
    const tools = findElement<{ tools: ToolCalls }>(
      tree,
      (element) => element.props.tools !== undefined,
    ).props.tools;
    if (action === "stop a command") {
      tools.onStop("command");
    } else {
      tools.onMove("command");
    }
  }
  await vi.waitFor(() =>
    expect(
      findElement<{ children: string }>(
        view.render(),
        (element) => element.type === "p" && element.props.children === failure,
      ).props.children,
    ).toBe(failure),
  );
  view.unmount();
});
