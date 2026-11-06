import { randomUUID } from "node:crypto";
import {
  closeSync,
  constants,
  fsyncSync,
  lstatSync,
  mkdirSync,
  openSync,
  readFileSync,
  renameSync,
  unlinkSync,
  writeFileSync,
} from "node:fs";
import { createRequire } from "node:module";
import { join } from "node:path";
import { isMissingFile } from "./is-missing-file.ts";
import { readServerUrl } from "./read-server-url.ts";

/** The private connection record of one listening server. */
export interface ServerConnection {
  version: 1;
  serverId: string;
  pid: number;
  url: string;
  accessToken: string;
}

/** Creates or verifies the account-only runtime directory. */
export function privateRuntime(directory: string): string {
  const path = join(directory, "runtime");
  mkdirSync(directory, { recursive: true });
  if (process.platform === "win32") {
    windowsPrivacy().create(path);
  } else {
    mkdirSync(path, { mode: 0o700, recursive: true });
  }
  checkPrivate(path, true);
  return path;
}

/** Publishes a token only after its directory and file permissions pass verification. */
export function publishServer(directory: string, connection: ServerConnection): () => void {
  const path = join(privateRuntime(directory), "server.json");
  const staging = join(directory, "runtime", `server-${randomUUID()}.json`);
  const descriptor = openSync(
    staging,
    constants.O_WRONLY | constants.O_CREAT | constants.O_EXCL,
    0o600,
  );
  try {
    checkPrivate(staging, false);
    writeFileSync(descriptor, `${JSON.stringify(connection)}\n`);
    fsyncSync(descriptor);
  } finally {
    closeSync(descriptor);
  }
  renameSync(staging, path);
  return () => {
    if (readServer(directory)?.serverId === connection.serverId) {
      unlinkSync(path);
    }
  };
}

/** Reads a bounded connection record only after verifying account ownership and permissions. */
export function readServer(directory: string): ServerConnection | undefined {
  const path = join(directory, "runtime", "server.json");
  try {
    checkPrivate(join(directory, "runtime"), true);
    checkPrivate(path, false);
    const descriptor = openSync(path, constants.O_RDONLY | (constants.O_NOFOLLOW ?? 0));
    let value: unknown;
    try {
      value = JSON.parse(readFileSync(descriptor, "utf8"));
    } finally {
      closeSync(descriptor);
    }
    if (
      typeof value !== "object" ||
      value === null ||
      !("version" in value) ||
      value.version !== 1 ||
      !("serverId" in value) ||
      typeof value.serverId !== "string" ||
      !("pid" in value) ||
      !Number.isSafeInteger(value.pid) ||
      !("url" in value) ||
      typeof value.url !== "string" ||
      !("accessToken" in value) ||
      typeof value.accessToken !== "string" ||
      value.accessToken.length < 32
    ) {
      throw new Error("The private server record is invalid.");
    }
    readServerUrl(value.url);
    return value as ServerConnection;
  } catch (error) {
    if (isMissingFile(error)) {
      return undefined;
    }
    throw new Error("The private server record cannot be read securely.");
  }
}

/** Removes a stale record after an authenticated connection attempt fails to find a listener. */
export function removeServer(directory: string, serverId: string): void {
  if (readServer(directory)?.serverId === serverId) {
    unlinkSync(join(directory, "runtime", "server.json"));
  }
}

function checkPrivate(path: string, isDirectory: boolean): void {
  const information = lstatSync(path);
  if (
    information.isSymbolicLink() ||
    (isDirectory ? !information.isDirectory() : !information.isFile()) ||
    (!isDirectory && (information.nlink !== 1 || information.size > 8192))
  ) {
    throw new Error("The private runtime path is unsafe.");
  }
  if (process.platform === "win32") {
    windowsPrivacy().check(path, isDirectory);
  } else if (information.uid !== process.getuid?.() || (information.mode & 0o077) !== 0) {
    throw new Error("The private runtime path must belong only to the current account.");
  }
}

interface WindowsPrivacy {
  create(path: string): void;
  check(path: string, isDirectory: boolean): void;
}

let privacy: WindowsPrivacy | undefined;

