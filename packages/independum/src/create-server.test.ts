import { expect, test } from "vitest";
import { createServer } from "./create-server.ts";

test("health route reports ok", async () => {
  const response = await createServer().request("/api/health");
  expect(response.status).toBe(200);
  expect(await response.json()).toEqual({ status: "ok" });
});
