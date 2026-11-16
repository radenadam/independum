import { type EvidenceRecord, ProtocolError } from "./create-protocol-peer.ts";
import { type JsonValue, type RequestFrame, type ResponseFrame, roundTripJson } from "./schemas.ts";
import type { ProtocolTransport } from "./transports.ts";

/** Sends raw nested requests using the opposite sender's id without the SDK's id allocator. */
export function createCollidingStateReader(
  transport: ProtocolTransport,
  record: (entry: EvidenceRecord) => void,
): {
  transport: ProtocolTransport;
  read(request: RequestFrame, suffix?: string): Promise<JsonValue>;
} {
  const pending = new Map<
    string | number,
    { request: RequestFrame; resolve(value: JsonValue): void; reject(error: Error): void }
  >();
  return {
    transport: {
      ...transport,
      listen(listener): void {
        transport.listen((event) => {
          if (event.type === "message" && !("method" in Object(event.value))) {
            const frame = event.value as ResponseFrame;
            const active = frame.id === null ? undefined : pending.get(frame.id);
            const details = frame.result ?? frame.error?.data;
            if (
              active !== undefined &&
              details?.identity?.invocationId === active.request.params.identity.invocationId
            ) {
              pending.delete(active.request.id);
              record({
                invocationId: active.request.params.identity.invocationId,
                sequence: 2,
                direction: "received",
                kind: "frame",
                value: roundTripJson(frame),
                ...(event.rawBytes === undefined ? {} : { bytes: event.rawBytes }),
              });
              if (frame.error !== undefined) {
                active.reject(new ProtocolError(frame.error.message, frame.error.data));
              } else if (frame.result !== undefined) {
                active.resolve(frame.result.output);
              }
              return;
            }
          }
          listener(event);
        });
      },
    },
    read(parent, suffix = "read"): Promise<JsonValue> {
      const request: RequestFrame = {
        jsonrpc: "2.0",
        id: parent.id,
        method: "state.read",
        params: {
          ...parent.params,
          identity: {
            ...parent.params.identity,
            invocationId: `${parent.params.identity.invocationId}.${suffix}`,
            parentInvocationId: parent.params.identity.invocationId,
          },
          contract: { id: "state.read", version: parent.params.contract.version },
          sequence: 1,
          input: { handle: "fixture.read", key: "sample" },
        },
      };
      return new Promise<JsonValue>((resolve, reject) => {
        pending.set(request.id, { request, resolve, reject });
        record({
          invocationId: request.params.identity.invocationId,
          sequence: 1,
          direction: "sent",
          kind: "frame",
          value: roundTripJson(request),
        });
        transport.send(request);
      });
    },
  };
}
