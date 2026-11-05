import { afterEach, expect, test, vi } from "vitest";
import { startLogin } from "./login-api.ts";
import { requestApi } from "./request-api.ts";

vi.mock("./request-api.ts", () => ({ requestApi: vi.fn() }));
vi.mock("./read-events.ts", () => ({ readEvents: async () => undefined }));

afterEach(() => vi.resetAllMocks());

test("a rejected login answer can be sent again through the same login handle", async () => {
  vi.mocked(requestApi)
    .mockResolvedValueOnce(Response.json({ id: "login" }))
    .mockResolvedValueOnce(new Response())
    .mockResolvedValueOnce(new Response(null, { status: 500 }))
    .mockResolvedValueOnce(new Response(null, { status: 204 }));
  const handle = await startLogin("provider", "apiKey", vi.fn());
  await expect(handle.answer("question", "answer")).rejects.toThrow(
    "The answer could not be sent. Try again.",
  );
  await expect(handle.answer("question", "answer")).resolves.toBeUndefined();
  expect(requestApi).toHaveBeenLastCalledWith("/api/logins/login/answers", {
    body: { questionId: "question", value: "answer" },
  });
});
