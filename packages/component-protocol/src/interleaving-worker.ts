import { createInterleavingComponent } from "./create-interleaving-component.ts";
import { createStreamTransport } from "./transports.ts";

createInterleavingComponent(
  createStreamTransport({ input: process.stdin, output: process.stdout }),
  (records) => process.send?.(records),
);
