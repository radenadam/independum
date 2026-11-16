import { PassThrough } from "node:stream";
import { setImmediate } from "node:timers/promises";
import type { TestContext } from "vitest";
import type { ProtocolPeer } from "./create-protocol-peer.ts";
import { referenceTool } from "./reference-component.ts";
import {
  type InvocationIdentity,
  type JsonValue,
  type Operation,
  type ProtocolFrame,
  roundTripJson,
} from "./schemas.ts";
import {
  createInProcessTransports,
  createStreamTransport,
  type ProtocolTransport,
  type TransportEvent,
} from "./transports.ts";

type Role = "broker" | "component";
interface TransportHooks {
  send(frame: ProtocolFrame, invocationId: string): void;
  close(): void;
  terminate?: () => void;
}

function requestInput(method: Operation, value: string): Record<string, JsonValue> {
  if (method === "dispose") {
    return { reason: "Generated fixture disposal." };
  }
  if (method === "state.read") {
    return { handle: "fixture.read", key: value };
  }
  return {
    definition: roundTripJson(referenceTool),
    arguments: { mode: "echo", value },
    handles: [],
  };
}

/** Changes every field of a value in place, as a caller may after its call returns. */
function mutate(value: JsonValue): void {
  if (Array.isArray(value)) {
    for (const [index, entry] of value.entries()) {
      if (entry !== null && typeof entry === "object") {
        mutate(entry);
      } else {
        value[index] = "mutated";
      }
    }
    value.push("mutated");
  } else if (value !== null && typeof value === "object") {
    for (const [key, entry] of Object.entries(value)) {
      if (entry !== null && typeof entry === "object") {
        mutate(entry);
      } else {
        value[key] = "mutated";
      }
    }
    value.mutated = "mutated";
  }
}

/** Owns scheduled peer fixtures, the call-time arguments of their requests, and transport teardown. */
export function createPeerFixture(kind: ProtocolTransport["kind"]): {
  peers: Record<Role, ProtocolPeer>;
  listeners: Record<Role, (event: TransportEvent) => void>;
  delivered: ProtocolFrame[];
  calls: Map<string, JsonValue>;
  transport(role: Role, hooks: TransportHooks): ProtocolTransport;
  call(
    role: Role,
    method: Operation,
    identity: InvocationIdentity,
    input: JsonValue,
    capabilities: string[],
    doesMutate?: boolean,
  ): Promise<JsonValue>;
  request(role: Role, identity: InvocationIdentity, doesDispose: boolean): Promise<JsonValue>;
  repeat(role: Role, identities: [InvocationIdentity, InvocationIdentity]): Promise<JsonValue>[];
  mutate(value: JsonValue): void;
  drain(context: TestContext): Promise<void>;
  close(): void;
} {
  const peers = {} as Record<Role, ProtocolPeer>;
  const listeners = {} as Record<Role, (event: TransportEvent) => void>;
  const pending: { role: Role; frame: ProtocolFrame }[] = [];
  const delivered: ProtocolFrame[] = [];
  const calls = new Map<string, JsonValue>();
  let transports: [ProtocolTransport, ProtocolTransport];
  if (kind === "in-process") {
    transports = createInProcessTransports();
  } else {
    const left = new PassThrough();
    const right = new PassThrough();
    transports = [
      createStreamTransport({ input: left, output: right }),
      createStreamTransport({ input: right, output: left }),
    ];
  }
  function call(
    role: Role,
    method: Operation,
    identity: InvocationIdentity,
    input: JsonValue,
    capabilities: string[],
    doesMutate = true,
  ): Promise<JsonValue> {
    calls.set(identity.invocationId, roundTripJson({ identity, input, capabilities }));
    const promise = peers[role].request(method, identity, input, capabilities);
    if (doesMutate) {
      for (const argument of [identity as unknown as JsonValue, input, capabilities]) {
        mutate(argument);
      }
    }
    return promise;
  }
  return {
    peers,
    listeners,
    delivered,
    calls,
    call,
    request(role, identity, doesDispose): Promise<JsonValue> {
      const method = doesDispose ? "dispose" : role === "broker" ? "tool.execute" : "state.read";
      return call(
        role,
        method,
        identity,
        requestInput(method, identity.invocationId),
        doesDispose ? [] : ["fixture.read"],
      );
    },
    repeat(role, [first, second]): Promise<JsonValue>[] {
      const method = role === "broker" ? "tool.execute" : "state.read";
      const input = requestInput(method, "first");
      const results = [call(role, method, first, input, ["fixture.read"], false)];
      if (method === "state.read") {
        input.key = "second";
      } else {
        (input.arguments as Record<string, JsonValue>).value = "second";
      }
      results.push(call(role, method, second, input, ["fixture.read"]));
      return results;
    },
    mutate,
    transport(role, hooks): ProtocolTransport {
      const transport = transports[role === "broker" ? 0 : 1];
      return {
        ...transport,
        canTerminate: hooks.terminate !== undefined,
        listen(listener): void {
          listeners[role] = listener;
          transport.listen(listener);
        },
        close: hooks.close,
        terminate: hooks.terminate ?? transport.terminate,
        send(value): void {
          const frame = value as ProtocolFrame;
          const details = "params" in frame ? frame.params : (frame.result ?? frame.error?.data);
          hooks.send(frame, details?.identity?.invocationId ?? "uncorrelated");
          pending.push({ role, frame });
        },
      };
    },
    async drain(context): Promise<void> {
      for (let step = 0; step < 100; step++) {
        context.signal.throwIfAborted();
        await setImmediate();
        const delivery = pending.shift();
        if (delivery === undefined) {
          return;
        }
        delivered.push(delivery.frame);
        transports[delivery.role === "broker" ? 0 : 1].send(delivery.frame);
      }
      throw new Error("The scheduled peer fixture does not quiesce.");
    },
    close(): void {
      peers.broker.close();
      peers.component.close();
      for (const transport of transports) {
        transport.close();
      }
    },
  };
}
