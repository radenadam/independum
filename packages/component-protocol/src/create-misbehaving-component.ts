import { createProtocolPeer, type EvidenceRecord, ProtocolError } from "./create-protocol-peer.ts";
import {
  referenceContracts,
  referenceManifest,
  referencePeerOptions,
} from "./reference-component.ts";
import {
  type JsonValue,
  maximumFrameBytes,
  type ProtocolFailure,
  protocolVersion,
  type RequestFrame,
  roundTripJson,
} from "./schemas.ts";
import type { ProtocolTransport } from "./transports.ts";

/** Exercises receiving validation and terminal delivery with deliberately misbehaving components. */
export function createMisbehavingComponent(
  transport: ProtocolTransport,
  doesUsePeer = false,
): void {
  if (doesUsePeer) {
    const entries: EvidenceRecord[] = [];
    let doesSendFail = false;
    createProtocolPeer({
      transport: {
        ...transport,
        send(value): void {
          if (doesSendFail) {
            throw new Error("The component send fails.");
          }
          transport.send(value);
        },
      },
      ...referencePeerOptions,
      record(entry): void {
        entries.push(entry);
      },
      authorize(request): void {
        if ((request.params.input as { resourceId?: string }).resourceId === "denied") {
          throw new Error("x".repeat(maximumFrameBytes));
        }
      },
      handlers: {
        describe(): JsonValue {
          return referenceManifest;
        },
        "resource.resolve"(): JsonValue {
          return {
            content: entries.map((entry) => ({
              kind: entry.kind,
              direction: entry.direction,
              invocationId: entry.invocationId,
              bytes: Buffer.byteLength(JSON.stringify(entry.value)),
              failure: (entry.value as { failure?: JsonValue }).failure ?? null,
            })),
            source: "recorded",
            provenance: [],
          };
        },
        "tool.execute"(request, context): JsonValue {
          const { mode } = (request.params.input as { arguments: { mode: string } }).arguments;
          if (mode === "oversized-error") {
            throw new Error("x".repeat(maximumFrameBytes));
          }
          if (mode === "empty-error") {
            throw new Error("");
          }
          if (mode === "invalid-failure") {
            throw new ProtocolError("The component supplies non-JSON error details.", {
              kind: "execution-failure",
              identity: request.params.identity,
              contract: request.params.contract,
              sequence: 1,
              text: { id: "invalid", values: { value: undefined as unknown as JsonValue } },
              locations: [],
              dispatch: "known",
              effects: "uncertain",
            });
          }
          if (mode === "invalid-failure-fields") {
            throw new ProtocolError(
              "The component supplies invalid failure fields.",
              null as unknown as ProtocolFailure,
            );
          }
          if (mode === "oversized-causes") {
            throw new ProtocolError("A nested failure is too large.", {
              kind: "execution-failure",
              identity: { ...request.params.identity, invocationId: "nested" },
              contract: request.params.contract,
              sequence: 1,
              text: null,
              locations: [{ pointer: "", reason: "x".repeat(maximumFrameBytes) }],
              dispatch: "known",
              effects: "uncertain",
            });
          }
          if (mode === "oversized-progress") {
            context.progress("x".repeat(maximumFrameBytes));
          }
          if (mode.startsWith("fail-")) {
            doesSendFail = true;
            if (mode === "fail-progress") {
              context.progress(null);
            } else if (mode === "fail-log") {
              context.log("info", "A diagnostic cannot be sent.");
            }
          }
          return {
            content: [],
            structuredData: mode === "oversized-output" ? "x".repeat(maximumFrameBytes) : null,
            historicalDetails: null,
            isError: false,
          };
        },
      },
    });
    return;
  }
  transport.listen((event) => {
    if (event.type !== "message") {
      return;
    }
    const request = event.value as RequestFrame;
    if (!("method" in request) || !("id" in request)) {
      return;
    }
    let output: JsonValue = referenceManifest;
    if (request.method === "initialize") {
      output = roundTripJson({
        wireVersion: protocolVersion,
        manifestVersion: protocolVersion,
        contracts: referenceContracts,
        componentInstanceId: request.params.identity.componentInstanceId,
        grantedCapabilities: ["fixture.read"],
      });
    } else if (request.method === "stage.apply") {
      output = (request.params.input as { value: JsonValue }).value;
    } else if (request.method === "dispose") {
      output = { disposed: true, activitiesEnded: true };
    } else if (request.method === "loop.run") {
      output = { settlement: "completed", records: [] };
    } else if (request.method === "resource.resolve") {
      output = { content: "fixture", source: "recorded", provenance: [] };
    } else if (request.method === "tool.execute") {
      const input = request.params.input as { arguments: { mode: string; value: JsonValue } };
      if (input.arguments.mode === "hold") {
        return;
      }
      if (input.arguments.mode === "malformed-frame") {
        transport.send(input.arguments.value);
        return;
      }
      if (input.arguments.mode === "large-malformed-frame") {
        transport.send({ jsonrpc: "2.0", id: "x".repeat(maximumFrameBytes - 80) });
        return;
      }
      if (input.arguments.mode === "late-error") {
        transport.send({
          jsonrpc: "2.0",
          id: request.id,
          error: {
            code: -32000,
            message: "The component ignores cancellation and reports another failure.",
            data: {
              identity: request.params.identity,
              contract: request.params.contract,
              sequence: 1,
              kind: "execution-failure",
              text: null,
              locations: [],
              dispatch: "known",
              effects: "uncertain",
            },
          },
        });
        return;
      }
      output = {
        content: [],
        structuredData: input.arguments.value,
        historicalDetails: null,
        isError: false,
      };
    }
    const { identity, contract } = request.params;
    const doesCancel = identity.invocationId === "remote-cancel";
    if (doesCancel) {
      transport.send({
        jsonrpc: "2.0",
        method: "cancel",
        params: {
          wireVersion: protocolVersion,
          identity,
          contract,
          sequence: 1,
          data: {
            reason: "The component cancels before returning output.",
            deadline: Date.now() + 60_000,
          },
        },
      });
    }
    const response = {
      jsonrpc: "2.0",
      id: request.id,
      result: {
        identity,
        contract,
        sequence: doesCancel ? 2 : 1,
        outcome: "completed",
        output,
        dispatch: "known",
        effects: "uncertain",
      },
    };
    transport.send(response);
    if (
      request.method === "tool.execute" &&
      (request.params.input as { arguments: { mode: string } }).arguments.mode ===
        "duplicate-terminal"
    ) {
      transport.send(response);
    }
  });
}
