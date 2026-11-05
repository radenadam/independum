import type { ChildProcess } from "node:child_process";
import { spawn } from "node:child_process";
import { EventEmitter } from "node:events";
import { PassThrough } from "node:stream";
import { afterEach, expect, test, vi } from "vitest";
import { runCommand } from "./run-command.ts";

vi.mock("node:child_process", () => ({ spawn: vi.fn() }));

const platform = process.platform;

afterEach(() => {
  Object.defineProperty(process, "platform", { value: platform });
  vi.restoreAllMocks();
  vi.useRealTimers();
});

test.each([
  { name: "after stop", hasExited: false },
  { name: "before stop", hasExited: true },
])(
  "stop kills surviving group members when the shell exits successfully $name",
  async ({ hasExited }) => {
    Object.defineProperty(process, "platform", { value: "linux" });
    vi.useFakeTimers();
    const child = Object.assign(new EventEmitter(), {
      pid: 1234,
      exitCode: null as number | null,
      signalCode: null,
      stdout: new PassThrough(),
      stderr: new PassThrough(),
    });
    vi.mocked(spawn).mockReturnValue(child as unknown as ChildProcess);
    const kill = vi.spyOn(process, "kill").mockImplementation((_pid, signal) => {
      if (signal === "SIGTERM" && !hasExited) {
        child.exitCode = 0;
        child.emit("exit", 0, null);
        child.emit("close", 0, null);
      }
      return true;
    });
    const controller = new AbortController();
    const running = runCommand({
      shell: { kind: "bash", name: "Bash", path: "bash" },
      command: "wrapper with a child",
      folder: process.cwd(),
      environment: {},
      timeoutMs: undefined,
      signal: controller.signal,
      onOutput: () => undefined,
    });
    if (hasExited) {
      child.exitCode = 0;
      child.emit("exit", 0, null);
    }
    controller.abort();
    expect(kill).toHaveBeenCalledWith(-1234, "SIGTERM");
    await vi.advanceTimersByTimeAsync(2000);
    expect(await running).toMatchObject({ ending: "stopped", exitCode: 0 });
    expect(kill).toHaveBeenCalledWith(-1234, "SIGKILL");
  },
);
