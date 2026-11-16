import { createReferenceComponent } from "./reference-component.ts";
import { createStreamTransport } from "./transports.ts";

const transport = createStreamTransport({ input: process.stdin, output: process.stdout });
process.stdout.on("finish", () => process.exit(23));
createReferenceComponent(
  transport,
  () => {},
  () => {
    // Node emits "finish" after ending a piped standard output on Windows but not reliably on Linux
    // and macOS, so the worker exits once its last write has been flushed.
    process.stdout.write("", () => process.exit(23));
  },
);
process.stderr.write("Reference component ready.\n");
