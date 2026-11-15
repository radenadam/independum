import { createMisbehavingComponent } from "./create-misbehaving-component.ts";
import { createStreamTransport } from "./transports.ts";

if (process.argv.includes("hold")) {
  setInterval(() => {}, 1000);
}
createMisbehavingComponent(
  createStreamTransport({ input: process.stdin, output: process.stdout }),
  process.argv.includes("peer"),
);
