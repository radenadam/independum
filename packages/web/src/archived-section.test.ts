import { expect, test, vi } from "vitest";
import { waitFor } from "../../../scripts/wait-for.ts";
import { reconnectAfterDrop } from "./answer-with-streams.ts";
import { ArchivedSection } from "./archived-section.tsx";
import { fetchArchivedChats } from "./chat-api.ts";
import { renderHook } from "./render-hook.ts";

vi.mock("react", async () => (await import("./render-hook.ts")).mockReact());
vi.mock("./chat-api.ts", async (importOriginal) => ({
  ...(await importOriginal<typeof import("./chat-api.ts")>()),
  fetchArchivedChats: vi.fn(),
}));
vi.mock("./request-api.ts", () => ({ requestApi: vi.fn() }));

test("archived chats that load after the server returns clear the failure notice", async () => {
  vi.mocked(fetchArchivedChats)
    .mockRejectedValueOnce(new TypeError("The server could not be reached."))
    .mockResolvedValueOnce([]);
  const view = renderHook(() => ArchivedSection());
  view.render();
  await waitFor(() =>
    expect(JSON.stringify(view.render())).toContain("The archived chats could not be loaded."),
  );
  await reconnectAfterDrop();
  await waitFor(() => {
    const shown = JSON.stringify(view.render());
    expect(shown).toContain("No chats are archived.");
    expect(shown).not.toContain("could not be loaded");
  });
  view.unmount();
});
