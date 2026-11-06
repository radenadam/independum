import { join } from "node:path";
import { expect, test, vi } from "vitest";
import { connectHeadless, type HeadlessConnectionOptions } from "./connect-headless.ts";
import { createTestConnection } from "./create-test-connection.ts";
import { publishServer, readServer } from "./private-runtime.ts";
import { createTestFolder } from "./tools/create-test-folder.ts";

const parent = createTestFolder("headless-connect");
let nextCase = 0;
const connection = createTestConnection();

function setup(): HeadlessConnectionOptions & {
  request: ReturnType<typeof vi.fn<typeof fetch>>;
  launch: ReturnType<typeof vi.fn<() => void>>;
} {
  return {
    directory: join(parent, String(nextCase++)),
    folder: parent,
    start: "auto",
    signal: new AbortController().signal,
    request: vi.fn(async () =>
      Response.json({ status: "ok", serverId: connection.serverId, protocolVersion: 1 }),
    ),
    launch: vi.fn(),
  };
}

test("concurrent clients publish and discover one server", async () => {
  const options = setup();
  options.launch.mockImplementation(() => {
    publishServer(options.directory, connection);
  });
  const [first, second] = await Promise.all([connectHeadless(options), connectHeadless(options)]);
  expect(first).toEqual(connection);
  expect(second).toEqual(first);
  expect(options.launch).toHaveBeenCalledTimes(1);
  expectTransport(options);
});

test.each([401, 403])("authentication failure %i never starts a replacement", async (status) => {
  const options = setup();
  publishServer(options.directory, connection);
  options.request.mockResolvedValue(Response.json({}, { status }));
  await expect(connectHeadless(options)).rejects.toMatchObject({ exitCode: 4 });
  expect(options.launch).not.toHaveBeenCalled();
  expect(readServer(options.directory)).toEqual(connection);
});

test("protocol and identity mismatches never start a replacement", async () => {
  const options = setup();
  publishServer(options.directory, connection);
  options.request.mockResolvedValue(
    Response.json({ status: "ok", serverId: "another-server", protocolVersion: 1 }),
  );
  await expect(connectHeadless(options)).rejects.toMatchObject({
    exitCode: 5,
    code: "protocolMismatch",
  });
  expect(options.launch).not.toHaveBeenCalled();
});

test("a refused stale instance can start once and never kills its recorded process", async () => {
  const options = setup();
  publishServer(options.directory, { ...connection, serverId: "old" });
  const kill = vi.spyOn(process, "kill");
  options.request.mockRejectedValueOnce(
    new TypeError("Connection refused.", { cause: { code: "ECONNREFUSED" } }),
  );
  options.launch.mockImplementation(() => {
    publishServer(options.directory, connection);
  });
  try {
    expect(await connectHeadless(options)).toEqual(connection);
    expect(kill).not.toHaveBeenCalled();
  } finally {
    kill.mockRestore();
  }
});

test("explicit connection failure and redirects never fall back to discovery", async () => {
  const options = setup();
  options.server = "http://127.0.0.1:4870";
  options.token = connection.accessToken;
  options.request.mockRejectedValue(
    new TypeError("Connection refused.", { cause: { code: "ECONNREFUSED" } }),
  );
  await expect(connectHeadless(options)).rejects.toMatchObject({ exitCode: 5 });
  options.request.mockResolvedValue(
    new Response(null, { status: 302, headers: { location: "http://outside.invalid" } }),
  );
  await expect(connectHeadless(options)).rejects.toMatchObject({ exitCode: 5 });
  expect(options.launch).not.toHaveBeenCalled();
  expectTransport(options);
});

test("missing authentication and unsafe explicit origins fail before a request", async () => {
  const options = setup();
  options.server = connection.url;
  await expect(connectHeadless(options)).rejects.toMatchObject({ exitCode: 4 });
  options.server = "https://outside.invalid";
  options.token = connection.accessToken;
  await expect(connectHeadless(options)).rejects.toMatchObject({ exitCode: 2 });
  expect(options.request).not.toHaveBeenCalled();
});

test("start never leaves a missing server untouched", async () => {
  const options = setup();
  options.start = "never";
  await expect(connectHeadless(options)).rejects.toMatchObject({ exitCode: 5 });
  expect(options.launch).not.toHaveBeenCalled();
});

function expectTransport(options: ReturnType<typeof setup>): void {
  for (const [, initialization] of options.request.mock.calls) {
    expect(initialization?.redirect).toBe("error");
    expect(initialization?.headers).toEqual({ authorization: `Bearer ${connection.accessToken}` });
  }
}
