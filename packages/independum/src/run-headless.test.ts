import { writeFileSync } from "node:fs";
import { join } from "node:path";
import { expect, test, vi } from "vitest";
import type { OperationView } from "./create-operations.ts";
import { type HeadlessClientOptions, runHeadless } from "./run-headless.ts";
import { createTestFolder } from "./tools/create-test-folder.ts";

const parent = createTestFolder("headless-client");
const token = "a-private-client-token-that-must-never-print";
const final: OperationView = {
  chatId: "chat-one",
  operationId: "operation-one",
  submissionId: "submission-one",
  status: "completed",
  finalEntryId: "entry-one",
  text: "Final answer.",
};

function client(result: OperationView = final) {
  const stdout: string[] = [];
  const stderr: string[] = [];
  const bodies: unknown[] = [];
  const request = vi.fn<typeof fetch>(async (input, initialization) => {
    const path = new URL(String(input)).pathname;
    expect(initialization?.redirect).toBe("error");
    expect(initialization?.headers).toMatchObject({ authorization: `Bearer ${token}` });
    if (initialization?.body) {
      bodies.push(JSON.parse(String(initialization.body)));
    }
    if (path === "/api/health") {
      return Response.json({
        status: "ok",
        serverId: "server-one",
        version: "test",
        protocolVersion: 1,
      });
    }
    if (path === "/api/server/stop") {
      return new Response(null, { status: 204 });
    }
    return Response.json(result);
  });
  const options: HeadlessClientOptions = {
    directory: parent,
    folder: parent,
    token,
    request,
    stdin: vi.fn(async () => "Input from stdin.\n"),
    stdout: (text) => {
      stdout.push(text);
    },
    stderr: (text) => {
      stderr.push(text);
    },
  };
  async function run(argumentsList: string[]): Promise<number> {
    const code = await runHeadless(
      [...argumentsList, "--server", "http://127.0.0.1:4870"],
      options,
    );
    expect([...stdout, ...stderr].join("")).not.toContain(token);
    return code;
  }
  return { stdout, stderr, bodies, request, options, run };
}

test("prompt prints only the last assistant text and preserves the exact supplied prompt", async () => {
  const fixture = client();
  expect(await fixture.run(["prompt", "  Exact input.\n", "--chat", "chat-one", "--literal"])).toBe(
    0,
  );
  expect(fixture.stdout).toEqual(["Final answer.\n"]);
  expect(fixture.stderr).toEqual([]);
  expect(fixture.bodies[0]).toMatchObject({
    text: "  Exact input.\n",
    chatId: "chat-one",
    isLiteral: true,
    onQuestion: "fail",
  });
});

test("new prompts use the invoking project and accept an exact scoped profile", async () => {
  const fixture = client();
  expect(await fixture.run(["prompt", "Task.", "--profile", "project:build"])).toBe(0);
  expect(fixture.bodies[0]).toMatchObject({
    project: parent,
    profile: { scope: "project", id: "build" },
  });
});

test("a no-wait prompt prints only its chat and operation receipt", async () => {
  const fixture = client({ ...final, status: "running", finalEntryId: null });
  expect(await fixture.run(["prompt", "Task.", "--no-wait"])).toBe(0);
  expect(fixture.stdout).toEqual(["chat chat-one\noperation operation-one\n"]);
  expect(fixture.request).toHaveBeenCalledTimes(2);
});

test("final json lines output has one correlated result and honors field selection", async () => {
  const fixture = client();
  expect(
    await fixture.run([
      "wait",
      "operation-one",
      "--format",
      "jsonl",
      "--request-id",
      "driver-one",
      "--fields",
      "chatId,text",
    ]),
  ).toBe(0);
  expect(fixture.stdout).toHaveLength(1);
  expect(JSON.parse(fixture.stdout[0] ?? "")).toEqual({
    version: 1,
    id: "driver-one",
    type: "result",
    status: "completed",
    data: { chatId: "chat-one", text: "Final answer." },
  });
  expect(fixture.stderr).toEqual([]);
});

test("prompt file and stdin sources retain whitespace", async () => {
  const path = join(parent, "prompt.txt");
  writeFileSync(path, "\n  File task.\r\n");
  const file = client();
  expect(await file.run(["prompt", "--text-file", path])).toBe(0);
  expect(file.bodies[0]).toMatchObject({ text: "\n  File task.\r\n" });
  const input = client();
  expect(await input.run(["prompt", "--text-file", "-"])).toBe(0);
  expect(input.bodies[0]).toMatchObject({ text: "Input from stdin.\n" });
});

test("invalid utf-8 input fails before connecting and stdin respects the deadline", async () => {
  const path = join(parent, "invalid-input.txt");
  writeFileSync(path, Buffer.from([0xc3, 0x28]));
  const invalid = client();
  expect(await invalid.run(["prompt", "--text-file", path])).toBe(2);
  expect(invalid.request).not.toHaveBeenCalled();
  const waiting = client();
  waiting.options.stdin = vi.fn(() => new Promise<string>(() => undefined));
  expect(await waiting.run(["prompt", "--text-file", "-", "--timeout-ms", "10"])).toBe(8);
  expect(waiting.request).not.toHaveBeenCalled();
});

