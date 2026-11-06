import { createHash } from "node:crypto";
import { existsSync, realpathSync, statSync } from "node:fs";
import { isAbsolute } from "node:path";
import type { Readable } from "node:stream";
import {
  type ContainerRequest,
  getPlatformSupport,
  type MxcProcess,
  type PlatformSupport,
  probe,
  spawn,
} from "@microsoft/mxc-sdk/v1";
import {
  canonicalPermissionPath,
  containsPermissionPath,
  type PathAccess,
} from "./permission-policy.ts";

/** The system read boundary and runtime identity of a concrete backend. */
export interface SandboxRuntime {
  backend: "processcontainer" | "seatbelt" | "bubblewrap";
  support: PlatformSupport;
  readonlyPaths: string[];
  implicitAccess: string;
  environment: "minimal" | "inherit";
  environmentNames: string[];
  runtimeHash: string;
  unavailable: string | null;
}

/** The effective grants of one isolated invocation. */
export interface SandboxLaunch {
  readonlyPaths?: string[];
  runtime: SandboxRuntime;
  paths: PathAccess[];
  deniedPaths: string[];
  network: boolean;
}

/** Discovers a concrete backend without selecting a weaker fallback. */
export function sandboxRuntime(
  executable: string,
  environment: "minimal" | "inherit",
  environmentNames: string[],
): SandboxRuntime {
  const backend: SandboxRuntime["backend"] =
    process.platform === "win32"
      ? "processcontainer"
      : process.platform === "darwin"
        ? "seatbelt"
        : "bubblewrap";
  let support: PlatformSupport;
  let unavailable: string | null = null;
  try {
    support = getPlatformSupport();
    if (!support.isSupported || !support.availableMethods.includes(backend)) {
      unavailable =
        support.reason ??
        support.unavailableReasons?.[backend] ??
        `The ${backend} backend is unavailable.`;
    } else if (process.platform === "win32" && support.isolationTier !== "base-container") {
      unavailable =
        "Windows ProcessContainer requires the BaseContainer isolation tier. No weaker fallback is permitted.";
    }
  } catch (error) {
    unavailable = error instanceof Error ? error.message : "Sandbox discovery failed.";
    support = { isSupported: false, availableMethods: [], reason: unavailable };
  }
  const candidates =
    process.platform === "win32"
      ? [..."ABCDEFGHIJKLMNOPQRSTUVWXYZ"].map((drive) => `${drive}:\\`)
      : ["/"];
  const readonlyPaths = [
    ...new Set(
      candidates.filter((path) => existsSync(path)).map((path) => realpathSync.native(path)),
    ),
  ].sort();
  const implicitAccess =
    process.platform === "win32"
      ? "Every available drive root is readable except denied paths. Programs can open windows. Clipboard access and simulated keyboard and mouse input are blocked. No writable temporary folder outside the project is included."
      : "The system root is readable except denied paths. The sandbox supplies private devices. No writable temporary folder outside the project is included.";
  const identity = statSync(executable);
  const baseline = {
    package: "@microsoft/mxc-sdk@1.0.1/v1",
    backend,
    support,
    readonlyPaths,
    implicitAccess,
    environment,
    environmentNames: [...environmentNames].sort(),
    executable: realpathSync.native(executable),
    executableSize: identity.size,
    executableModified: identity.mtimeMs,
  };
  return {
    ...baseline,
    runtimeHash: `sha256:${createHash("sha256").update(JSON.stringify(baseline)).digest("hex")}`,
    unavailable,
  };
}

/** Compiles grants and refuses denial policies that the backend cannot enforce. */
export function sandboxRequest(
  launch: SandboxLaunch,
  command: string,
  folder: string,
  environment: Record<string, string>,
): ContainerRequest {
  if (launch.runtime.unavailable !== null) {
    throw new Error(launch.runtime.unavailable);
  }
  if (!isAbsolute(folder) || !statSync(folder).isDirectory()) {
    throw new Error("The sandbox working directory must be an absolute existing folder.");
  }
  const readonlyPaths = [...launch.runtime.readonlyPaths, ...(launch.readonlyPaths ?? [])];
  const readwritePaths: string[] = [];
  const paths = launch.paths.filter(
    (resource) =>
      resource.access !== "write" ||
      launch.readonlyPaths?.some(
        (readonly) =>
          canonicalPermissionPath(readonly, folder) ===
          canonicalPermissionPath(resource.path, folder),
      ) !== true,
  );
  for (const resource of paths) {
    const path = canonicalPermissionPath(resource.path, folder);
    if (
      resource.access === "read" &&
      paths.some(
        (grant) =>
          grant.access === "write" &&
          (grant.scope === "tree"
            ? containsPermissionPath(grant.path, path)
            : canonicalPermissionPath(grant.path, folder) === path),
      )
    ) {
      continue;
    }
    (resource.access === "write" ? readwritePaths : readonlyPaths).push(resource.path);
  }
  const deniedPaths = launch.deniedPaths.filter((denied) =>
    [...readonlyPaths, ...readwritePaths].some(
      (allowed) =>
        containsPermissionPath(allowed, denied) || containsPermissionPath(denied, allowed),
    ),
  );
  if (
    launch.runtime.backend === "bubblewrap" &&
    deniedPaths.some((path) => !existsSync(path) || !statSync(path).isDirectory())
  ) {
    throw new Error(
      "Bubblewrap requires existing denied folders. Masking a denied file can report a successful empty read, so this invocation is refused.",
    );
  }
  const request: ContainerRequest = {
    command,
    containment: { type: launch.runtime.backend },
    workingDirectory: folder,
    environment,
    inheritDefaultEnvironment: false,
    filesystem: { readonlyPaths, readwritePaths, deniedPaths },
    network: {
      egress: { default: launch.network ? "allow" : "deny" },
      ingress: {
        default: launch.network ? "allow" : "deny",
        hostLoopback: launch.network ? "allow" : "deny",
      },
    },
    ...(process.platform === "win32"
      ? { ui: { disable: false, clipboard: "none" as const, allowInputInjection: false } }
      : {}),
  };
  if (launch.runtime.backend === "processcontainer") {
    const supported = probe(request);
    if (
      supported.tier !== "base-container" ||
      supported.error !== undefined ||
      supported.warnings.length > 0
    ) {
      throw new Error(
        supported.error ??
          `The requested BaseContainer policy is not enforceable. ${supported.warnings.join(" ")}`,
      );
    }
  }
  return request;
}

