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

/** Opens a new runtime file with verified account-only permissions. */
export function openPrivateRuntimeFile(path: string): number {
  const descriptor = openSync(
    path,
    constants.O_WRONLY | constants.O_CREAT | constants.O_EXCL,
    0o600,
  );
  try {
    if (process.platform === "win32") {
      windowsPrivacy().secureFile(path);
    }
    checkPrivate(path, false);
    return descriptor;
  } catch (error) {
    closeSync(descriptor);
    unlinkSync(path);
    throw error;
  }
}

/** Publishes a token only after its directory and file permissions pass verification. */
export function publishServer(directory: string, connection: ServerConnection): () => void {
  const path = join(privateRuntime(directory), "server.json");
  const staging = join(directory, "runtime", `server-${randomUUID()}.json`);
  const descriptor = openPrivateRuntimeFile(staging);
  try {
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

/** Reads a bounded connection record only after verifying private ownership and permissions. */
export function readServer(directory: string): ServerConnection | undefined {
  const path = join(directory, "runtime", "server.json");
  try {
    checkPrivate(join(directory, "runtime"), true);
    checkPrivate(path, false);
  } catch (error) {
    if (isMissingFile(error)) {
      return undefined;
    }
    throw new Error(
      `The private server record cannot be read securely. ${error instanceof Error ? error.message : String(error)}`,
    );
  }
  try {
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
  secureFile(path: string): void;
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
  const lastError = kernel.func("uint32_t __stdcall GetLastError()");
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
  const parseSid = security.func(
    "bool __stdcall ConvertStringSidToSidW(const char16_t* text, _Out_ void** sid)",
  );
  const lookupAccount = security.func(
    "bool __stdcall LookupAccountSidW(const char16_t* system, void* sid, void* name, _Inout_ uint32_t* nameLength, void* domain, _Inout_ uint32_t* domainLength, _Out_ uint32_t* use)",
  );
  const parseDescriptor = security.func(
    "bool __stdcall ConvertStringSecurityDescriptorToSecurityDescriptorW(const char16_t* text, uint32_t revision, _Out_ void** descriptor, void* size)",
  );
  const getSecurity = security.func(
    "bool __stdcall GetFileSecurityW(const char16_t* path, uint32_t information, void* descriptor, uint32_t length, _Out_ uint32_t* required)",
  );
  const descriptorOwner = security.func(
    "bool __stdcall GetSecurityDescriptorOwner(void* descriptor, _Out_ void** owner, _Out_ int32_t* isDefaulted)",
  );
  const descriptorAccess = security.func(
    "bool __stdcall GetSecurityDescriptorDacl(void* descriptor, _Out_ int32_t* isPresent, _Out_ void** access, _Out_ int32_t* isDefaulted)",
  );
  const getEntry = security.func(
    "bool __stdcall GetAce(void* access, uint32_t index, _Out_ void** entry)",
  );
  const setSecurity = security.func(
    "uint32_t __stdcall SetNamedSecurityInfoW(const char16_t* path, int objectType, uint32_t information, void* owner, void* group, void* access, void* audit)",
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
    throw windowsFailure("OpenProcessToken");
  }
  let identity: string;
  let defaultOwner: string;
  try {
    identity = tokenIdentity(1);
    defaultOwner = tokenIdentity(4);
  } finally {
    closeHandle(token[0]);
  }
  function windowsFailure(call: string, code: number = lastError()): Error {
    return new Error(`The Windows call ${call} failed (Windows error ${code}).`);
  }
  function tokenIdentity(informationClass: number): string {
    const required = [0];
    if (!tokenInformation(token[0], informationClass, null, 0, required)) {
      const code = lastError();
      if (code !== 122) {
        throw windowsFailure("GetTokenInformation", code);
      }
    }
    const information = Buffer.alloc(required[0] ?? 0);
    if (!tokenInformation(token[0], informationClass, information, information.length, required)) {
      throw windowsFailure("GetTokenInformation");
    }
    return identityOf(koffi.decode(information, "void*"));
  }
  function identityOf(sid: unknown): string {
    const text: unknown[] = [null];
    if (!sidString(sid, text)) {
      throw windowsFailure("ConvertSidToStringSidW");
    }
    try {
      return String(koffi.decode(text[0], "char16_t", -1));
    } finally {
      free(text[0]);
    }
  }
  function withSid<Value>(text: string, read: (sid: unknown) => Value): Value {
    const sid: unknown[] = [null];
    if (!parseSid(text, sid)) {
      throw windowsFailure("ConvertStringSidToSidW");
    }
    try {
      return read(sid[0]);
    } finally {
      free(sid[0]);
    }
  }
  function accountName(sid: unknown): string | undefined {
    const nameLength = [0];
    const domainLength = [0];
    const use = [0];
    lookupAccount(null, sid, null, nameLength, null, domainLength, use);
    if (!nameLength[0]) {
      return undefined;
    }
    const name = Buffer.alloc(nameLength[0] * 2);
    const domain = Buffer.alloc((domainLength[0] ?? 0) * 2);
    if (!lookupAccount(null, sid, name, nameLength, domain, domainLength, use)) {
      return undefined;
    }
    const account = String(koffi.decode(name, "char16_t", -1));
    const authority = String(koffi.decode(domain, "char16_t", -1));
    return authority ? `${authority}\\${account}` : account;
  }
  const rawDescriptorString = security.func(
    "bool __stdcall ConvertSecurityDescriptorToStringSecurityDescriptorW(void* descriptor, uint32_t revision, uint32_t information, _Out_ void** text, void* length)",
  );
  function withPrivateDescriptor(isDirectory: boolean, apply: (descriptor: unknown) => void): void {
    const descriptor: unknown[] = [null];
    const flags = isDirectory ? "OICI" : "";
    if (
      !parseDescriptor(`O:${defaultOwner}D:P(A;${flags};FA;;;${identity})`, 1, descriptor, null)
    ) {
      throw windowsFailure("ConvertStringSecurityDescriptorToSecurityDescriptorW");
    }
    try {
      apply(descriptor[0]);
    } finally {
      free(descriptor[0]);
    }
  }
  function protect(path: string, descriptor: unknown): void {
    const owner: unknown[] = [null];
    const access: unknown[] = [null];
    const isPresent = [0];
    const isDefaulted = [0];
    if (!descriptorOwner(descriptor, owner, isDefaulted)) {
      throw windowsFailure("GetSecurityDescriptorOwner");
    }
    if (!descriptorAccess(descriptor, isPresent, access, isDefaulted)) {
      throw windowsFailure("GetSecurityDescriptorDacl");
    }
    if (isPresent[0] !== 1) {
      throw new Error("The private Windows permissions contain no access list.");
    }
    const result = setSecurity(path, 1, 0x80000005, owner[0], null, access[0], null);
    if (result !== 0) {
      throw windowsFailure("SetNamedSecurityInfoW", result);
    }
  }
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
      withPrivateDescriptor(true, (descriptor) => {
        const attributes = Buffer.alloc(koffi.sizeof(attributesType));
        koffi.encode(attributes, attributesType, {
          length: attributes.length,
          descriptor,
          inherit: 0,
        });
        if (createDirectory(path, attributes)) {
          protect(path, descriptor);
        } else {
          const code = lastError();
          if (code !== 183) {
            throw windowsFailure("CreateDirectoryW", code);
          }
          lstatSync(path);
        }
      });
    },
    secureFile(path) {
      withPrivateDescriptor(false, (descriptor) => protect(path, descriptor));
    },
    check(path, isDirectory) {
      const size = [0];
      if (!getSecurity(path, 5, null, 0, size)) {
        const code = lastError();
        if (code !== 122) {
          throw windowsFailure("GetFileSecurityW", code);
        }
      }
      const descriptor = Buffer.alloc(size[0] ?? 0);
      if (!getSecurity(path, 5, descriptor, descriptor.length, size)) {
        throw windowsFailure("GetFileSecurityW");
      }
      const owner: unknown[] = [null];
      const isDefaulted = [0];
      if (!descriptorOwner(descriptor, owner, isDefaulted)) {
        throw windowsFailure("GetSecurityDescriptorOwner");
      }
      const ownerIdentity = identityOf(owner[0]);
      const pointer: unknown[] = [null];
      if (!rawDescriptorString(descriptor, 1, 5, pointer, null)) {
        throw windowsFailure("ConvertSecurityDescriptorToStringSecurityDescriptorW");
      }
      try {
        const value = String(koffi.decode(pointer[0], "char16_t", -1));
        const entries = [...value.matchAll(/\(([^)]+)\)/g)];
        const problems: string[] = [];
        if (ownerIdentity !== identity && ownerIdentity !== defaultOwner) {
          problems.push(`The owner is ${ownerIdentity}, expected ${identity} or ${defaultOwner}.`);
        }
        if (!value.includes("D:P")) {
          problems.push("The access list is not protected from inheritance.");
        }
        if (entries.length !== 1) {
          problems.push(`The access list has ${entries.length} entries, expected 1.`);
        }
        const access: unknown[] = [null];
        const isPresent = [0];
        if (!descriptorAccess(descriptor, isPresent, access, isDefaulted)) {
          throw windowsFailure("GetSecurityDescriptorDacl");
        }
        for (const [index, entry] of entries.entries()) {
          const fields = entry[1]?.split(";") ?? [];
          withSid(fields[5] ?? "", (sid) => {
            const account = identityOf(sid);
            if (
              fields[0] === "A" &&
              fields[1] === (isDirectory ? "OICI" : "") &&
              fields[2] === "FA" &&
              fields[3] === "" &&
              fields[4] === "" &&
              account === identity &&
              entries.length === 1
            ) {
              return;
            }
            const nativeEntry: unknown[] = [null];
            if (!getEntry(access[0], index, nativeEntry)) {
              throw windowsFailure("GetAce");
            }
            const mask = Number(koffi.decode(nativeEntry[0], 4, "uint32_t"));
            const name = accountName(sid);
            const type = fields[0];
            const action = ["A", "OA", "XA", "ZA"].includes(type ?? "")
              ? "allows"
              : ["D", "OD", "XD", "ZD"].includes(type ?? "")
                ? "denies"
                : `has type ${type} for`;
            problems.push(
              `Entry ${index + 1} ${action} ${account}${name ? ` (${name})` : ""}, access mask 0x${mask.toString(16).padStart(8, "0")}, inherited ${fields[1]?.includes("ID") ? "yes" : "no"}, flags ${fields[1] || "none"}.`,
            );
          });
        }
        if (problems.length > 0) {
          throw new Error(
            `The runtime permissions must grant access only to the current account ${identity}. ${problems.join(" ")}`,
          );
        }
      } finally {
        free(pointer[0]);
      }
    },
  };
  return privacy;
}
