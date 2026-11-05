import { afterEach, expect, test, vi } from "vitest";
import {
  changeSettings,
  chooseModel,
  chooseThinking,
  compactChat,
  fetchAgent,
  fetchContext,
  followChat,
  followChats,
  moveCommandToBackground,
  sendMessage,
  startNewChat,
  stopCommand,
  stopReply,
} from "./chat-api.ts";
import { requestApi } from "./request-api.ts";

vi.mock("./request-api.ts", () => ({ requestApi: vi.fn() }));

afterEach(() => vi.resetAllMocks());

test("each request keeps its chat id even when another chat is read", async () => {
  const request = vi.mocked(requestApi);
  request.mockImplementation(async () => Response.json({ id: "created" }));
  await chooseModel("first", "provider", "model");
  await fetchContext("second");
  await sendMessage("first", "Hello");
  await chooseThinking("second", "high");
  await fetchAgent("first");
  await compactChat("second");
  await moveCommandToBackground("second", "call with spaces");
  await stopCommand("first", "call");
  await stopReply("second");
  expect(await startNewChat("first", "folder")).toBe("created");
  expect(request.mock.calls.map(([path]) => path)).toEqual([
    "/api/chats/first/model",
    "/api/chats/second/context",
    "/api/chats/first/messages",
    "/api/chats/second/thinking",
    "/api/chats/first/agent",
    "/api/chats/second/compact",
    "/api/chats/second/commands/call%20with%20spaces/background",
    "/api/chats/first/commands/call/stop",
    "/api/chats/second/stop",
    "/api/chats/first/new",
  ]);
  expect(request.mock.calls.at(-1)?.[1]?.body).toEqual({ folder: "folder" });
});

test("a missing chat ends its stream and lets the tab choose again", async () => {
  vi.mocked(requestApi).mockResolvedValue(new Response(null, { status: 404 }));
  const missing = vi.fn();
  const stop = followChat("missing", vi.fn(), vi.fn(), missing);
  await vi.waitFor(() => expect(missing).toHaveBeenCalledOnce());
  expect(requestApi).toHaveBeenCalledWith("/api/chats/missing/events", expect.anything());
  stop();
});

test("a response from a chat that the tab left cannot change its choice", async () => {
  const pending = Promise.withResolvers<Response>();
  vi.mocked(requestApi).mockReturnValue(pending.promise);
  const missing = vi.fn();
  const stop = followChat("left", vi.fn(), vi.fn(), missing);
  stop();
  pending.resolve(new Response(null, { status: 404 }));
  await pending.promise;
  expect(missing).not.toHaveBeenCalled();
});

test("a tab follows its chosen chat and the shared events through separate streams", async () => {
  const controllers: ReadableStreamDefaultController<Uint8Array>[] = [];
  vi.mocked(requestApi).mockImplementation(async (_path, options) => {
    const body = new ReadableStream<Uint8Array>({
      start(controller) {
        controllers.push(controller);
        options?.signal?.addEventListener("abort", () => controller.close());
      },
    });
    return new Response(body);
  });
  const first = vi.fn();
  const second = vi.fn();
  const shared = vi.fn();
  const stopFirst = followChat("first", first, vi.fn(), vi.fn());
  const stopSecond = followChat("second", second, vi.fn(), vi.fn());
  const stopShared = followChats(shared, vi.fn());
  const encoder = new TextEncoder();
  controllers[0]?.enqueue(
    encoder.encode('data: {"type":"replyDelta","index":0,"partType":"text","delta":"First"}\n\n'),
  );
  controllers[1]?.enqueue(
    encoder.encode('data: {"type":"replyDelta","index":0,"partType":"text","delta":"Second"}\n\n'),
  );
  controllers[2]?.enqueue(
    encoder.encode('data: {"type":"replyingChats","ids":["first","second"]}\n\n'),
  );
  await vi.waitFor(() => {
    expect(first).toHaveBeenCalledWith(expect.objectContaining({ delta: "First" }));
    expect(second).toHaveBeenCalledWith(expect.objectContaining({ delta: "Second" }));
    expect(shared).toHaveBeenCalledWith({ type: "replyingChats", ids: ["first", "second"] });
  });
  stopFirst();
  stopSecond();
  stopShared();
  expect(requestApi).toHaveBeenCalledTimes(3);
});

test.each([
  {
    action: "stop a command",
    run: () => stopCommand("chat 1", "call 1"),
    path: "/api/chats/chat%201/commands/call%201/stop",
    failure: "The command could not be stopped.",
  },
  {
    action: "background a command",
    run: () => moveCommandToBackground("chat 1", "call 1"),
    path: "/api/chats/chat%201/commands/call%201/background",
    failure: "The command could not move to the background.",
  },
  {
    action: "compact a chat",
    run: () => compactChat("chat 1"),
    path: "/api/chats/chat%201/compact",
    failure: "The chat could not start compaction.",
  },
  {
    action: "stop a reply",
    run: () => stopReply("chat 1"),
    path: "/api/chats/chat%201/stop",
    failure: "The reply could not be stopped.",
  },
])(
  "an unsuccessful request to $action rejects and a successful one resolves",
  async ({ run, path, failure }) => {
    vi.mocked(requestApi)
      .mockResolvedValueOnce(new Response(null, { status: 500 }))
      .mockResolvedValueOnce(new Response(null, { status: 204 }));
    await expect(run()).rejects.toThrow(failure);
    await expect(run()).resolves.toBeUndefined();
    expect(requestApi).toHaveBeenCalledWith(path, { method: "POST" });
  },
);

test.each([stopCommand, moveCommandToBackground])(
  "an ended command needs no failure notice",
  async (run) => {
    vi.mocked(requestApi).mockResolvedValue(new Response(null, { status: 404 }));
    await expect(run("chat", "ended-call")).resolves.toBeUndefined();
  },
);

test("saving profile settings sends the editor revision to its explicit resource", async () => {
  const agent = { systemPrompt: "The profile prompt." };
  const configuration = {
    profile: {
      reference: { scope: "user", id: "research" },
      projectId: "project",
      revision: '"revision"',
    },
  } as import("independum/api-types").ChatConfiguration;
  vi.mocked(requestApi).mockResolvedValueOnce(Response.json(agent));
  await expect(
    changeSettings("first", { compaction: { isEnabled: false } }, configuration),
  ).resolves.toEqual(agent);
  expect(requestApi).toHaveBeenCalledWith(
    "/api/profiles/user/research/settings?projectId=project",
    { method: "PUT", revision: '"revision"', body: { compaction: { isEnabled: false } } },
  );
});
