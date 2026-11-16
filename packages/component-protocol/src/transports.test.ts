import { PassThrough } from "node:stream";
import { expect, type TestContext, test } from "vitest";
import { waitFor } from "../../../scripts/wait-for.ts";
import { registerTestCleanup } from "./register-test-cleanup.ts";
import { maximumFrameBytes } from "./schemas.ts";
import { createStreamTransport, type TransportEvent } from "./transports.ts";

function streamFixture(context: TestContext): {
  input: PassThrough;
  diagnostics: PassThrough;
  events: TransportEvent[];
} {
  const input = new PassThrough();
  const output = new PassThrough();
  const diagnostics = new PassThrough();
  const events: TransportEvent[] = [];
  const transport = createStreamTransport({ input, output, diagnostics });
  transport.listen((event) => events.push(event));
  function close(): void {
    transport.close();
    input.destroy();
    output.destroy();
    diagnostics.destroy();
  }
  registerTestCleanup(context, close);
  return { input, diagnostics, events };
}

test("standard streams decode split utf-8 frames in order and keep diagnostics separate", async (context) => {
  const fixture = streamFixture(context);
  const bytes = Buffer.from('{"value":"\u2603"}\n{"value":2}\n');
  fixture.input.write(bytes.subarray(0, 11));
  fixture.input.write(bytes.subarray(11));
  fixture.diagnostics.write("Fixture diagnostics.\n");
  await waitFor(() =>
    expect(fixture.events).toEqual([
      {
        type: "message",
        value: { value: "\u2603" },
        rawBytes: bytes.subarray(0, 16).toString("base64"),
      },
      { type: "message", value: { value: 2 }, rawBytes: bytes.subarray(16).toString("base64") },
      {
        type: "diagnostic",
        text: "Fixture diagnostics.\n",
        rawBytes: Buffer.from("Fixture diagnostics.\n").toString("base64"),
      },
    ]),
  );
});

test.for([
  Buffer.from([0xc3, 0x28, 10]),
  Buffer.from("not json\n"),
  Buffer.from("\n"),
  Buffer.from([0xef, 0xbb, 0xbf, 123, 125, 10]),
])("standard streams reject malformed frames with exact bytes", async (bytes, context) => {
  const fixture = streamFixture(context);
  fixture.input.write(bytes);
  await waitFor(() =>
    expect(fixture.events).toMatchObject([
      { type: "fault", bytes: bytes.subarray(0, -1).toString("base64") },
    ]),
  );
});

test("standard streams reject oversized and unterminated frames instead of accepting prefixes", async (context) => {
  const fixture = streamFixture(context);
  fixture.input.write("x".repeat(maximumFrameBytes + 1));
  fixture.input.end('{"value":1}');
  await waitFor(() =>
    expect(fixture.events.map((event) => event.type)).toEqual(["fault", "fault", "end"]),
  );
});
