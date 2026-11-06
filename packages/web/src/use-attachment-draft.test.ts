import type { AttachmentPreview, AttachmentSummary } from "independum/api-types";
import { afterEach, expect, test, vi } from "vitest";
import { previewAttachment, uploadAttachment } from "./attachment-api.ts";
import { renderHook } from "./render-hook.ts";
import { useAttachmentDraft } from "./use-attachment-draft.ts";

vi.mock("react", async () => (await import("./render-hook.ts")).mockReact());
vi.mock("./attachment-api.ts", () => ({ uploadAttachment: vi.fn(), previewAttachment: vi.fn() }));
afterEach(() => {
  vi.resetAllMocks();
  vi.unstubAllGlobals();
});

const source: AttachmentSummary = {
  id: "source",
  name: "note.txt",
  kind: "text",
  encoding: "utf-8",
  mimeType: "text/plain",
  bytes: 4,
  textBytes: 4,
};
const prepared: AttachmentPreview = {
  ...source,
  isFile: false,
  modelText: "Text",
  image: null,
  notice: null,
  error: null,
};

function storageForTest(): Map<string, string> {
  const values = new Map<string, string>();
  vi.stubGlobal("localStorage", {
    getItem: (key: string) => values.get(key) ?? null,
    setItem: (key: string, value: string) => values.set(key, value),
    removeItem: (key: string) => values.delete(key),
  });
  return values;
}

test("an upload that completes after navigation stays with its source chat", async () => {
  const values = storageForTest();
  const pending = Promise.withResolvers<AttachmentSummary>();
  vi.mocked(uploadAttachment).mockReturnValue(pending.promise);
  vi.mocked(previewAttachment).mockResolvedValue(prepared);
  let chatId = "first";
  const view = renderHook(() => useAttachmentDraft(chatId, "model", undefined));
  view.render().add([new File(["Text"], "note.txt")]);
  expect(view.render().isReady).toBe(false);
  chatId = "second";
  expect(view.render().items).toEqual([]);
  pending.resolve(source);
  await pending.promise;
  expect(view.render().items).toEqual([]);
  chatId = "first";
  view.render();
  await vi.waitFor(() => expect(view.render().isReady).toBe(true));
  const saved = [...values.values()].join("");
  expect(saved).toContain("source");
  expect(saved).not.toContain("modelText");
  expect(saved).not.toContain("base64");
  view.unmount();
});

test("a changed model invalidates old preparation and file path choices trigger preparation", async () => {
  storageForTest();
  vi.mocked(uploadAttachment).mockResolvedValue(source);
  vi.mocked(previewAttachment).mockResolvedValue(prepared);
  let preparation = "first-model";
  const view = renderHook(() => useAttachmentDraft("chat", preparation, undefined));
  view.render().add([new File(["Text"], "note.txt")]);
  await vi.waitFor(() => expect(view.render().isReady).toBe(true));
  const next = Promise.withResolvers<AttachmentPreview>();
  vi.mocked(previewAttachment).mockReturnValue(next.promise);
  preparation = "second-model";
  expect(view.render().isReady).toBe(false);
  next.resolve({ ...prepared, error: "The text is too large." });
  await next.promise;
  expect(view.render().isReady).toBe(false);
  vi.mocked(previewAttachment).mockResolvedValue({ ...prepared, isFile: true });
  const key = view.render().items[0]?.key ?? "";
  view.render().chooseFile(key, true);
  await vi.waitFor(() => expect(view.render().isReady).toBe(true));
  expect(previewAttachment).toHaveBeenLastCalledWith("chat", source.id, true);
  view.unmount();
});

test("clearing an accepted submission preserves newer uploads and failed files stay visible", async () => {
  storageForTest();
  vi.mocked(uploadAttachment)
    .mockResolvedValueOnce(source)
    .mockRejectedValueOnce(new Error("Upload failed."));
  vi.mocked(previewAttachment).mockResolvedValue(prepared);
  const view = renderHook(() => useAttachmentDraft("chat", "model", undefined));
  view.render().add([new File(["Text"], "note.txt")]);
  await vi.waitFor(() => expect(view.render().isReady).toBe(true));
  const keys = view.render().items.map((item) => item.key);
  view.render().add([new File(["Next"], "next.txt")]);
  await vi.waitFor(() => expect(view.render().items[1]?.error).toBe("Upload failed."));
  view.render().clear("chat", keys);
  expect(view.render().items).toMatchObject([{ name: "next.txt", error: "Upload failed." }]);
  expect(view.render().isReady).toBe(false);
  view.unmount();
});