function windowsPrivacy(): WindowsPrivacy {
  if (privacy !== undefined) {
    return privacy;
  }
  const koffi = createRequire(import.meta.url)("koffi") as typeof import("koffi");
  const kernel = koffi.load("kernel32.dll");
  const security = koffi.load("advapi32.dll");
  const currentProcess = kernel.func("void* __stdcall GetCurrentProcess()");
  const closeHandle = kernel.func("bool __stdcall CloseHandle(void* handle)");
  const free = kernel.func("void* __stdcall LocalFree(void* memory)");
  const openToken = security.func(
    "bool __stdcall OpenProcessToken(void* process, uint32_t access, _Out_ void** token)",
  );
  const tokenInformation = security.func(
    "bool __stdcall GetTokenInformation(void* token, int informationClass, void* information, uint32_t length, _Out_ uint32_t* required)",
  );
  const sidString = security.func(
    "bool __stdcall ConvertSidToStringSidW(void* sid, _Out_ void** text)",
  );
  const parseDescriptor = security.func(
    "bool __stdcall ConvertStringSecurityDescriptorToSecurityDescriptorW(const char16_t* text, uint32_t revision, _Out_ void** descriptor, void* size)",
  );
  const getSecurity = security.func(
    "bool __stdcall GetFileSecurityW(const char16_t* path, uint32_t information, void* descriptor, uint32_t length, _Out_ uint32_t* required)",
  );
  const createDirectory = kernel.func(
    "bool __stdcall CreateDirectoryW(const char16_t* path, void* attributes)",
  );
  const attributesType = koffi.struct({
    length: "uint32_t",
    descriptor: "void*",
    inherit: "int32_t",
  });
  const token: unknown[] = [null];
  if (!openToken(currentProcess(), 8, token)) {
    throw new Error("The current Windows account cannot be verified.");
  }
  const required = [0];
  tokenInformation(token[0], 1, null, 0, required);
  const information = Buffer.alloc(required[0] ?? 0);
  try {
    if (!tokenInformation(token[0], 1, information, information.length, required)) {
      throw new Error("The current Windows account cannot be read.");
    }
  } finally {
    closeHandle(token[0]);
  }
  const text: unknown[] = [null];
  if (!sidString(koffi.decode(information, "void*"), text)) {
    throw new Error("The current Windows identity cannot be read.");
  }
  const identity = String(koffi.decode(text[0], "char16_t", -1));
  free(text[0]);
  const rawDescriptorString = security.func(
    "bool __stdcall ConvertSecurityDescriptorToStringSecurityDescriptorW(void* descriptor, uint32_t revision, uint32_t information, _Out_ void** text, void* length)",
  );
  privacy = {
    create(path) {
      try {
        lstatSync(path);
        return;
      } catch (error) {
        if (!isMissingFile(error)) {
          throw error;
        }
      }
      const descriptor: unknown[] = [null];
      if (!parseDescriptor(`O:${identity}D:P(A;OICI;FA;;;${identity})`, 1, descriptor, null)) {
        throw new Error("Private Windows permissions cannot be created.");
      }
      try {
        const attributes = Buffer.alloc(koffi.sizeof(attributesType));
        koffi.encode(attributes, attributesType, {
          length: attributes.length,
          descriptor: descriptor[0],
          inherit: 0,
        });
        if (!createDirectory(path, attributes)) {
          lstatSync(path);
        }
      } finally {
        free(descriptor[0]);
      }
    },
    check(path, isDirectory) {
      const size = [0];
      getSecurity(path, 5, null, 0, size);
      const descriptor = Buffer.alloc(size[0] ?? 0);
      if (!getSecurity(path, 5, descriptor, descriptor.length, size)) {
        throw new Error("Private Windows permissions cannot be verified.");
      }
      const pointer: unknown[] = [null];
      if (!rawDescriptorString(descriptor, 1, 5, pointer, null)) {
        throw new Error("Private Windows permissions cannot be inspected.");
      }
      try {
        const value = String(koffi.decode(pointer[0], "char16_t", -1));
        const owner = value.slice(0, value.indexOf("D:"));
        const entries = [...value.matchAll(/\(([^)]+)\)/g)];
        if (
          owner !== `O:${identity}` ||
          (isDirectory && !value.includes("D:P")) ||
          entries.length !== 1 ||
          !entries.every((entry) => {
            const fields = entry[1]?.split(";");
            return fields?.[0] === "A" && fields[2] === "FA" && fields[5] === identity;
          })
        ) {
          throw new Error("The runtime permissions must grant access only to the current account.");
        }
      } finally {
        free(pointer[0]);
      }
    },
  };
  return privacy;
}
