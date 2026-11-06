import type { ChatMessage, ChatState, ModelSummary } from "independum/api-types";
import { afterEach, expect, test, vi } from "vitest";
import { resubmitMessage } from "./chat-api.ts";
import { ModelMenu } from "./model-menu.tsx";
import { clickAction, findElement, renderHook } from "./render-hook.ts";
import { ReplyActions } from "./reply-actions.tsx";

vi.mock("react", async () => (await import("./render-hook.ts")).mockReact());
vi.mock("./chat-api.ts", () => ({ resubmitMessage: vi.fn(async () => undefined) }));
afterEach(() => vi.clearAllMocks());

const model = {
  providerId: "faux",
  id: "another",
  thinkingLevels: ["off", "low", "high"],
} as ModelSummary;
const chat = {
  id: "chat",
  branchBlockedReason: null,
  leafId: "leaf",
  pending: { revision: 7 },
} as ChatState;
const first = {
  entryId: "assistant",
  attempt: { providerId: "faux", modelId: "original", thinkingLevel: "low" },
} as ChatMessage;

function properties(state: ChatState = chat): Parameters<typeof ReplyActions>[0] {
  return {
    chat: state,
    sourceId: "prompt",
    first,
    models: [model],
    onOpenModels: vi.fn(),
    onManageLogins: vi.fn(),
  };
}

test("retry model and effort choices stay local until submission", async () => {
  const view = renderHook(() => ReplyActions(properties()));
  clickAction(view.render(), "Reply actions");
  clickAction(view.render(), "Retry with another model or effort");
  const picker = findElement<Parameters<typeof ModelMenu>[0]>(
    view.render(),
    (element) => element.type === ModelMenu,
  );
  picker.props.onChoose(model);
  await findElement<Parameters<typeof ModelMenu>[0]>(
    view.render(),
    (element) => element.type === ModelMenu,
  ).props.onChooseThinking("high");
  expect(resubmitMessage).not.toHaveBeenCalled();
  clickAction(view.render(), "Retry");
  await vi.waitFor(() =>
    expect(resubmitMessage).toHaveBeenCalledWith(
      "chat",
      expect.objectContaining({
        kind: "retry",
        sourceUserEntryId: "prompt",
        sourceAssistantEntryId: "assistant",
        model: { providerId: "faux", modelId: "another", thinkingLevel: "high" },
        expectedRevision: 7,
        expectedLeafId: "leaf",
      }),
    ),
  );
  view.unmount();
});

test("a blocked reply does not submit a retry", () => {
  const view = renderHook(() =>
    ReplyActions(properties({ ...chat, branchBlockedReason: "Remove waiting messages first." })),
  );
  clickAction(view.render(), "Reply actions");
  clickAction(view.render(), "Retry");
  expect(resubmitMessage).not.toHaveBeenCalled();
  view.unmount();
});
