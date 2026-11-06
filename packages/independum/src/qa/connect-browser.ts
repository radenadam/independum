import { spawn } from "node:child_process";
import { appendFileSync } from "node:fs";
import { readFile } from "node:fs/promises";
import { join } from "node:path";
import { setTimeout } from "node:timers/promises";

interface ProtocolMessage {
  id?: number;
  method?: string;
  params?: Record<string, unknown>;
  result?: Record<string, unknown>;
  error?: { message: string };
}

export interface BrowserConnection {
  send(method: string, parameters?: Record<string, unknown>): Promise<Record<string, unknown>>;
  close(): Promise<void>;
}

/** Starts a headless browser and records its diagnostics before navigation. */
export async function connectBrowser(
  executable: string,
  directory: string,
  options: { profileName?: string; certificatePin?: string } = {},
): Promise<BrowserConnection> {
  const profile = join(directory, options.profileName ?? "profile");
  const diagnostics = join(directory, "browser.jsonl");
  const browser = spawn(
    executable,
    [
      "--headless=new",
      "--disable-gpu",
      "--disable-background-networking",
      "--disable-component-update",
      "--disable-sync",
      "--remote-debugging-port=0",
      "--remote-debugging-address=127.0.0.1",
      `--user-data-dir=${profile}`,
      "--no-first-run",
      "--no-default-browser-check",
      ...(options.certificatePin === undefined
        ? []
        : [
            `--ignore-certificate-errors-spki-list=${options.certificatePin}`,
            "--host-resolver-rules=MAP phone.test 127.0.0.1",
            "--no-proxy-server",
          ]),
      "about:blank",
    ],
    { stdio: ["ignore", "ignore", "pipe"], windowsHide: true },
  );
  let failure: Error | undefined;
  browser.on("error", (error) => {
    failure = error;
  });
  browser.stderr.on("data", (chunk: Buffer) => {
    appendFileSync(join(directory, "browser-stderr.txt"), chunk);
  });
  let socket: WebSocket | undefined;
  const pending = new Map<
    number,
    {
      resolve: (result: Record<string, unknown>) => void;
      reject: (error: Error) => void;
      timer: NodeJS.Timeout;
    }
  >();
  let nextId = 0;
  try {
    let pageUrl: string | undefined;
    const deadline = Date.now() + 30000;
    while (pageUrl === undefined && Date.now() < deadline) {
      if (failure !== undefined) {
        throw failure;
      }
      if (browser.exitCode !== null) {
        throw new Error("The browser exits before its debugger starts.");
      }
      try {
        const [port] = (await readFile(join(profile, "DevToolsActivePort"), "utf8")).split("\n");
        const response = await fetch(`http://127.0.0.1:${port}/json`, {
          signal: AbortSignal.timeout(1000),
        });
        const targets = (await response.json()) as { type: string; webSocketDebuggerUrl: string }[];
        pageUrl = targets.find((target) => target.type === "page")?.webSocketDebuggerUrl;
      } catch {
        await setTimeout(100);
      }
    }
    if (pageUrl === undefined) {
      throw new Error("The browser debugger does not start within 30 seconds.");
    }
    const connection = new WebSocket(pageUrl);
    socket = connection;
    await new Promise<void>((resolve, reject) => {
      const timer = globalThis.setTimeout(
        () => reject(new Error("The browser socket does not open within 10 seconds.")),
        10000,
      );
      connection.addEventListener(
        "open",
        () => {
          clearTimeout(timer);
          resolve();
        },
        { once: true },
      );
      connection.addEventListener(
        "error",
        () => {
          clearTimeout(timer);
          reject(new Error("The browser socket cannot open."));
        },
        { once: true },
      );
    });
    connection.addEventListener("message", (event) => {
      const message = JSON.parse(String(event.data)) as ProtocolMessage;
      if (message.id !== undefined) {
        const request = pending.get(message.id);
        if (request !== undefined) {
          clearTimeout(request.timer);
          pending.delete(message.id);
          if (message.error !== undefined) {
            request.reject(new Error(`${message.error.message}.`));
          } else {
            request.resolve(message.result ?? {});
          }
        }
      } else if (message.method !== undefined) {
        const parameters = message.params;
        const entry = parameters?.entry as { level?: string; url?: string } | undefined;
        const response = parameters?.response as { status: number; url: string } | undefined;
        // The browser asks for the favicon by itself because the page names no icon, and the
        // favicon is open work in the roadmap.
        const isFavicon = [entry?.url, response?.url].some(
          (url) => url !== undefined && URL.parse(url)?.pathname === "/favicon.ico",
        );
        if (
          !isFavicon &&
          (message.method === "Runtime.exceptionThrown" ||
            (message.method === "Runtime.consoleAPICalled" &&
              ["error", "warning"].includes(String(parameters?.type))) ||
            (message.method === "Log.entryAdded" &&
              ["error", "warning"].includes(entry?.level ?? "")) ||
            // A canceled request is one the page stops on purpose, such as an event stream it closes.
            (message.method === "Network.loadingFailed" && parameters?.canceled !== true) ||
            (message.method === "Network.responseReceived" && Number(response?.status) >= 400))
        ) {
          appendFileSync(diagnostics, `${JSON.stringify(message)}\n`);
        }
      }
    });
    connection.addEventListener("close", () => {
      for (const request of pending.values()) {
        clearTimeout(request.timer);
        request.reject(new Error("The browser socket closes before the command returns."));
      }
      pending.clear();
    });
    for (const domain of ["Runtime", "Page", "Log", "Network"]) {
      await send(`${domain}.enable`);
    }
    await send("Emulation.setFocusEmulationEnabled", { enabled: true });
    return { send, close };
  } catch (error) {
    await close();
    throw error;
  }

  function send(
    method: string,
    parameters: Record<string, unknown> = {},
  ): Promise<Record<string, unknown>> {
    return new Promise((resolve, reject) => {
      if (socket?.readyState !== WebSocket.OPEN) {
        reject(new Error("The browser socket is not open."));
        return;
      }
      const id = ++nextId;
      const timer = globalThis.setTimeout(() => {
        pending.delete(id);
        reject(new Error(`The browser command ${method} does not return within 30 seconds.`));
      }, 30000);
      pending.set(id, { resolve, reject, timer });
      socket.send(JSON.stringify({ id, method, params: parameters }));
    });
  }

  async function close(): Promise<void> {
    if (socket?.readyState === WebSocket.OPEN) {
      await send("Browser.close").catch(() => undefined);
      socket.close();
    }
    if (browser.exitCode === null && browser.signalCode === null) {
      browser.kill();
      await Promise.race([
        new Promise<void>((resolve) => browser.once("exit", () => resolve())),
        setTimeout(3000),
      ]);
    }
  }
}
