import type { ChildProcess } from "node:child_process";
import type { Readable, Writable } from "node:stream";
import { maximumFrameBytes, roundTripJson } from "./schemas.ts";

export type TransportEvent =
  | { type: "message"; value: unknown }
  | { type: "fault"; reason: string; bytes: string }
  | { type: "diagnostic"; text: string }
  | { type: "end" }
  | { type: "exit"; code: number | null; signal: string | null };
export interface ProtocolTransport {
  kind: "in-process" | "standard-streams";
  canTerminate: boolean;
  listen(listener: (event: TransportEvent) => void): void;
  send(value: unknown): void;
  close(): void;
  terminate(): void;
}
export interface StreamTransportOptions {
  input: Readable;
  output: Writable;
  diagnostics?: Readable;
  worker?: ChildProcess;
}

/** Connects trusted code through the same byte codec as standard streams. */
export function createInProcessTransports(): [ProtocolTransport, ProtocolTransport] {
  const channels = [createChannel(), createChannel()] as const;
  return [0, 1].map((index) => {
    const own = channels[index === 0 ? 0 : 1];
    const other = channels[index === 0 ? 1 : 0];
    let isClosed = false;
    return {
      kind: "in-process" as const,
      canTerminate: false,
      listen: own.listen,
      send(value: unknown): void {
        if (isClosed) {
          throw new Error("The transport is closed.");
        }
        const bytes = encodeFrame(value);
        queueMicrotask(() => decodeFrame(bytes.subarray(0, -1), other.emit));
      },
      close(): void {
        if (!isClosed) {
          isClosed = true;
          queueMicrotask(() => other.emit({ type: "end" }));
        }
      },
      terminate(): void {
        throw new Error("Trusted in-process execution cannot be forcibly terminated.");
      },
    };
  }) as [ProtocolTransport, ProtocolTransport];
}

/** Carries UTF-8 newline frames and keeps diagnostics and actual worker exit separate. */
export function createStreamTransport(options: StreamTransportOptions): ProtocolTransport {
  const channel = createChannel();
  let pending = Buffer.alloc(0);
  let isClosed = false;
  const diagnosticDecoder = new TextDecoder("utf-8");
  function receive(chunk: Buffer): void {
    pending = Buffer.concat([pending, chunk]);
    let newline = pending.indexOf(10);
    while (newline !== -1) {
      decodeFrame(pending.subarray(0, newline), channel.emit);
      pending = pending.subarray(newline + 1);
      newline = pending.indexOf(10);
    }
    if (pending.length > maximumFrameBytes) {
      channel.emit({
        type: "fault",
        reason: "The frame exceeds the byte limit. Use a blob reference.",
        bytes: pending.toString("base64"),
      });
      pending = Buffer.alloc(0);
    }
  }
  function ended(): void {
    if (pending.length !== 0) {
      channel.emit({
        type: "fault",
        reason: "The final frame has no newline.",
        bytes: pending.toString("base64"),
      });
    }
    channel.emit({ type: "end" });
  }
  function diagnostic(chunk: Buffer): void {
    channel.emit({ type: "diagnostic", text: diagnosticDecoder.decode(chunk, { stream: true }) });
  }
  function diagnosticEnded(): void {
    const text = diagnosticDecoder.decode();
    if (text !== "") {
      channel.emit({ type: "diagnostic", text });
    }
  }
  function exited(code: number | null, signal: string | null): void {
    channel.emit({ type: "exit", code, signal });
  }
  function failed(error: Error): void {
    channel.emit({ type: "fault", reason: error.message, bytes: "" });
  }
  options.input.on("data", receive);
  options.input.on("end", ended);
  options.input.on("error", failed);
  options.output.on("error", failed);
  options.diagnostics?.on("data", diagnostic);
  options.diagnostics?.on("end", diagnosticEnded);
  options.worker?.on("close", exited);
  options.worker?.on("error", failed);
  return {
    kind: "standard-streams",
    canTerminate: options.worker !== undefined,
    listen: channel.listen,
    send(value: unknown): void {
      if (isClosed) {
        throw new Error("The transport is closed.");
      }
      options.output.write(encodeFrame(value));
    },
    close(): void {
      if (isClosed) {
        return;
      }
      isClosed = true;
      options.output.end();
      options.input.off("data", receive);
      options.input.off("end", ended);
      options.input.off("error", failed);
      options.diagnostics?.off("data", diagnostic);
      options.diagnostics?.off("end", diagnosticEnded);
    },
    terminate(): void {
      if (options.worker === undefined) {
        throw new Error("Only an owned worker can be terminated.");
      }
      options.worker.kill();
    },
  };
}

/** Encodes an exact JSON frame and rejects oversized values before dispatch. */
export function encodeFrame(value: unknown): Buffer {
  const frame = Buffer.from(`${JSON.stringify(roundTripJson(value))}\n`, "utf8");
  if (frame.length - 1 > maximumFrameBytes) {
    throw new Error("The frame exceeds the byte limit. Use a blob reference.");
  }
  return frame;
}

function decodeFrame(bytes: Buffer, emit: (event: TransportEvent) => void): void {
  try {
    if (bytes.length > maximumFrameBytes) {
      throw new Error("The frame exceeds the byte limit. Use a blob reference.");
    }
    // biome-ignore lint/style/useNamingConvention: TextDecoder defines this option.
    const text = new TextDecoder("utf-8", { fatal: true, ignoreBOM: true }).decode(bytes);
    emit({ type: "message", value: roundTripJson(JSON.parse(text)) });
  } catch (error) {
    emit({
      type: "fault",
      reason: error instanceof Error ? error.message : "Invalid frame.",
      bytes: bytes.toString("base64"),
    });
  }
}

function createChannel(): {
  listen(listener: (event: TransportEvent) => void): void;
  emit(event: TransportEvent): void;
} {
  let listener: ((event: TransportEvent) => void) | undefined;
  const pending: TransportEvent[] = [];
  return {
    listen(callback): void {
      listener = callback;
      for (const event of pending.splice(0)) {
        callback(event);
      }
    },
    emit(event): void {
      if (listener === undefined) {
        pending.push(event);
      } else {
        listener(event);
      }
    },
  };
}
