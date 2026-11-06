import type { ComponentProps, ReactElement } from "react";
import { afterEach, expect, test, vi } from "vitest";
import { composeMessage } from "./chat-api.ts";
import { readDraft, saveDraft } from "./chat-draft.ts";
import { MessageBox } from "./message-box.tsx";
import { findElement, renderHook } from "./render-hook.ts";

vi.mock("react", async () => (await import("./render-hook.ts")).mockReact());
vi.mock("./chat-api.ts", () => ({
  composeMessage: vi.fn(async (chatId: string, text: string) => ({
    chatId,
    text,
    invocation: text,
    id: `preview-${text}`,
    kind: "literal",
    arguments: "",
    fingerprint: "",
    expires: Date.now() + 300000,
  })),
  fetchResources: () => Promise.reject(new Error("The catalog is unavailable.")),
}));

afterEach(() => vi.unstubAllGlobals());

interface Field {
  value: string;
  onChange: (event: { target: { value: string } }) => void;
}

function fieldOf(tree: ReactElement): Field {
  return findElement<Field>(tree, (element) => element.props["aria-label"] === "Message").props;
}

test("a failed send restores its chat draft without replacing the open chat draft", async () => {
  const props = properties();
  props.chatId = "a";
  props.isReplying = false;
  const { promise: pending, reject } = Promise.withResolvers<void>();
  props.onSend = vi.fn(() => pending);
  saveDraft("b", "Draft in B");
  const view = renderHook(() => MessageBox(props));
  fieldOf(view.render()).onChange({ target: { value: "Message in A" } });
  findElement<{ onClick: () => void }>(
    view.render(),
    (element) => element.props.label === "Send",
  ).props.onClick();
  await vi.waitFor(() => expect(composeMessage).toHaveBeenCalledWith("a", "Message in A"));
  props.chatId = "b";
  expect(fieldOf(view.render()).value).toBe("Draft in B");
  reject(new Error("The send failed."));
  await pending.catch(() => undefined);
  expect(fieldOf(view.render()).value).toBe("Draft in B");
  expect(readDraft("a")).toBe("Message in A");
  expect(readDraft("b")).toBe("Draft in B");
  props.chatId = "a";
  expect(fieldOf(view.render()).value).toBe("Message in A");
});

function properties(): ComponentProps<typeof MessageBox> {
  const storage = new Map<string, string>();
  vi.stubGlobal("localStorage", {
    getItem: (key: string) => storage.get(key) ?? null,
    setItem: (key: string, value: string) => storage.set(key, value),
    removeItem: (key: string) => storage.delete(key),
  });
  vi.stubGlobal("window", { matchMedia: () => ({ matches: true }) });
  return {
    chatId: "draft-chat",
    model: { providerId: "provider", id: "model" },
    thinking: null,
    context: undefined,
    models: undefined,
    folder: "folder",
    projects: [],
    isEmpty: false,
    isReplying: true,
    pending: { revision: 0, isPaused: false, items: [], error: null },
    whileReplying: "queue",
    onRemovePending: vi.fn(),
    onResumePending: vi.fn(),
    runningCount: 0,
    onSend: vi.fn(async () => undefined),
    onSlashAction: vi.fn(),
    onStop: vi.fn(),
    onOpenModels: vi.fn(),
    onChooseModel: vi.fn(),
    onChooseThinking: vi.fn(),
    onChooseFolder: vi.fn(),
    onManageLogins: vi.fn(),
    onOpenContext: vi.fn(),
    onOpenCommands: vi.fn(),
  };
}

test.each([true, false])(
  "acceptance preserves a newer draft when the request succeeds %s",
  async (isSuccessful) => {
    const props = properties();
    const pending = Promise.withResolvers<void>();
    props.onSend = vi.fn(() => pending.promise);
    const view = renderHook(() => MessageBox(props));
    fieldOf(view.render()).onChange({ target: { value: "Submitted draft" } });
    findElement<{ onClick: () => Promise<void> }>(
      view.render(),
      (element) => element.props.label === "Queue after this reply",
    ).props.onClick();
    await vi.waitFor(() => expect(props.onSend).toHaveBeenCalled());
    expect(fieldOf(view.render()).value).toBe("Submitted draft");
    fieldOf(view.render()).onChange({ target: { value: "Newer draft" } });
    if (isSuccessful) {
      pending.resolve();
    } else {
      pending.reject(new Error("The send failed."));
    }
    await pending.promise.catch(() => undefined);
    expect(fieldOf(view.render()).value).toBe("Newer draft");
    expect(readDraft(props.chatId)).toBe("Newer draft");
  },
);

test("enter queues and the modifier sends a steer while stop stays available", async () => {
  const props = properties();
  const view = renderHook(() => MessageBox(props));
  function press(hasModifier: boolean, isComposing = false): void {
    const field = findElement<{ onKeyDown: (event: unknown) => void }>(
      view.render(),
      (element) => element.props["aria-label"] === "Message",
    );
    field.props.onKeyDown({
      key: "Enter",
      ctrlKey: hasModifier,
      metaKey: false,
      altKey: false,
      shiftKey: false,
      nativeEvent: { isComposing },
      preventDefault: vi.fn(),
    });
  }
  fieldOf(view.render()).onChange({ target: { value: "Queue this" } });
  press(false, true);
  expect(props.onSend).not.toHaveBeenCalled();
  press(false);
  await vi.waitFor(() =>
    expect(props.onSend).toHaveBeenCalledWith(
      "Queue this",
      "preview-Queue this",
      "queue",
      expect.any(String),
    ),
  );
  fieldOf(view.render()).onChange({ target: { value: "Steer this" } });
  press(true);
  await vi.waitFor(() =>
    expect(props.onSend).toHaveBeenCalledWith(
      "Steer this",
      "preview-Steer this",
      "steer",
      expect.any(String),
    ),
  );
  expect(findElement(view.render(), (element) => element.props.label === "Stop")).toBeDefined();
});
