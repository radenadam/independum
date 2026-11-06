import { expect, test, vi } from "vitest";
import { createChat } from "./create-chat.ts";
import { createChatRoutes } from "./create-chat-routes.ts";
import { createModelRuntime } from "./create-model-runtime.ts";
import { sandboxRuntime } from "./create-sandbox.ts";
import { createTestFolder, createTestProject } from "./tools/create-test-folder.ts";

const parent = createTestFolder("approval-routes");

async function setup() {
  const { directory, project } = createTestProject(parent);
  const models = await createModelRuntime(directory);
  const chat = await createChat({ models, directory, folder: project });
  return { chat, routes: createChatRoutes(chat, models) };
}

test("approval routes expose pending requests and reject stale, conflicting, and malformed answers", async () => {
  const { chat, routes } = await setup();
  const signal = new AbortController();
  try {
    const id = await chat.first();
    const opened = await chat.open(id);
    expect(opened?.getAgent().permissions?.mode).toBe("project");
    opened?.close();
    const result = chat.approvals.request(
      {
        chatId: id,
        toolCallId: "call",
        toolName: "Read",
        profileName: "Default",
        revision: "bound-revision",
        input: { path: "reference.txt" },
        resources: [],
        reasons: [],
        runtime: sandboxRuntime(process.execPath, "minimal", []),
      },
      signal.signal,
      () => undefined,
    );
    const pending = chat.approvals.pending(id)[0];
    const response = await routes.request(`/approvals?chatId=${id}`);
    expect(await response.json()).toEqual({ approvals: chat.approvals.pending(id) });
    const path = `/approvals/${pending?.id ?? "unknown"}`;
    async function answer(body: unknown): Promise<number> {
      return (
        await routes.request(path, {
          method: "POST",
          headers: { "content-type": "application/json" },
          body: JSON.stringify(body),
        })
      ).status;
    }
    expect(
      await answer({ revision: "bound-revision", decision: "allow", persistence: "rule" }),
    ).toBe(400);
    expect(
      await answer({
        revision: "bound-revision",
        decision: "allow",
        persistence: "once",
        extra: true,
      }),
    ).toBe(400);
    expect(await answer({ revision: "stale", decision: "allow", persistence: "once" })).toBe(409);
    const accepted = { revision: "bound-revision", decision: "allow", persistence: "once" };
    expect(await answer(accepted)).toBe(200);
    expect(await answer(accepted)).toBe(200);
    expect(await answer({ ...accepted, decision: "deny" })).toBe(409);
    expect(await result).toBe(true);
  } finally {
    signal.abort();
    await chat.stopAll();
  }
});

test("message routes default to headless approval delivery and require an explicit browser choice", async () => {
  const { chat, routes } = await setup();
  const id = await chat.first();
  const opened = await chat.open(id);
  if (opened === undefined) {
    throw new Error("The approval test needs an open chat.");
  }
  const send = vi.spyOn(opened, "send").mockResolvedValue(true);
  const open = vi.spyOn(chat, "open").mockResolvedValue(opened);
  async function post(approvalMode?: string): Promise<Response> {
    return routes.request(`/chats/${id}/messages`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({
        kind: "send",
        id: crypto.randomUUID(),
        delivery: "queue",
        expectedRevision: opened?.getState().pending.revision,
        expectedLeafId: opened?.getState().leafId,
        text: "Test",
        ...(approvalMode === undefined ? {} : { approvalMode }),
      }),
    });
  }
  try {
    expect((await post()).status).toBe(202);
    expect(send).toHaveBeenLastCalledWith(
      "Test",
      "commands",
      undefined,
      false,
      expect.objectContaining({ delivery: "queue" }),
    );
    expect((await post("browser")).status).toBe(202);
    expect(send).toHaveBeenLastCalledWith(
      "Test",
      "commands",
      undefined,
      true,
      expect.objectContaining({ delivery: "queue" }),
    );
    expect((await post("unrecognized")).status).toBe(400);
  } finally {
    open.mockRestore();
    send.mockRestore();
    opened.close();
    await chat.stopAll();
  }
});
