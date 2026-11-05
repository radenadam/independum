import type { RequestChange, RequestSummary } from "independum/api-types";
import { type ComponentProps, createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { expect, test, vi } from "vitest";
import { ContextParts } from "./context-parts.tsx";
import * as windowFigure from "./window-figure.tsx";

let figure: ComponentProps<typeof windowFigure.WindowFigure> | undefined;

vi.spyOn(windowFigure, "WindowFigure").mockImplementation((properties) => {
  figure = properties;
  return createElement("div");
});

const timestamp = "2026-11-05T10:00:00.000Z";

function compaction(entryId: string): RequestChange {
  return { kind: "compaction", entryId, timestamp, tokensBefore: 100, summarizedRequests: 1 };
}

test.each([false, true])(
  "the summary opens the latest compaction with pending changes %s",
  (isPending) => {
    const request: RequestSummary = {
      id: "turn",
      timestamp,
      provider: "faux",
      model: "faux-model",
      tokens: { input: 10, output: 5, reasoning: 0, cacheRead: 0, cacheWrite: 0 },
      cost: 0,
      inputs: [],
      reply: { label: "Model replied", preview: "Hello." },
      changes: [compaction("old"), compaction("latest")],
      isSummarized: false,
    };
    const onOpen = vi.fn();
    renderToStaticMarkup(
      createElement(ContextParts, {
        parts: [
          {
            group: "messages",
            label: "Summary",
            text: "The summary.",
            tokens: 10,
            section: "messages",
            source: "pi",
            preview: "The summary.",
            link: { kind: "piText", id: "compacted" },
          },
        ],
        total: 10,
        windowSize: 1000,
        reserve: 100,
        requests: [request],
        pendingChanges: isPending ? [compaction("pending")] : [],
        models: undefined,
        changedTools: 0,
        isSystemPromptEdited: false,
        compactionRow: null,
        current: undefined,
        onOpen,
      }),
    );
    figure?.onOpen("0");
    const id = isPending ? "pending" : "latest";
    expect(onOpen).toHaveBeenCalledWith(
      `compaction-${id}`,
      { kind: "compaction", id },
      { label: "Compaction", text: "" },
    );
  },
);
