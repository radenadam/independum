import { expect, test, vi } from "vitest";
import { waitFor } from "../../../scripts/wait-for.ts";
import { reconnectAfterDrop } from "./answer-with-streams.ts";
import { renderHook } from "./render-hook.ts";
import { useServerData } from "./use-server-data.ts";

vi.mock("react", async () => (await import("./render-hook.ts")).mockReact());
vi.mock("./request-api.ts", () => ({ requestApi: vi.fn() }));

test("a failed load keeps the shown data until the server returns and a load succeeds", async () => {
  const load = vi
    .fn<() => Promise<string>>()
    .mockResolvedValueOnce("Before the restart")
    .mockRejectedValueOnce(new TypeError("The server could not be reached."))
    .mockResolvedValueOnce("After the restart");
  let version = 0;
  const view = renderHook(() => useServerData(load, version));
  view.render();
  await waitFor(() => expect(view.render().data).toBe("Before the restart"));
  version = 1;
  await waitFor(() =>
    expect(view.render()).toMatchObject({
      data: "Before the restart",
      failure: "The server could not be reached.",
    }),
  );
  await reconnectAfterDrop();
  await waitFor(() =>
    expect(view.render()).toMatchObject({ data: "After the restart", failure: undefined }),
  );
  expect(load).toHaveBeenCalledTimes(3);
  view.unmount();
});
