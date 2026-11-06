import { chmodSync, linkSync, mkdirSync, readFileSync, symlinkSync, writeFileSync } from "node:fs";
import { createRequire } from "node:module";
import { join } from "node:path";
import { expect, test, vi } from "vitest";
import { createTestConnection } from "./create-test-connection.ts";
import { privateRuntime, publishServer, readServer, removeServer } from "./private-runtime.ts";
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
      expect(permissions.read(path)).toMatch(/^O:(S-[\d-]+)D:P(?:AI)?\(A;(?:OICI)?;FA;;;\1\)$/);
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
      "The runtime permissions must grant access only to the current account.",
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
    expect(readFileSync(path, "utf8")).toContain('"version":1');
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
