import { createProtocolPeer, type ProtocolPeer } from "./create-protocol-peer.ts";
import { referencePeerOptions } from "./reference-component.ts";
import type { JsonValue, ProtocolFrame } from "./schemas.ts";
import { createStreamTransport } from "./transports.ts";

let peer: ProtocolPeer;
peer = createProtocolPeer({
  ...referencePeerOptions,
  transport: createStreamTransport({ input: process.stdin, output: process.stdout }),
  record(entry): void {
    const frame = entry.value as unknown as ProtocolFrame;
    if (
      entry.kind === "frame" &&
      entry.direction === "sent" &&
      entry.invocationId === "outer" &&
      "result" in frame
    ) {
      peer.cancel("outer", "Terminal evidence requests cancellation.", Date.now() + 60_000);
    }
  },
  authorize(): void {},
  handlers: {
    "tool.execute"(request, context): JsonValue {
      const input = request.params.input as { arguments: { mode: string; value: JsonValue } };
      const { mode, value } = input.arguments;
      if (mode === "throw") {
        context.progress({ value });
        context.log("info", "The worker fails after notifications.");
        throw new Error("The worker fails synchronously.");
      }
      return { content: [], structuredData: value, historicalDetails: null, isError: false };
    },
  },
});
