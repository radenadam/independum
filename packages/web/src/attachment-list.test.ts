import type { AttachmentPreview } from "independum/api-types";
import { expect, test, vi } from "vitest";
import { AttachmentList } from "./attachment-list.tsx";
import { CodeWell } from "./code-well.tsx";
import { findElement, renderElement, renderHook } from "./render-hook.ts";

vi.mock("react", async () => (await import("./render-hook.ts")).mockReact());

test("saved attachment inspection explains missing exact text without claiming no input", () => {
  const preview: AttachmentPreview = {
    id: "saved-file",
    name: "file.pdf",
    mimeType: "application/pdf",
    bytes: 12,
    kind: "file",
    encoding: null,
    textBytes: 0,
    isFile: true,
    modelText: null,
    image: null,
    error: null,
    notice: null,
  };
  const view = renderHook(() =>
    AttachmentList({
      chatId: "chat",
      items: [{ key: preview.id, name: preview.name, summary: preview, preview, isFile: true }],
    }),
  );
  findElement<{ onOpen: () => void }>(
    view.render(),
    (element) => element.props.label === preview.name,
  ).props.onOpen();
  const input = renderElement(
    findElement<{ preview: AttachmentPreview }>(
      view.render(),
      (element) => element.props.preview === preview,
    ),
  );
  expect(
    findElement<{ children: string }>(
      input,
      (element) => typeof element.props.children === "string",
    ).props.children,
  ).toBe("The attachment's exact model text cannot be located in this saved message.");
  expect(() => findElement(input, (element) => element.type === CodeWell)).toThrow();
  view.unmount();
});
