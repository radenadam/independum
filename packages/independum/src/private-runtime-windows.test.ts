import { mkdirSync } from "node:fs";
import { createRequire } from "node:module";
import { join } from "node:path";
import { expect, test, vi } from "vitest";
import { createTestConnection } from "./create-test-connection.ts";
import { createTestFolder } from "./tools/create-test-folder.ts";

vi.mock("node:module", { spy: true });

const folder = createTestFolder("private-runtime-windows");

test("windows verifies elevated token ownership without granting access to its owner group", async () => {
  const identity = "S-1-5-21-123-456-789-500";
  const defaultOwner = "S-1-5-32-544";
  const runtime = join(folder, "runtime");
  const values = new Map<unknown, string>();
  let owner = "BA";
  let extraGrant = "";
  const native = {
    getCurrentProcess: vi.fn(),
    getLastError: vi.fn(() => 122),
    closeHandle: vi.fn(),
    localFree: vi.fn(),
    openProcessToken: vi.fn((_process: unknown, _access: number, token: unknown[]) => {
      token[0] = "token";
      return true;
    }),
    getTokenInformation: vi.fn(
      (
        _token: unknown,
        informationClass: number,
        information: unknown,
        _length: number,
        required: number[],
      ) => {
        required[0] = 8;
        if (information === null) {
          return false;
        }
        values.set(information, informationClass === 1 ? identity : defaultOwner);
        return true;
      },
    ),
    convertSidToStringSidW: vi.fn((sid: unknown, text: unknown[]) => {
      text[0] = sid;
      return true;
    }),
    convertStringSidToSidW: vi.fn((text: string, sid: unknown[]) => {
      sid[0] =
        new Map([
          ["LA", identity],
          ["BA", defaultOwner],
          ["SY", "S-1-5-18"],
          ["WD", "S-1-1-0"],
        ]).get(text) ?? text;
      return true;
    }),
    lookupAccountSidW: vi.fn(
      (
        _system: unknown,
        sid: string,
        name: Buffer | null,
        nameLength: number[],
        domain: Buffer | null,
        domainLength: number[],
      ) => {
        const account = (
          {
            [defaultOwner]: ["BUILTIN", "Administrators"],
            "S-1-5-18": ["NT AUTHORITY", "SYSTEM"],
            "S-1-1-0": ["", "Everyone"],
            [identity]: ["LOCAL", "Administrator"],
          } as Record<string, [string, string]>
        )[sid];
        if (account === undefined) {
          return false;
        }
        nameLength[0] = account[1].length + 1;
        domainLength[0] = account[0].length + 1;
        if (name === null || domain === null) {
          return false;
        }
        name.write(`${account[1]}\0`, "utf16le");
        domain.write(`${account[0]}\0`, "utf16le");
        return true;
      },
    ),
    convertStringSecurityDescriptorToSecurityDescriptorW: vi.fn(
      (text: string, _revision: number, descriptor: unknown[]) => {
        descriptor[0] = text;
        return true;
      },
    ),
    getFileSecurityW: vi.fn(
      (
        path: string,
        _information: number,
        descriptor: unknown,
        _length: number,
        required: number[],
      ) => {
        required[0] = 8;
        values.set(
          descriptor,
          `O:${owner}D:P(A;${path === runtime ? "OICI" : ""};FA;;;LA)${extraGrant}`,
        );
        return descriptor !== null;
      },
    ),
    getSecurityDescriptorOwner: vi.fn((descriptor: unknown, result: unknown[]) => {
      const value = values.get(descriptor) ?? String(descriptor);
      const descriptorOwner = value.slice(2, value.indexOf("D:"));
      result[0] = descriptorOwner === "BA" ? defaultOwner : descriptorOwner;
      return true;
    }),
    getSecurityDescriptorDacl: vi.fn(
      (descriptor: unknown, isPresent: number[], access: unknown[]) => {
        const value = values.get(descriptor) ?? String(descriptor);
        isPresent[0] = 1;
        access[0] = value.slice(value.indexOf("D:"));
        return true;
      },
    ),
    getAce: vi.fn((access: string, index: number, entry: unknown[]) => {
      entry[0] = [...access.matchAll(/\(([^)]+)\)/g)][index]?.[1];
      return true;
    }),
    setNamedSecurityInfoW: vi.fn(() => 0),
    createDirectoryW: vi.fn((path: string) => {
      mkdirSync(path);
      return true;
    }),
    convertSecurityDescriptorToStringSecurityDescriptorW: vi.fn(
      (descriptor: unknown, _revision: number, _information: number, text: unknown[]) => {
        text[0] = values.get(descriptor);
        return true;
      },
    ),
  };
  const library = {
    func(signature: string) {
      const name = signature
        .match(/\b(\w+)\(/)?.[1]
        ?.replace(/^./, (letter) => letter.toLowerCase()) as keyof typeof native;
      return native[name];
    },
  };
  vi.mocked(createRequire).mockReturnValueOnce((() => ({
    load() {
      return library;
    },
    struct: vi.fn(),
    sizeof: vi.fn(() => 24),
    encode: vi.fn(),
    decode(pointer: unknown, offset: unknown) {
      if (offset === 4) {
        const mask = String(pointer).split(";")[2];
        return mask === "FA" ? 0x1f01ff : Number(mask);
      }
      if (Buffer.isBuffer(pointer) && offset === "char16_t") {
        return pointer.toString("utf16le").replace(/\0.*$/, "");
      }
      return values.get(pointer) ?? pointer;
    },
  })) as unknown as NodeRequire);
  const { openPrivateRuntimeFile, privateRuntime, publishServer, readServer } = await import(
    "./private-runtime.ts"
  );
  vi.stubGlobal("process", { ...process, platform: "win32" });
  try {
    const connection = createTestConnection();
    const close = publishServer(folder, connection);
    expect(readServer(folder)).toEqual(connection);
    expect(native.getTokenInformation.mock.calls.map((call) => call[1])).toEqual([1, 1, 4, 4]);
    expect(native.setNamedSecurityInfoW).toHaveBeenCalledWith(
      runtime,
      1,
      0x80000005,
      defaultOwner,
      null,
      `D:P(A;OICI;FA;;;${identity})`,
      null,
    );
    expect(native.setNamedSecurityInfoW).toHaveBeenCalledWith(
      expect.any(String),
      1,
      0x80000005,
      defaultOwner,
      null,
      `D:P(A;;FA;;;${identity})`,
      null,
    );
    owner = identity;
    expect(readServer(folder)).toEqual(connection);
    owner = "S-1-5-21-123-456-789-1002";
    expect(() => readServer(folder)).toThrow("securely");
    owner = "BA";
    for (const [group, account] of [
      ["WD", "S-1-1-0 (Everyone)"],
      ["BA", "S-1-5-32-544 (BUILTIN\\Administrators)"],
      ["SY", "S-1-5-18 (NT AUTHORITY\\SYSTEM)"],
    ]) {
      extraGrant = `(A;;FA;;;${group})`;
      expect(() => readServer(folder)).toThrow(
        `allows ${account}, access mask 0x001f01ff, inherited no, flags none.`,
      );
    }
    extraGrant = "(D;ID;0x12;;;BA)(A;;0x10;;;S-1-5-32-9999)";
    expect(() => readServer(folder)).toThrow(
      "Entry 2 denies S-1-5-32-544 (BUILTIN\\Administrators), access mask 0x00000012, inherited yes, flags ID.",
    );
    expect(() => readServer(folder)).toThrow(
      "Entry 3 allows S-1-5-32-9999, access mask 0x00000010, inherited no, flags none.",
    );
    extraGrant = "";
    close();
    expect(readServer(folder)).toBeUndefined();
    native.setNamedSecurityInfoW.mockReturnValueOnce(5);
    native.getLastError.mockReturnValue(999);
    expect(() => openPrivateRuntimeFile(join(runtime, "unwritten.json"))).toThrow(
      "The Windows call SetNamedSecurityInfoW failed (Windows error 5).",
    );
    native.createDirectoryW.mockReturnValueOnce(false);
    expect(() => privateRuntime(join(folder, "denied"))).toThrow(
      "The Windows call CreateDirectoryW failed (Windows error 999).",
    );
  } finally {
    vi.unstubAllGlobals();
    vi.restoreAllMocks();
  }
});
