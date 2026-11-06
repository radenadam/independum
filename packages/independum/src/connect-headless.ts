import { spawn } from "node:child_process";
import { closeSync, readFileSync, unlinkSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { setTimeout } from "node:timers/promises";
import { commandEnvironment } from "./command-environment.ts";
import { HeadlessError } from "./headless-types.ts";
import {
  openPrivateRuntimeFile,
  privateRuntime,
  readServer,
  removeServer,
  type ServerConnection,
} from "./private-runtime.ts";
import { readServerUrl } from "./read-server-url.ts";

/** Dependencies and connection choices for a headless client. */
export interface HeadlessConnectionOptions {
  directory: string;
  folder: string;
  server?: string;
  token?: string;
  start: "auto" | "never";
  request?: typeof fetch;
  launch?: () => void;
  signal: AbortSignal;
}

/** Connects to an authenticated local instance and starts one only when none listens. */
export async function connectHeadless(
  options: HeadlessConnectionOptions,
): Promise<ServerConnection> {
  const request = options.request ?? fetch;
  async function verify(connection: ServerConnection): Promise<ServerConnection> {
    let response: Response;
    try {
      response = await request(new URL("/api/health", connection.url), {
        headers: { authorization: `Bearer ${connection.accessToken}` },
        redirect: "error",
        signal: AbortSignal.any([options.signal, AbortSignal.timeout(5000)]),
      });
    } catch (error) {
      if (
        typeof error === "object" &&
        error !== null &&
        "cause" in error &&
        typeof error.cause === "object" &&
        error.cause !== null &&
        "code" in error.cause &&
        error.cause.code === "ECONNREFUSED"
      ) {
        throw error;
      }
      throw new HeadlessError("The server connection failed.", "connectionFailed", 5);
    }
    if (response.status === 401 || response.status === 403) {
      throw new HeadlessError("The server rejected access.", "accessDenied", 4);
    }
    const health = (await response.json().catch(() => null)) as {
      status?: string;
      serverId?: string;
      protocolVersion?: number;
    } | null;
    if (
      !response.ok ||
      health?.status !== "ok" ||
      typeof health.serverId !== "string" ||
      health.protocolVersion !== 1 ||
      (connection.serverId !== "" && health.serverId !== connection.serverId)
    ) {
      throw new HeadlessError(
        "The server identity or protocol does not match.",
        "protocolMismatch",
        5,
      );
    }
    return { ...connection, serverId: health.serverId };
  }
  if (options.server !== undefined) {
    let url: string;
    try {
      url = readServerUrl(options.server, true);
    } catch {
      throw new HeadlessError("The server address is invalid.", "invalidServer", 2);
    }
    if (!options.token) {
      throw new HeadlessError(
        "An explicit server requires an access token from stdin or the environment.",
        "tokenMissing",
        4,
      );
    }
    try {
      return await verify({
        version: 1,
        serverId: "",
        pid: 0,
        url,
        accessToken: options.token,
      });
    } catch (error) {
      if (error instanceof HeadlessError) {
        throw error;
      }
      throw new HeadlessError("The explicit server is not listening.", "connectionFailed", 5);
    }
  }

  async function discover(): Promise<ServerConnection | undefined> {
    let connection: ServerConnection | undefined;
    try {
      connection = readServer(options.directory);
    } catch (error) {
      throw new HeadlessError(
        error instanceof Error
          ? error.message
          : "The private server record cannot be read securely.",
        "privateRecordDenied",
        4,
      );
    }
    if (connection === undefined) {
      return undefined;
    }
    try {
      return await verify(connection);
    } catch (error) {
      if (error instanceof HeadlessError) {
        throw error;
      }
      removeServer(options.directory, connection.serverId);
      return undefined;
    }
  }
  const existing = await discover();
  if (existing !== undefined) {
    return existing;
  }
  if (options.start === "never") {
    throw new HeadlessError("No Independum server is running.", "serverMissing", 5);
  }
  let runtime: string;
  try {
    runtime = privateRuntime(options.directory);
  } catch (error) {
    throw new HeadlessError(
      `The private runtime directory cannot be secured. ${error instanceof Error ? error.message : String(error)}`,
      "privateRecordDenied",
      4,
    );
  }
  const lockPath = join(runtime, "start.lock");
  const deadline = Date.now() + 30000;
  while (Date.now() < deadline) {
    options.signal.throwIfAborted();
    let descriptor: number;
    try {
      descriptor = openPrivateRuntimeFile(lockPath);
    } catch (error) {
      if (
        typeof error !== "object" ||
        error === null ||
        !("code" in error) ||
        error.code !== "EEXIST"
      ) {
        throw new HeadlessError(
          `The server startup lock cannot be created. ${error instanceof Error ? error.message : String(error)}`,
          "startupFailed",
          5,
        );
      }
      const pid = Number(readFileSync(lockPath, "utf8"));
      if (Number.isSafeInteger(pid) && pid > 0) {
        try {
          process.kill(pid, 0);
        } catch (error) {
          if (
            typeof error === "object" &&
            error !== null &&
            "code" in error &&
            error.code === "ESRCH"
          ) {
            unlinkSync(lockPath);
          }
        }
      }
      await setTimeout(100, undefined, { signal: options.signal });
      const connection = await discover();
      if (connection !== undefined) {
        return connection;
      }
      continue;
    }
    try {
      writeFileSync(descriptor, String(process.pid));
      const connection = await discover();
      if (connection !== undefined) {
        return connection;
      }
      if (options.launch !== undefined) {
        options.launch();
      } else {
        const environment = commandEnvironment("inherit", {});
        const child = spawn(
          process.execPath,
          [join(import.meta.dirname, "cli.ts"), "server", "start", "--foreground"],
          {
            cwd: options.folder,
            detached: true,
            stdio: "ignore",
            windowsHide: true,
            env: environment,
          },
        );
        child.on("error", () => undefined);
        child.unref();
      }
      while (Date.now() < deadline) {
        await setTimeout(100, undefined, { signal: options.signal });
        const started = await discover();
        if (started !== undefined) {
          return started;
        }
      }
    } finally {
      closeSync(descriptor);
      unlinkSync(lockPath);
    }
  }
  throw new HeadlessError("The server did not start on port 4870.", "startupFailed", 5);
}
