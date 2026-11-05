import type { ComponentProps, ReactElement } from "react";
import { afterEach, expect, test, vi } from "vitest";
import { readDraft, saveDraft } from "./chat-draft.ts";
import { MessageBox } from "./message-box.tsx";
import { findElement, renderHook } from "./render-hook.ts";

vi.mock("react", async () => (await import("./render-hook.ts")).mockReact());

afterEach(() => vi.unstubAllGlobals());

interface Field {
  value: string;
  onChange: (event: { target: { value: string } }) => void;
}

function fieldOf(tree: ReactElement): Field {
  return findElement<Field>(tree, (element) => element.props["aria-label"] === "Message").props;
}

test("a failed send restores its chat draft without replacing the open chat draft", async () => {
  const storage = new Map<string, string>();
  vi.stubGlobal("localStorage", {
    getItem: (key: string) => storage.get(key) ?? null,
    setItem: (key: string, value: string) => storage.set(key, value),
    removeItem: (key: string) => storage.delete(key),
  });
  vi.stubGlobal("window", { matchMedia: () => ({ matches: false }) });
  const { promise: pending, reject } = Promise.withResolvers<void>();
  const props: ComponentProps<typeof MessageBox> = {
    chatId: "a",
    model: { providerId: "provider", id: "model" },
    thinking: null,
    context: undefined,
    models: undefined,
    folder: "folder",
    projects: [],
    isEmpty: false,
    isReplying: false,
    runningCount: 0,
    onSend: () => pending,
    onStop: vi.fn(),
    onOpenModels: vi.fn(),
    onChooseModel: vi.fn(),
    onChooseThinking: vi.fn(),
    onChooseFolder: vi.fn(),
    onManageLogins: vi.fn(),
    onOpenContext: vi.fn(),
    onOpenCommands: vi.fn(),
  };
  saveDraft("b", "Draft in B");
  const view = renderHook(() => MessageBox(props));
  fieldOf(view.render()).onChange({ target: { value: "Message in A" } });
  findElement<{ onClick: () => void }>(
    view.render(),
    (element) => element.props.label === "Send",
  ).props.onClick();
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
