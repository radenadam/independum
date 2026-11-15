import { referenceContracts, referenceManifest } from "./reference-component.ts";
import { type JsonValue, protocolVersion, type RequestFrame, roundTripJson } from "./schemas.ts";
import type { ProtocolTransport } from "./transports.ts";

/** Sends raw fixture responses without peer validation to exercise the receiving boundary. */
export function createMisbehavingComponent(transport: ProtocolTransport): void {
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
    } else if (request.method === "tool.execute") {
      const input = request.params.input as { arguments: { mode: string; value: JsonValue } };
      if (input.arguments.mode === "hold") {
        return;
      }
      if (input.arguments.mode === "malformed-frame") {
        transport.send(input.arguments.value);
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
    transport.send({
      jsonrpc: "2.0",
      id: request.id,
      result: {
        identity,
        contract,
        sequence: 1,
        outcome: "completed",
        output,
        dispatch: "known",
        effects: "uncertain",
      },
    });
  });
}
