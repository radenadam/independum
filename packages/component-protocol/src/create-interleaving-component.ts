import { setImmediate } from "node:timers/promises";
import type { EvidenceRecord, ProtocolPeer } from "./create-protocol-peer.ts";
import { createReferenceComponent } from "./reference-component.ts";
import type { ProtocolTransport } from "./transports.ts";

/** Reports quiescent fixture evidence after each scheduled input without changing protocol frames. */
export function createInterleavingComponent(
  transport: ProtocolTransport,
  idle: (records: EvidenceRecord[]) => void,
): ProtocolPeer {
  const records: EvidenceRecord[] = [];
  return createReferenceComponent(
    {
      ...transport,
      listen(callback): void {
        transport.listen((event) => {
          callback(event);
          if (event.type === "message") {
            void setImmediate().then(() => idle(records.splice(0)));
          }
        });
      },
    },
    (entry) => records.push(entry),
  );
}
