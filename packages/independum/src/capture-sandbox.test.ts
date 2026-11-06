import { PassThrough, Writable } from "node:stream";
import { spawn } from "@microsoft/mxc-sdk/v1";
import { expect, test, vi } from "vitest";
import { captureSandbox } from "./create-sandbox.ts";

vi.mock("@microsoft/mxc-sdk/v1", () => ({ spawn: vi.fn() }));

function workload() {
  const output = new PassThrough();
  const error = new PassThrough();
  const ended = Promise.withResolvers<{ exitCode: number }>();
  let input = "";
  const worker = {
    standardOutput: output,
    standardError: error,
    standardInput: new Writable({
      write(chunk, _encoding, done) {
        input += String(chunk);
        done();
      },
    }),
    warnings: [],
    wait: () => ended.promise,
    kill: vi.fn(() => {
      output.end();
      error.end();
      ended.resolve({ exitCode: 9 });
    }),
    dispose: vi.fn(),
  };
  vi.mocked(spawn).mockResolvedValue(worker as unknown as Awaited<ReturnType<typeof spawn>>);
  function finish(bytes: Buffer | string, diagnostic = ""): void {
    output.end(bytes);
    error.end(diagnostic);
    ended.resolve({ exitCode: 0 });
  }
  return { worker, input: () => input, finish };
}

const request = { command: "test" } as Parameters<typeof captureSandbox>[0];
const limits = { outputLimitBytes: 1024, errorLimitBytes: 1024, timeoutMs: 1000 };

test("captures complete utf8 output and writes one input before closing it", async () => {
  const { worker, finish, input } = workload();
  const pending = captureSandbox(request, '{"input":1}', undefined, limits);
  finish('{"apiVersion":1,"action":"continue"}', "diagnostic");
  expect(await pending).toMatchObject({
    output: '{"apiVersion":1,"action":"continue"}',
    error: "diagnostic",
    exitCode: 0,
  });
  expect(input()).toBe('{"input":1}');
  expect(worker.standardInput.writableEnded).toBe(true);
  expect(worker.dispose).toHaveBeenCalledOnce();
});

test.each(["output", "error"])(
  "exceeded %s limits kill the invocation instead of accepting a prefix",
  async (kind) => {
    const { worker, finish } = workload();
    const pending = captureSandbox(request, "", undefined, {
      ...limits,
      outputLimitBytes: 2,
      errorLimitBytes: 2,
    });
    finish(kind === "output" ? "long" : "{}", kind === "error" ? "long" : "");
    expect((await pending).failure).toContain("byte limit");
    expect(worker.kill).toHaveBeenCalled();
  },
);

test("invalid utf8 fails without accepting replacement characters", async () => {
  const { finish } = workload();
  const pending = captureSandbox(request, "", undefined, limits);
  finish(Buffer.from([0xff]));
  expect((await pending).failure).toContain("not valid UTF-8");
});

test("long deadlines remain pending instead of overflowing a native timer", async () => {
  const { finish } = workload();
  const pending = captureSandbox(request, "", undefined, { ...limits, timeoutMs: 2147483648 });
  finish("{}");
  expect((await pending).failure).toBeUndefined();
});

test("capture preserves a byte order mark in the diagnostic evidence", async () => {
  const { finish } = workload();
  const pending = captureSandbox(request, "", undefined, limits);
  finish("\uFEFF{}");
  expect((await pending).output).toBe("\uFEFF{}");
});

test("deadline cancellation and cancellation during native startup dispose the process", async () => {
  const timed = workload();
  expect(
    (await captureSandbox(request, "", undefined, { ...limits, timeoutMs: 1 })).failure,
  ).toContain("deadline");
  expect(timed.worker.dispose).toHaveBeenCalled();
  const startup = workload();
  const created = Promise.withResolvers<Awaited<ReturnType<typeof spawn>>>();
  vi.mocked(spawn).mockReturnValue(created.promise);
  const controller = new AbortController();
  const pending = captureSandbox(request, "", controller.signal, limits);
  controller.abort();
  created.resolve(startup.worker as unknown as Awaited<ReturnType<typeof spawn>>);
  expect((await pending).failure).toContain("cancelled");
  expect(startup.worker.kill).toHaveBeenCalledOnce();
});
