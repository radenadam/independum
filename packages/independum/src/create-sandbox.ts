import { createHash } from "node:crypto";
import { existsSync, realpathSync, statSync } from "node:fs";
import { dirname, isAbsolute } from "node:path";
import type { Readable } from "node:stream";
import { fileURLToPath } from "node:url";
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

/** A complete runtime baseline whose hash binds approval to the effective backend and grants. */
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
  isFileWorker = false,
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
      ? [process.env.SystemRoot, dirname(executable)]
      : [
          "/usr",
          "/bin",
          "/sbin",
          "/lib",
          "/lib64",
          "/etc/ld.so.cache",
          "/etc/localtime",
          dirname(executable),
        ];
  if (isFileWorker) {
    candidates.push(fileURLToPath(new URL("..", import.meta.url)));
    candidates.push(fileURLToPath(new URL("../../../node_modules", import.meta.url)));
  }
  const readonlyPaths = [
    ...new Set(
      candidates
        .filter((path): path is string => path !== undefined && existsSync(path))
        .map((path) => realpathSync.native(path)),
    ),
  ].sort();
  const implicitAccess =
    process.platform === "win32"
      ? "Windows also makes files readable by application packages available to the program. Programs can open windows. Clipboard access and simulated keyboard and mouse input are blocked. No writable temporary folder outside the project is included."
      : "The sandbox also supplies operating system startup access and private devices. No host control socket or writable temporary folder outside the project is included.";
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

/** Compiles only representable grants and never uses bubblewrap denial masking. */
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
  for (const resource of launch.paths) {
    const path = canonicalPermissionPath(resource.path, folder);
    if (
      resource.access === "write" &&
      launch.readonlyPaths?.some(
        (readonly) => canonicalPermissionPath(readonly, folder) === path,
      ) === true
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
  if (launch.runtime.backend === "bubblewrap" && deniedPaths.length > 0) {
    throw new Error(
      "Bubblewrap cannot enforce these overlapping exclusions without masking denied paths. This invocation is refused because masking can report a successful empty read.",
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
): Promise<{ output: string; error: string; exitCode: number; warnings: string[] }> {
  signal?.throwIfAborted();
  const process = await launchSandbox(request);
  function stop(): void {
    process.kill();
  }
  signal?.addEventListener("abort", stop, { once: true });
  if (signal?.aborted === true) {
    stop();
  }
  async function read(stream: Readable | null): Promise<string> {
    let text = "";
    stream?.setEncoding("utf8");
    if (stream !== null) {
      for await (const chunk of stream) {
        text += String(chunk);
      }
    }
    return text;
  }
  const output = read(process.standardOutput);
  const error = read(process.standardError);
  process.standardInput?.end(input);
  try {
    const [end, capturedOutput, capturedError] = await Promise.all([process.wait(), output, error]);
    return {
      output: capturedOutput,
      error: capturedError,
      exitCode: end.exitCode,
      warnings: [...process.warnings],
    };
  } finally {
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