/** Starts one isolated workload with telemetry disabled and no unrestricted fallback. */
export async function launchSandbox(request: ContainerRequest): Promise<MxcProcess> {
  return spawn(request, { telemetry: { enabled: false } });
}

/** Captures a restricted worker while retaining the same launch and cancellation boundary. */
export async function captureSandbox(
  request: ContainerRequest,
  input?: string,
  signal?: AbortSignal,
  limits?: { outputLimitBytes: number; errorLimitBytes: number; timeoutMs: number | null },
): Promise<{
  output: string;
  error: string;
  exitCode: number;
  warnings: string[];
  failure?: string;
}> {
  signal?.throwIfAborted();
  let failure: string | undefined;
  let workload: MxcProcess | undefined;
  function fail(message: string): void {
    failure ??= message;
    workload?.kill();
  }
  const deadline = limits?.timeoutMs == null ? null : performance.now() + limits.timeoutMs;
  let timer: ReturnType<typeof setTimeout> | undefined;
  function observeDeadline(): void {
    if (deadline !== null) {
      const remaining = deadline - performance.now();
      if (remaining <= 0) {
        fail("The hook deadline expired.");
      } else {
        timer = setTimeout(observeDeadline, Math.min(remaining, 2147483647));
      }
    }
  }
  observeDeadline();
  let process: MxcProcess;
  try {
    process = await launchSandbox(request);
    workload = process;
  } catch (error) {
    clearTimeout(timer);
    throw error;
  }
  function stop(): void {
    fail("The invocation was cancelled.");
  }
  signal?.addEventListener("abort", stop, { once: true });
  if (signal?.aborted === true || failure !== undefined) {
    stop();
  }
  async function read(stream: Readable | null, limit: number | undefined): Promise<string> {
    const chunks: Buffer[] = [];
    let size = 0;
    if (stream !== null) {
      for await (const chunk of stream) {
        const bytes = Buffer.from(chunk);
        size += bytes.length;
        if (limit !== undefined && size > limit) {
          fail("The hook output exceeds its byte limit.");
        } else {
          chunks.push(bytes);
        }
      }
    }
    const bytes = Buffer.concat(chunks);
    if (limits !== undefined) {
      try {
        new TextDecoder("utf-8", { fatal: true }).decode(bytes);
      } catch {
        fail("The hook output is not valid UTF-8.");
      }
    }
    return bytes.toString("utf8");
  }
  const output = read(process.standardOutput, limits?.outputLimitBytes);
  const error = read(process.standardError, limits?.errorLimitBytes);
  const writing = new Promise<void>((resolve) => {
    if (process.standardInput === null) {
      resolve();
      return;
    }
    process.standardInput.once("error", () => {
      fail("The worker closed its input before delivery completed.");
      resolve();
    });
    process.standardInput.end(input, resolve);
  });
  try {
    const [end, capturedOutput, capturedError] = await Promise.all([
      process.wait(),
      output,
      error,
      writing,
    ]);
    return {
      output: capturedOutput,
      error: capturedError,
      exitCode: end.exitCode,
      warnings: [...process.warnings],
      ...(failure === undefined ? {} : { failure }),
    };
  } finally {
    clearTimeout(timer);
    signal?.removeEventListener("abort", stop);
    process.dispose();
  }
}

/** Quotes executable arguments for the command line accepted by the native backend. */
export function sandboxCommand(executable: string, arguments_: string[]): string {
  return [executable, ...arguments_]
    .map((argument) => {
      if (process.platform !== "win32") {
        return `'${argument.replaceAll("'", "'\\''")}'`;
      }
      return `"${argument.replace(/(\\*)"/g, '$1$1\\"').replace(/(\\+)$/g, "$1$1")}"`;
    })
    .join(" ");
}
