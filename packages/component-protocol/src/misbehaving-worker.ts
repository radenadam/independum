import { createMisbehavingComponent } from "./create-misbehaving-component.ts";
import { createStreamTransport } from "./transports.ts";

createMisbehavingComponent(createStreamTransport({ input: process.stdin, output: process.stdout }));
