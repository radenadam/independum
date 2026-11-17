import { existsSync } from "node:fs";
import { createServer as createHttpServer } from "node:http";
import type { AddressInfo } from "node:net";
import { join } from "node:path";
import type { ModelRuntime } from "@earendil-works/pi-coding-agent";
import { createServer as createViteServer, type ViteDevServer } from "vite";
import { expect, test, vi } from "vitest";
import { waitFor } from "../../../scripts/wait-for.ts";
import type { Chat } from "./create-chat.ts";
import { createTestConnection } from "./create-test-connection.ts";
import { readServer } from "./private-runtime.ts";
import { runHeadless } from "./run-headless.ts";
import { startAppServer } from "./start-app-server.ts";
import { createTestFolder } from "./tools/create-test-folder.ts";

vi.mock("vite", async (importOriginal) => ({
  ...(await importOriginal<typeof import("vite")>()),
  createServer: vi.fn(),
}));

const parent = createTestFolder("headless-server");
let nextCase = 0;

async function setup() {
  const directory = join(parent, String(nextCase++));
  const chat = {
    hasWork: vi.fn(() => false),
    stopAll: vi.fn(async () => undefined),
  } as unknown as Chat;
  const models = {} as ModelRuntime;
  const token = createTestConnection().accessToken;
  const server = await startAppServer({
    chat,
    models,
    directory,
    token,
    port: 0,
    isDevelopment: false,
  });
  const url = new URL(server.url).origin;
  return { chat, server, url, directory, token };
}

test("a headless server publishes only after listening and status omits its token", async () => {
  const { server, url, directory, token } = await setup();
  const output: string[] = [];
  try {
    expect(readServer(directory)).toMatchObject({ url, accessToken: token });
    expect((await fetch(new URL("/api/health", url))).status).toBe(401);
    expect(
      await runHeadless(["server", "status"], {
        directory,
        folder: parent,
        stdin: async () => "",
        stdout: (text) => {
          output.push(text);
        },
        stderr: (text) => {
          output.push(text);
        },
      }),
    ).toBe(0);
    expect(output).toHaveLength(1);
    expect(output[0]).toContain('"protocolVersion":1');
    expect(output.join("")).not.toContain(token);
    expect((await fetch(url)).status).toBe(
      existsSync(join(import.meta.dirname, "..", "..", "web", "dist", "index.html")) ? 200 : 503,
    );
  } finally {
    await Promise.all([server.close(), server.close()]);
  }
  expect(readServer(directory)).toBeUndefined();
});

test("stopping refuses active work without force and retains access checks", async () => {
  const { chat, server, directory, token, url } = await setup();
  vi.mocked(chat.hasWork).mockReturnValue(true);
  async function stop(force: boolean, authorization = `Bearer ${token}`): Promise<Response> {
    return fetch(new URL("/api/server/stop", url), {
      method: "POST",
      headers: { authorization, "content-type": "application/json" },
      body: JSON.stringify({ force }),
    });
  }
  try {
    expect((await stop(true, "wrong")).status).toBe(401);
    expect((await stop(false)).status).toBe(409);
    expect(chat.stopAll).not.toHaveBeenCalled();
    expect((await stop(true)).status).toBe(204);
    await waitFor(() => expect(readServer(directory)).toBeUndefined());
    expect(chat.stopAll).toHaveBeenCalledTimes(1);
  } finally {
    await server.close();
  }
});

test("an occupied port leaves the unrelated listener intact", async () => {
  const listener = createHttpServer((_request, response) => {
    response.end("Unrelated listener.");
  });
  await new Promise<void>((resolve) => {
    listener.listen(0, "127.0.0.1", resolve);
  });
  const address = listener.address();
  if (address === null || typeof address === "string") {
    throw new Error("The test listener needs a TCP address.");
  }
  try {
    await expect(
      startAppServer({
        chat: {} as Chat,
        models: {} as ModelRuntime,
        directory: join(parent, "occupied"),
        token: "unused",
        port: address.port,
        isDevelopment: false,
      }),
    ).rejects.toMatchObject({ code: "EADDRINUSE" });
    expect(await (await fetch(`http://127.0.0.1:${address.port}`)).text()).toBe(
      "Unrelated listener.",
    );
  } finally {
    await new Promise<void>((resolve) => {
      listener.close(() => resolve());
    });
  }
});

test("a request during development startup fails at once instead of waiting", async () => {
  const reservation = createHttpServer();
  await new Promise<void>((resolve) => reservation.listen(0, "127.0.0.1", resolve));
  const { port } = reservation.address() as AddressInfo;
  await new Promise<void>((resolve) => reservation.close(() => resolve()));
  const vite = Promise.withResolvers<ViteDevServer>();
  vi.mocked(createViteServer).mockReturnValueOnce(vite.promise);
  const starting = startAppServer({
    chat: { hasWork: () => false, stopAll: async () => undefined } as unknown as Chat,
    models: {} as ModelRuntime,
    directory: join(parent, String(nextCase++)),
    token: createTestConnection().accessToken,
    port,
    isDevelopment: true,
  });
  try {
    await waitFor(async () => {
      const failure: unknown = await fetch(`http://127.0.0.1:${port}/api/health`, {
        signal: AbortSignal.timeout(2000),
      }).then(
        () => undefined,
        (error: unknown) => error,
      );
      expect(failure).toBeInstanceOf(TypeError);
      expect((failure as Error).cause).not.toMatchObject({ code: "ECONNREFUSED" });
    });
  } finally {
    vite.resolve({
      middlewares: () => undefined,
      close: async () => undefined,
    } as unknown as ViteDevServer);
    await (await starting).close();
  }
});
