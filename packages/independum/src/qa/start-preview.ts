import { type ChildProcess, spawn } from "node:child_process";
import { once } from "node:events";
import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import { createAccessToken } from "../create-access-token.ts";
import { createPreviewFixture, type PreviewFixture } from "./create-preview-fixture.ts";
import type { PreviewServerOptions } from "./serve-preview.ts";
import { startPreviewPhoneRoute } from "./start-preview-phone-route.ts";

/**
 * Starts an isolated app with a stand-in model and optional real logins through Pi, in a server
 * process that restarts the way the development launcher restarts it.
 */
export async function startPreview(options: {
  fixture: PreviewFixture;
  port: number;
  hasRealLogins: boolean;
  hasPhoneRoute?: boolean;
}): Promise<{
  url: string;
  home: string;
  close: () => Promise<void>;
  restart: () => Promise<void>;
  certificatePin?: string;
}> {
  const home = await mkdtemp(join(tmpdir(), "independum-preview-"));
  const token = createAccessToken();
  let server: ChildProcess | undefined;
  let phoneRoute: Awaited<ReturnType<typeof startPreviewPhoneRoute>> | undefined;
  try {
    const project = await createPreviewFixture(home, options.fixture);
    const serverOptions: Omit<PreviewServerOptions, "token"> = {
      home,
      project,
      fixture: options.fixture,
      port: options.port,
      hasRealLogins: options.hasRealLogins,
    };
    const url = await start(serverOptions);
    // A restart keeps the first port, so the open page and its link keep working.
    serverOptions.port = Number(new URL(url).port);
    if (options.hasPhoneRoute) {
      phoneRoute = await startPreviewPhoneRoute(url);
    }
    return {
      url,
      home,
      close,
      async restart() {
        await stop(false);
        await start(serverOptions);
      },
      ...(phoneRoute === undefined ? {} : { certificatePin: phoneRoute.certificatePin }),
    };
  } catch (error) {
    await close();
    throw error;
  }

  async function start(serverOptions: Omit<PreviewServerOptions, "token">): Promise<string> {
    const environment = { ...process.env };
    environment.INDEPENDUM_ACCESS_TOKEN = token;
    const child = spawn(
      process.execPath,
      [
        fileURLToPath(new URL("./serve-preview.ts", import.meta.url)),
        JSON.stringify(serverOptions),
      ],
      {
        stdio: ["ignore", "inherit", "inherit", "ipc"],
        env: environment,
      },
    );
    server = child;
    return new Promise((resolve, reject) => {
      function fail(code: number | null): void {
        reject(new Error(`The preview server exits with code ${code} before it serves the app.`));
      }
      child.once("exit", fail);
      child.once("message", (message) => {
        child.off("exit", fail);
        resolve((message as { url: string }).url);
      });
    });
  }

  // The development launcher stops its server with a signal, and the preview does the same for a
  // restart. Closing asks the server to stop its work first, because Windows ends a process that
  // gets a signal without letting it stop the commands that it started.
  async function stop(isClosing: boolean): Promise<void> {
    if (server === undefined || server.exitCode !== null || server.signalCode !== null) {
      return;
    }
    const exited = once(server, "exit");
    if (isClosing && server.connected) {
      server.send("close");
    } else {
      server.kill();
    }
    await exited;
  }

  async function close(): Promise<void> {
    try {
      await phoneRoute?.close();
      await stop(true);
    } finally {
      await rm(home, { recursive: true, force: true, maxRetries: 10, retryDelay: 200 });
    }
  }
}
