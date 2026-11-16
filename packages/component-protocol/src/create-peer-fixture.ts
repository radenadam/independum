import { PassThrough } from "node:stream";
import { setImmediate } from "node:timers/promises";
import type { TestContext } from "vitest";
import type { ProtocolPeer } from "./create-protocol-peer.ts";
import { referenceTool } from "./reference-component.ts";
import type { InvocationIdentity, JsonValue, ProtocolFrame } from "./schemas.ts";
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

/** Owns scheduled peer fixtures and their physical transport teardown. */
export function createPeerFixture(kind: ProtocolTransport["kind"]): {
  peers: Record<Role, ProtocolPeer>;
  listeners: Record<Role, (event: TransportEvent) => void>;
  delivered: ProtocolFrame[];
  transport(role: Role, hooks: TransportHooks): ProtocolTransport;
  request(role: Role, identity: InvocationIdentity, doesDispose: boolean): Promise<JsonValue>;
  drain(context: TestContext): Promise<void>;
  close(): void;
} {
  const peers = {} as Record<Role, ProtocolPeer>;
  const listeners = {} as Record<Role, (event: TransportEvent) => void>;
  const pending: { role: Role; frame: ProtocolFrame }[] = [];
  const delivered: ProtocolFrame[] = [];
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
  return {
    peers,
    listeners,
    delivered,
    request(role, identity, doesDispose): Promise<JsonValue> {
      const method = doesDispose ? "dispose" : role === "broker" ? "tool.execute" : "state.read";
      const input =
        method === "dispose"
          ? { reason: "Generated fixture disposal." }
          : method === "state.read"
            ? { handle: "fixture.read", key: "sample" }
            : {
                definition: referenceTool,
                arguments: { mode: "echo", value: identity.invocationId },
                handles: [],
              };
      return peers[role].request(method, identity, input, doesDispose ? [] : ["fixture.read"]);
    },
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
