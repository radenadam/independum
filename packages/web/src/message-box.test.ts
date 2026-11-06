import type { ComponentProps, ReactElement } from "react";
import { afterEach, expect, test, vi } from "vitest";
import { previewAttachment, uploadAttachment } from "./attachment-api.ts";
import { composeMessage } from "./chat-api.ts";
import { readDraft, readDraftAttachments, saveDraft, saveDraftAttachments } from "./chat-draft.ts";
import { MessageBox } from "./message-box.tsx";
import { findElement, renderHook } from "./render-hook.ts";

vi.mock("react", async () => (await import("./render-hook.ts")).mockReact());
vi.mock("./attachment-api.ts", () => ({ uploadAttachment: vi.fn(), previewAttachment: vi.fn() }));
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

function pressSend(tree: ReactElement): void {
  findElement<{ onClick: () => void }>(
    tree,
    (element) => element.props.label === "Send",
  ).props.onClick();
}

test("literal drafts migrate and text changes preserve retained attachment references", () => {
  properties();
  localStorage.setItem("independum.draft.old", "Literal text.");
  expect(readDraft("old")).toBe("Literal text.");
  expect(JSON.parse(localStorage.getItem("independum.draft.old") ?? "null")).toEqual({
    version: 1,
    text: "Literal text.",
    attachments: [],
  });
  const references = [
    {
      isFile: true,
      summary: {
        id: "retained",
        name: "notes.txt",
        kind: "text" as const,
        encoding: "utf-8" as const,
        bytes: 4,
        mimeType: "text/plain",
        textBytes: 4,
      },
    },
  ];
  saveDraftAttachments("old", references);
  saveDraft("old", "Newer text.");
  expect(readDraftAttachments("old")).toEqual(references);
  saveDraft("old", "");
  expect(readDraftAttachments("old")).toEqual(references);
  saveDraftAttachments("old", []);
  expect(localStorage.getItem("independum.draft.old")).toBeNull();
});

test("picker paste and drop share upload delivery and preserve distinct pasted text", async () => {
  const props = properties();
  props.isReplying = false;
  vi.mocked(uploadAttachment).mockImplementation(async (_id, file) => ({
    id: file.name,
    name: file.name,
    kind: "text",
    encoding: "utf-8",
    bytes: file.size,
    mimeType: file.type,
    textBytes: file.size,
  }));
  vi.mocked(previewAttachment).mockImplementation(async (_chat, id, isFile) => ({
    id,
    name: id,
    kind: "text",
    encoding: "utf-8",
    bytes: 4,
    mimeType: "text/plain",
    textBytes: 4,
    isFile,
    modelText: "Text",
    image: null,
    notice: null,
    error: null,
  }));
  const view = renderHook(() => MessageBox(props));
  const picked = new File(["Text"], "picked.txt", { type: "text/plain" });
  const pasted = new File(["Text"], "pasted.txt", { type: "text/plain" });
  const dropped = new File(["Text"], "dropped.txt", { type: "text/plain" });
  findElement<{ onChange: (event: { target: { files: File[]; value: string } }) => void }>(
    view.render(),
    (element) => element.props["aria-label"] === "Attachment files",
  ).props.onChange({ target: { files: [picked], value: "selected" } });
  const prevented = vi.fn();
  findElement<{ onPaste: (event: unknown) => void }>(
    view.render(),
    (element) => element.type === "fieldset",
  ).props.onPaste({
    preventDefault: prevented,
    clipboardData: {
      files: [pasted],
      getData: (type: string) => (type === "text/plain" ? "Distinct text" : "<img>"),
    },
  });
  findElement<{ onDrop: (event: unknown) => void }>(
    view.render(),
    (element) => element.type === "fieldset",
  ).props.onDrop({ preventDefault: prevented, dataTransfer: { files: [dropped], items: [] } });
  await vi.waitFor(() => {
    view.render();
    expect(previewAttachment).toHaveBeenCalledWith(props.chatId, dropped.name, false);
  });
  await vi.waitFor(() =>
    expect(
      findElement<{ isFilled: boolean }>(view.render(), (element) => element.props.label === "Send")
        .props.isFilled,
    ).toBe(true),
  );
  expect(fieldOf(view.render()).value).toBe("Distinct text");
  expect(prevented).toHaveBeenCalledTimes(2);
  pressSend(view.render());
  await vi.waitFor(() =>
    expect(props.onSend).toHaveBeenCalledWith(
      "Distinct text",
      "preview-Distinct text",
      "queue",
      expect.any(String),
      [picked.name, pasted.name, dropped.name],
      [],
    ),
  );
  view.unmount();
});

test("a failed send restores its chat draft without replacing the open chat draft", async () => {
  const props = properties();
  props.chatId = "a";
  props.isReplying = false;
  const { promise: pending, reject } = Promise.withResolvers<void>();
  props.onSend = vi.fn(() => pending);
  saveDraft("b", "Draft in B");
  const view = renderHook(() => MessageBox(props));
  fieldOf(view.render()).onChange({ target: { value: "Message in A" } });
  pressSend(view.render());
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
      [],
      [],
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
      [],
      [],
    ),
  );
  expect(findElement(view.render(), (element) => element.props.label === "Stop")).toBeDefined();
});
