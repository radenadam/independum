import {
  chmodSync,
  existsSync,
  linkSync,
  mkdirSync,
  readFileSync,
  symlinkSync,
  writeFileSync,
} from "node:fs";
import { createRequire } from "node:module";
import { join } from "node:path";
import { expect, test, vi } from "vitest";
import { connectHeadless } from "./connect-headless.ts";
import { createTestConnection } from "./create-test-connection.ts";
import {
  openPrivateRuntimeFile,
  privateRuntime,
  publishServer,
  readServer,
  removeServer,
} from "./private-runtime.ts";
import { createTestFolder } from "./tools/create-test-folder.ts";

const parent = createTestFolder("private-runtime");
let nextCase = 0;
const connection = createTestConnection();

function directory(): string {
  return join(parent, String(nextCase++));
}

test("a private token file round trips and orderly shutdown removes only its own instance", () => {
  const folder = directory();
  const closeFirst = publishServer(folder, connection);
  expect(readServer(folder)).toEqual(connection);
  const closeSecond = publishServer(folder, { ...connection, serverId: "server-two" });
  closeFirst();
  expect(readServer(folder)?.serverId).toBe("server-two");
  closeSecond();
  expect(readServer(folder)).toBeUndefined();
});

test("stale cleanup checks the exact server identity", () => {
  const folder = directory();
  publishServer(folder, connection);
  removeServer(folder, "other-server");
  expect(readServer(folder)?.serverId).toBe(connection.serverId);
  removeServer(folder, connection.serverId);
  expect(readServer(folder)).toBeUndefined();
});

test("malformed oversized and non-loopback records fail without exposing their content", () => {
  const folder = directory();
  publishServer(folder, connection);
  const path = join(folder, "runtime", "server.json");
  for (const content of [
    "not JSON",
    "x".repeat(8193),
    JSON.stringify({ ...connection, url: "http://outside.invalid" }),
    JSON.stringify({ ...connection, version: 2 }),
  ]) {
    writeFileSync(path, content);
    expect(() => readServer(folder)).toThrow("The private server record cannot be read securely.");
  }
});

test("linked directories and multiply linked token files refuse discovery", () => {
  const folder = directory();
  const target = privateRuntime(directory());
  mkdirSync(folder);
  symlinkSync(target, join(folder, "runtime"), "junction");
  expect(() => readServer(folder)).toThrow("securely");
  const second = directory();
  publishServer(second, connection);
  linkSync(join(second, "runtime", "server.json"), join(second, "runtime", "second-link.json"));
  expect(() => readServer(second)).toThrow("securely");
});

test.skipIf(process.platform === "win32")(
  "unix discovery rejects broad permissions and another owner",
  () => {
    const folder = directory();
    publishServer(folder, connection);
    const path = join(folder, "runtime", "server.json");
    chmodSync(path, 0o644);
    expect(() => readServer(folder)).toThrow("securely");
    chmodSync(path, 0o600);
    chmodSync(join(folder, "runtime"), 0o755);
    expect(() => readServer(folder)).toThrow("securely");
    chmodSync(join(folder, "runtime"), 0o700);
    const owner = process.getuid?.() ?? 0;
    const getuid = vi.spyOn(process, "getuid").mockReturnValue(owner + 1);
    try {
      expect(() => readServer(folder)).toThrow("securely");
    } finally {
      getuid.mockRestore();
    }
  },
);

test.skipIf(process.platform !== "win32")(
  "windows creates private runtime permissions under inherited broad access",
  () => {
    const ancestor = directory();
    mkdirSync(ancestor);
    const permissions = windowsPermissions();
    permissions.set(ancestor, "D:P(A;OICI;FA;;;WD)(A;OICI;FA;;;BA)(A;OICI;FA;;;SY)");
    const folder = join(ancestor, "home");
    mkdirSync(folder);
    expect(permissions.read(folder)).toContain("(A;OICIID;FA;;;WD)");
    publishServer(folder, connection);
    expect(readServer(folder)).toEqual(connection);
    const runtime = join(folder, "runtime");
    for (const path of [runtime, join(runtime, "server.json")]) {
      expect(permissions.read(path)).toMatch(
        /^O:[^:]+D:P(?:AI)?\(A;(?:OICI)?;FA;;;(?:S-[\d-]+|LA|LG)\)$/,
      );
    }
    expect(permissions.read(folder)).toContain("(A;OICIID;FA;;;WD)");
  },
);

test.skipIf(process.platform !== "win32")(
  "windows rejects an existing broad runtime directory without changing its permissions",
  () => {
    const folder = directory();
    const runtime = privateRuntime(folder);
    const permissions = windowsPermissions();
    permissions.set(runtime, "D:P(A;OICI;FA;;;WD)");
    const before = permissions.read(runtime);
    expect(() => privateRuntime(folder)).toThrow(
      "The runtime permissions must grant access only to the current account",
    );
    expect(permissions.read(runtime)).toBe(before);
  },
);

