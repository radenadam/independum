import { createReferenceComponent } from "./reference-component.ts";
import { createStreamTransport } from "./transports.ts";

const transport = createStreamTransport({ input: process.stdin, output: process.stdout });
process.stdout.on("finish", () => process.exit(23));
createReferenceComponent(transport, () => {});
process.stderr.write("Reference component ready.\n");