test.each([
  ["prompt", "Task.", "--text-file", "task.txt"],
  ["prompt", "--text-file", "-", "--access-token-stdin"],
  ["prompt", "Task.", "--chat", "one", "--project", "."],
  ["prompt", "Task.", "--chat", "one", "--profile", "build"],
  ["prompt", "Task.", "--fields", "missing"],
  ["prompt", "Task.", "--unknown"],
  ["prompt", "Task.", "--format", "json"],
  ["prompt", "Task.", "--timeout-ms", "-1"],
  ["prompt", "Task.", "--start", "sometimes"],
  ["prompt", "Task.", "--on-question", "grant"],
  ["prompt", "Task.", "--no-wait", "--no-wait"],
  ["wait"],
  ["wait", "one", "--literal"],
  ["control"],
])("invalid command %j fails before a connection", async (...argumentsList) => {
  const fixture = client();
  expect(await fixture.run(argumentsList)).toBe(2);
  expect(fixture.request).not.toHaveBeenCalled();
});

test.each([["prompt", "--help"], ["wait", "--help"], ["server", "--help"], ["--version"]])(
  "help and version remain offline for %j",
  async (...argumentsList) => {
    const fixture = client();
    expect(await fixture.run(argumentsList)).toBe(0);
    expect(fixture.request).not.toHaveBeenCalled();
    expect(fixture.stdout.join("")).not.toBe("");
  },
);

test.each([
  ["failed", 1],
  ["cancelled", 9],
  ["outputLimited", 10],
  ["interrupted", 5],
] as const)("wait reports %s without printing partial output", async (status, expected) => {
  const fixture = client({ ...final, status });
  expect(await fixture.run(["wait", "operation-one"])).toBe(expected);
  expect(fixture.stdout).toEqual([]);
  expect(fixture.stderr.join("")).toContain("operation operation-one");
});

test("approval required names the operation and tool call with code seven", async () => {
  const fixture = client({
    ...final,
    status: "running",
    code: "approvalRequired",
    toolCallId: "call-one",
  });
  expect(await fixture.run(["prompt", "Task.", "--format", "jsonl"])).toBe(7);
  expect(fixture.stdout).toHaveLength(1);
  expect(JSON.parse(fixture.stdout[0] ?? "")).toMatchObject({
    type: "error",
    code: "approvalRequired",
    data: { operationId: "operation-one", toolCallId: "call-one" },
  });
});

test("wait reconnects silently after a bounded pending response", async () => {
  const fixture = client();
  fixture.request
    .mockImplementationOnce(async () =>
      Response.json({ status: "ok", serverId: "server-one", protocolVersion: 1 }),
    )
    .mockImplementationOnce(async () => Response.json({ ...final, status: "running" }))
    .mockImplementationOnce(async () => Response.json({ ...final, status: "running" }))
    .mockImplementationOnce(async () => Response.json(final));
  expect(await fixture.run(["wait", "operation-one"])).toBe(0);
  expect(fixture.stdout).toEqual(["Final answer.\n"]);
  expect(fixture.stderr).toEqual([]);
  expect(fixture.request).toHaveBeenCalledTimes(4);
});

test.each([
  ["deadline", 8],
  ["interrupt", 130],
] as const)("a client %s detaches without sending a stop", async (kind, expected) => {
  const fixture = client();
  const controller = new AbortController();
  fixture.options.signal = controller.signal;
  fixture.request.mockImplementation(async (input, initialization) => {
    const path = new URL(String(input)).pathname;
    if (path === "/api/health") {
      return Response.json({ status: "ok", serverId: "one", protocolVersion: 1 });
    }
    if (!path.endsWith("/wait")) {
      return Response.json({ ...final, status: "running" });
    }
    return new Promise<Response>((_resolve, reject) => {
      initialization?.signal?.addEventListener("abort", () => reject(new Error("Detached.")), {
        once: true,
      });
      if (kind === "interrupt") {
        controller.abort();
      }
    });
  });
  expect(
    await fixture.run([
      "wait",
      "operation-one",
      ...(kind === "deadline" ? ["--timeout-ms", "10"] : []),
    ]),
  ).toBe(expected);
  expect(fixture.request.mock.calls.every(([input]) => !String(input).includes("/stop"))).toBe(
    true,
  );
  expect(fixture.stdout).toEqual([]);
});

test("server commands keep tokens out of their output", async () => {
  for (const action of ["start", "status", "stop"]) {
    const fixture = client();
    expect(await fixture.run(["server", action])).toBe(0);
    expect(fixture.stdout.join("")).not.toContain(token);
    if (action === "stop") {
      expect(fixture.bodies[0]).toEqual({ force: false });
    }
  }
});

test("operation text and correlation ids cannot print the transport token", async () => {
  const fixture = client({ ...final, text: `The content repeats ${token}.` });
  expect(
    await fixture.run(["wait", "operation-one", "--format", "jsonl", "--request-id", token]),
  ).toBe(0);
  expect(JSON.parse(fixture.stdout[0] ?? "")).toMatchObject({
    id: "[redacted]",
    data: { text: "The content repeats [redacted]." },
  });
});

test("foreground startup uses only its server lifecycle without client output", async () => {
  const fixture = client();
  fixture.options.serve = vi.fn(async () => undefined);
  expect(await runHeadless(["server", "start", "--foreground"], fixture.options)).toBe(0);
  expect(fixture.options.serve).toHaveBeenCalledOnce();
  expect(fixture.request).not.toHaveBeenCalled();
  expect(fixture.stdout).toEqual([]);
});

test("an http error maps its exit code and redacts the token", async () => {
  const fixture = client();
  fixture.request
    .mockImplementationOnce(async () =>
      Response.json({ status: "ok", serverId: "one", protocolVersion: 1 }),
    )
    .mockImplementationOnce(async () =>
      Response.json({ error: `Rejected ${token}.` }, { status: 409 }),
    );
  expect(await fixture.run(["prompt", "Task."])).toBe(6);
  expect(fixture.stderr.join("")).toContain("[redacted]");
});