test.skipIf(process.platform !== "win32").each(["WD", "BA", "SY"])(
  "windows discovery rejects an extra grant to %s",
  (identity) => {
    const folder = directory();
    publishServer(folder, connection);
    const path = join(folder, "runtime", "server.json");
    const permissions = windowsPermissions();
    const accountGrant = permissions.read(path).match(/\(A;;FA;;;[^)]+\)/)?.[0];
    expect(accountGrant).toBeDefined();
    permissions.set(path, `D:P${accountGrant}(A;;FA;;;${identity})`);
    expect(() => readServer(folder)).toThrow("securely");
    expect(() => readServer(folder)).toThrow(
      identity === "BA" ? "S-1-5-32-544" : identity === "SY" ? "S-1-5-18" : "S-1-1-0",
    );
    expect(readFileSync(path, "utf8")).toContain('"version":1');
  },
);

test.skipIf(process.platform !== "win32")(
  "windows reports every rejected entry with its sid name mask and inheritance",
  () => {
    const folder = directory();
    const runtime = privateRuntime(folder);
    const permissions = windowsPermissions();
    const before = permissions.read(runtime);
    permissions.set(
      runtime,
      "D:P(D;OICI;0x2;;;SY)(A;OICI;FA;;;BA)(A;OICIID;FR;;;WD)(A;OICI;0x10;;;S-1-5-32-9999)",
    );
    try {
      let message = "";
      try {
        privateRuntime(folder);
      } catch (error) {
        message = error instanceof Error ? error.message : String(error);
      }
      expect(message).toMatch(
        /Entry \d+ denies S-1-5-18 \([^)]+\), access mask 0x00000002, inherited no, flags OICI\./,
      );
      expect(message).toMatch(
        /Entry \d+ allows S-1-5-32-544 \([^)]+\), access mask 0x001f01ff, inherited no, flags OICI\./,
      );
      expect(message).toMatch(
        /Entry \d+ allows S-1-1-0 \([^)]+\), access mask 0x00120089, inherited yes, flags OICIID\./,
      );
      expect(message).toContain(
        "allows S-1-5-32-9999, access mask 0x00000010, inherited no, flags OICI.",
      );
    } finally {
      permissions.set(runtime, before);
    }
  },
);

test.skipIf(process.platform !== "win32")(
  "windows failures identify calls and codes through file creation and headless startup",
  async () => {
    const folder = directory();
    mkdirSync(folder);
    const permissions = windowsPermissions();
    const before = permissions.read(folder);
    permissions.set(folder, "D:P(D;OIIO;WD;;;OW)(A;OICI;FA;;;WD)");
    const path = join(folder, "unwritten.json");
    try {
      expect(() => openPrivateRuntimeFile(path)).toThrow(
        "The Windows call SetNamedSecurityInfoW failed (Windows error 5).",
      );
      expect(existsSync(path)).toBe(false);
      permissions.set(folder, "D:P(D;;0x4;;;WD)(A;;FA;;;WD)");
      const failure = "The Windows call CreateDirectoryW failed (Windows error 5).";
      expect(() => privateRuntime(folder)).toThrow(failure);
      const request = vi.fn<typeof fetch>();
      const launch = vi.fn();
      await expect(
        connectHeadless({
          directory: folder,
          folder,
          start: "auto",
          request,
          launch,
          signal: new AbortController().signal,
        }),
      ).rejects.toMatchObject({
        message: `The private runtime directory cannot be secured. ${failure}`,
        code: "privateRecordDenied",
        exitCode: 4,
      });
      expect(request).not.toHaveBeenCalled();
      expect(launch).not.toHaveBeenCalled();
    } finally {
      permissions.set(folder, before);
    }
  },
);

function windowsPermissions(): {
  set(path: string, value: string): void;
  read(path: string): string;
} {
  const koffi = createRequire(import.meta.url)("koffi") as typeof import("koffi");
  const security = koffi.load("advapi32.dll");
  const kernel = koffi.load("kernel32.dll");
  const parse = security.func(
    "bool __stdcall ConvertStringSecurityDescriptorToSecurityDescriptorW(const char16_t* text, uint32_t revision, _Out_ void** descriptor, void* length)",
  );
  const setSecurity = security.func(
    "bool __stdcall SetFileSecurityW(const char16_t* path, uint32_t information, void* descriptor)",
  );
  const readSecurity = security.func(
    "uint32_t __stdcall GetNamedSecurityInfoW(const char16_t* path, int objectType, uint32_t information, void* owner, void* group, void* access, void* audit, _Out_ void** descriptor)",
  );
  const stringify = security.func(
    "bool __stdcall ConvertSecurityDescriptorToStringSecurityDescriptorW(void* descriptor, uint32_t revision, uint32_t information, _Out_ void** text, void* length)",
  );
  const free = kernel.func("void* __stdcall LocalFree(void* memory)");
  return {
    set(path, value) {
      const descriptor: unknown[] = [null];
      expect(parse(value, 1, descriptor, null)).toBe(true);
      try {
        expect(setSecurity(path, 0x80000004, descriptor[0])).toBe(true);
      } finally {
        free(descriptor[0]);
      }
    },
    read(path) {
      const descriptor: unknown[] = [null];
      const text: unknown[] = [null];
      expect(readSecurity(path, 1, 5, null, null, null, null, descriptor)).toBe(0);
      try {
        expect(stringify(descriptor[0], 1, 5, text, null)).toBe(true);
        return String(koffi.decode(text[0], "char16_t", -1));
      } finally {
        free(text[0]);
        free(descriptor[0]);
      }
    },
  };
}
