import { Hono } from "hono";
import { expect, test, vi } from "vitest";
import { createHeadlessRoutes } from "./create-headless-routes.ts";
import type { Operations } from "./create-operations.ts";
import { createServer } from "./create-server.ts";
import { HeadlessError } from "./headless-types.ts";

function setup() {
  const operations: Operations = {
    prompt: vi.fn(async () => ({
      chatId: "one",
      operationId: "work-one",
      submissionId: "input-one",
      status: "running" as const,
      finalEntryId: null,
    })),
    show: vi.fn(),
    wait: vi.fn(),
    close: vi.fn(),
  };
  const server = createServer({
    token: "test-token",
    addresses: ["localhost:4870"],
    identity: { serverId: "server-one", version: "test", protocolVersion: 1 },
    api: new Hono().route("/", createHeadlessRoutes(operations)),
  });
  async function post(
    body: unknown,
    headers = { authorization: "Bearer test-token" },
  ): Promise<Response> {
    return server.request("http://localhost:4870/api/prompt", {
      method: "POST",
      headers: { ...headers, "content-type": "application/json" },
      body: JSON.stringify(body),
    });
  }
  return { server, operations, post };
}

test("headless endpoints retain token host and origin enforcement", async () => {
  const { post, operations, server } = setup();
  const input = { requestId: "one", text: "Task.", chatId: "one" };
  expect((await post(input, { authorization: "wrong" })).status).toBe(401);
  expect(
    (
      await server.request("http://outside.invalid:4870/api/prompt", {
        method: "POST",
        headers: { authorization: "Bearer test-token" },
      })
    ).status,
  ).toBe(403);
  expect(
    (
      await server.request("http://localhost:4870/api/prompt", {
        method: "POST",
        headers: { authorization: "Bearer test-token", origin: "http://outside.invalid" },
      })
    ).status,
  ).toBe(403);
  expect(operations.prompt).not.toHaveBeenCalled();
});

test("prompt validates all fields before passing exact input to the shared service", async () => {
  const { post, operations } = setup();
  expect(
    (
      await post({
        requestId: "one",
        text: "  Task.\n",
        project: "project",
        profile: { scope: "user", id: "build" },
      })
    ).status,
  ).toBe(202);
  expect(operations.prompt).toHaveBeenCalledWith({
    requestId: "one",
    text: "  Task.\n",
    project: "project",
    profile: { scope: "user", id: "build" },
  });
  vi.mocked(operations.prompt).mockClear();
  for (const body of [
    { text: "Task." },
    { requestId: "one", text: "" },
    { requestId: "one", text: "Task.", unknown: true },
    { requestId: "one", text: "Task.", attachmentIds: ["upload"] },
    { requestId: "one", text: "Task.", fileAttachmentIds: ["upload"] },
    { requestId: "one", text: "Task.", chatId: "one", project: "project" },
    { requestId: "one", text: "Task.", onQuestion: "allow" },
    { requestId: "one", text: "Task.", profile: { scope: "user", id: "../bad" } },
  ]) {
    expect((await post(body)).status).toBe(400);
  }
  expect(operations.prompt).not.toHaveBeenCalled();
});

test("operation errors and health use stable compact metadata", async () => {
  const { operations, server } = setup();
  vi.mocked(operations.show).mockRejectedValue(
    new HeadlessError("No operation has that id.", "operationMissing", 3),
  );
  const response = await server.request("http://localhost:4870/api/operations/missing", {
    headers: { authorization: "Bearer test-token" },
  });
  expect(response.status).toBe(404);
  expect(await response.json()).toMatchObject({ code: "operationMissing", exitCode: 3 });
  const health = await server.request("http://localhost:4870/api/health", {
    headers: { authorization: "Bearer test-token" },
  });
  expect(await health.json()).toEqual({
    status: "ok",
    serverId: "server-one",
    version: "test",
    protocolVersion: 1,
  });
});
