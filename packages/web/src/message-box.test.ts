import type { ComponentProps, ReactElement } from "react";
import { afterEach, expect, test, vi } from "vitest";
import { previewAttachment, uploadAttachment } from "./attachment-api.ts";
import { AttachmentList } from "./attachment-list.tsx";
import { composeMessage } from "./chat-api.ts";
import { readDraft, readDraftAttachments, saveDraft, saveDraftAttachments } from "./chat-draft.ts";
import { MessageBox } from "./message-box.tsx";
import { clickAction, findElement, renderHook } from "./render-hook.ts";

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
  expect(readDraft("old").text).toBe("Literal text.");
  expect(JSON.parse(localStorage.getItem("independum.draft.old") ?? "null")).toEqual({
    version: 1,
    text: "Literal text.",
    attachments: [],
    edit: null,
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
  saveDraft("old", { ...readDraft("old"), text: "Newer text." });
  expect(readDraftAttachments("old")).toEqual(references);
  saveDraft("old", { ...readDraft("old"), text: "" });
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
  saveDraft("b", { version: 1, text: "Draft in B", attachments: [], edit: null });
  const view = renderHook(() => MessageBox(props));
  fieldOf(view.render()).onChange({ target: { value: "Message in A" } });
  pressSend(view.render());
  await vi.waitFor(() => expect(composeMessage).toHaveBeenCalledWith("a", "Message in A"));
  props.chatId = "b";
  expect(fieldOf(view.render()).value).toBe("Draft in B");
  reject(new Error("The send failed."));
  await pending.catch(() => undefined);
  expect(fieldOf(view.render()).value).toBe("Draft in B");
  expect(readDraft("a").text).toBe("Message in A");
  expect(readDraft("b").text).toBe("Draft in B");
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
    expect(readDraft(props.chatId).text).toBe("Newer draft");
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

test("an edit keeps the ordinary draft and cancel restores it after a reload", () => {
  const props = properties();
  props.isReplying = false;
  saveDraft(props.chatId, {
    version: 1,
    text: "Ordinary draft",
    attachments: [],
    edit: null,
  });
  props.editRequest = {
    chatId: props.chatId ?? "",
    sourceUserEntryId: "source",
    text: "Original prompt",
    expectedLeafId: "leaf",
    expectedRevision: 4,
    at: 1,
    imageCount: 1,
  };
  const view = renderHook(() => MessageBox(props));
  expect(fieldOf(view.render()).value).toBe("Original prompt");
  fieldOf(view.render()).onChange({ target: { value: "Edited prompt" } });
  view.unmount();
  props.editRequest = undefined;
  const reopened = renderHook(() => MessageBox(props));
  expect(fieldOf(reopened.render()).value).toBe("Edited prompt");
  findElement<{ onClick: () => void }>(
    reopened.render(),
    (element) => element.props.label === "Cancel edit",
  ).props.onClick();
  expect(fieldOf(reopened.render()).value).toBe("Ordinary draft");
  expect(readDraft(props.chatId)).toMatchObject({
    text: "Ordinary draft",
    attachments: [],
    edit: null,
  });
  reopened.unmount();
});

test("editing can remove and add retained attachments while preserving the ordinary draft", async () => {
  const props = properties();
  props.isReplying = false;
  props.onEditSend = vi.fn(async () => undefined);
  const original = {
    id: "original",
    name: "original.txt",
    kind: "text" as const,
    encoding: "utf-8" as const,
    bytes: 4,
    mimeType: "text/plain",
    textBytes: 4,
  };
  const ordinary = { summary: { ...original, id: "ordinary", name: "ordinary.txt" }, isFile: true };
  saveDraft(props.chatId, {
    version: 1,
    text: "Ordinary draft",
    attachments: [ordinary],
    edit: null,
  });
  vi.mocked(previewAttachment).mockImplementation(async (_chat, id, isFile) => ({
    ...original,
    id,
    isFile,
    image: null,
    error: null,
    notice: null,
    modelText: "Prepared content",
  }));
  vi.mocked(uploadAttachment).mockResolvedValue({ ...original, id: "added", name: "added.txt" });
  props.editRequest = {
    chatId: props.chatId ?? "",
    sourceUserEntryId: "source",
    text: "/literal prompt",
    expectedLeafId: "leaf",
    expectedRevision: 1,
    at: 1,
    imageCount: 0,
    attachments: [
      {
        ...original,
        isFile: true,
        image: null,
        error: null,
        notice: null,
        modelText: "Private prepared content",
      },
    ],
  };
  const view = renderHook(() => MessageBox(props));
  function list(): ComponentProps<typeof AttachmentList> {
    return findElement<ComponentProps<typeof AttachmentList>>(
      view.render(),
      (element) => element.type === AttachmentList,
    ).props;
  }
  expect(list().items.map((item) => [item.summary?.id, item.isFile])).toEqual([["original", true]]);
  expect(localStorage.getItem(`independum.draft.${props.chatId}`)).not.toContain(
    "Private prepared content",
  );
  list().onRemove?.("original");
  findElement<{ onChange: (event: { target: { files: File[]; value: string } }) => void }>(
    view.render(),
    (element) => element.props["aria-label"] === "Attachment files",
  ).props.onChange({ target: { files: [new File(["Text"], "added.txt")], value: "selected" } });
  await vi.waitFor(() => expect(list().items[0]?.preview).toBeDefined());
  list().onChooseFile?.(list().items[0]?.key ?? "", true);
  await vi.waitFor(() => expect(list().items[0]?.preview?.isFile).toBe(true));
  clickAction(view.render(), "Send");
  await vi.waitFor(() =>
    expect(props.onEditSend).toHaveBeenCalledWith(
      expect.objectContaining({
        text: "/literal prompt",
        id: expect.any(String),
        sourceUserEntryId: "source",
        expectedLeafId: "leaf",
        expectedRevision: 1,
        attachmentIds: ["added"],
        fileAttachmentIds: ["added"],
      }),
    ),
  );
  await vi.waitFor(() => expect(fieldOf(view.render()).value).toBe("Ordinary draft"));
  expect(list().items.map((item) => item.summary?.id)).toEqual(["ordinary"]);
  expect(readDraftAttachments(props.chatId ?? "")).toEqual([ordinary]);
  expect(props.onSend).not.toHaveBeenCalled();
  view.unmount();
});
