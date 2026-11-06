import { mkdirSync } from "node:fs";
import { createRequire } from "node:module";
import { join } from "node:path";
import { expect, test, vi } from "vitest";
import { createTestConnection } from "./create-test-connection.ts";
import { createTestFolder } from "./tools/create-test-folder.ts";

vi.mock("node:module", { spy: true });

const folder = createTestFolder("private-runtime-windows");

test("windows verifies elevated token ownership without granting access to its owner group", async () => {
  const identity = "S-1-5-21-123-456-789-1001";
  const defaultOwner = "S-1-5-32-544";
  const runtime = join(folder, "runtime");
  const values = new Map<unknown, string>();
  let owner = "BA";
  let extraGrant = "";
  const native = {
    getCurrentProcess: vi.fn(),
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
          `O:${owner}D:P(A;${path === runtime ? "OICI" : ""};FA;;;${identity})${extraGrant}`,
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
      (descriptor: string, isPresent: number[], access: unknown[]) => {
        isPresent[0] = 1;
        access[0] = descriptor.slice(descriptor.indexOf("D:"));
        return true;
      },
    ),
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
    decode(pointer: unknown) {
      return values.get(pointer) ?? pointer;
    },
  })) as unknown as NodeRequire);
  const { publishServer, readServer } = await import("./private-runtime.ts");
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
    for (const group of ["WD", "BA", "SY"]) {
      extraGrant = `(A;;FA;;;${group})`;
      expect(() => readServer(folder)).toThrow("securely");
    }
    extraGrant = "";
    close();
    expect(readServer(folder)).toBeUndefined();
  } finally {
    vi.unstubAllGlobals();
    vi.restoreAllMocks();
  }
});
