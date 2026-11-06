import { networkInterfaces } from "node:os";
import { expect, test, vi } from "vitest";
import { phoneAddresses, readPhoneConnection } from "./phone-connection.ts";

vi.mock("node:os", () => ({ networkInterfaces: vi.fn() }));
const addresses = {
  private: [
    {
      address: "192.168.1.10",
      family: "IPv4",
      internal: false,
      mac: "00:00:00:00:00:00",
      netmask: "255.255.255.0",
      cidr: "192.168.1.10/24",
    },
  ],
  unique: [
    {
      address: "fd00::1234",
      family: "IPv6",
      internal: false,
      mac: "00:00:00:00:00:00",
      netmask: "ffff:ffff:ffff:ffff::",
      cidr: "fd00::1234/64",
      scopeid: 0,
    },
  ],
} satisfies ReturnType<typeof networkInterfaces>;
vi.mocked(networkInterfaces).mockReturnValue(addresses);

test("proxy access permits only a loopback backend and an exact private https origin", () => {
  const valid = {
    kind: "proxy",
    address: "127.0.0.1",
    port: 4871,
    origin: "https://phone.private",
  };
  expect(readPhoneConnection(valid)).toEqual(valid);
  for (const change of [
    { address: "0.0.0.0" },
    { address: "::" },
    { address: "192.168.1.1" },
    { port: 0 },
    { port: 65536 },
    { port: 1.5 },
    { kind: "http" },
    { extra: true },
    ...[
      "http://phone.private",
      "https://phone.private/",
      "https://phone.private/path",
      "https://phone.private?x=1",
      "https://user:secret@phone.private",
      "https://8.8.8.8",
      "https://127.0.0.1",
      "https://[::1]",
    ].map((origin) => ({ origin })),
  ]) {
    expect(() => readPhoneConnection({ ...valid, ...change })).toThrow();
  }
});

test("direct https binds only a selected current private address and uses its exact port", () => {
  const base = {
    kind: "certificate",
    address: "192.168.200.254",
    port: 4871,
    origin: "https://phone.private:4871",
    certificatePath: "certificate.pem",
    keyPath: "private.key",
  };
  for (const address of ["0.0.0.0", "::", "127.0.0.1", "8.8.8.8", "2001:4860:4860::8888"]) {
    expect(() => readPhoneConnection({ ...base, address })).toThrow("currently assigned");
  }
  for (const entry of phoneAddresses()) {
    expect(readPhoneConnection({ ...base, address: entry.address })).toMatchObject({
      address: entry.address,
    });
    expect(() =>
      readPhoneConnection({ ...base, address: entry.address, origin: "https://phone.private" }),
    ).toThrow("selected listening port");
    expect(() =>
      readPhoneConnection({ ...base, address: entry.address, keyPath: "invalid.txt" }),
    ).toThrow("key path");
  }
});

test("address discovery excludes public and loopback adapters and refuses a removed address", () => {
  const privateAddress = addresses.private[0];
  if (privateAddress === undefined) {
    throw new Error("The test needs a private address.");
  }
  vi.mocked(networkInterfaces).mockReturnValue({
    ...addresses,
    public: [{ ...privateAddress, address: "8.8.8.8", cidr: "8.8.8.8/32" }],
    loopback: [{ ...privateAddress, address: "127.0.0.1", internal: true, cidr: "127.0.0.1/8" }],
  });
  expect(phoneAddresses()).toEqual([
    { name: "private", address: "192.168.1.10" },
    { name: "unique", address: "fd00::1234" },
  ]);
  vi.mocked(networkInterfaces).mockReturnValue({});
  try {
    expect(() =>
      readPhoneConnection({
        kind: "certificate",
        address: "192.168.1.10",
        port: 4871,
        origin: "https://phone.private:4871",
        certificatePath: "certificate.pem",
        keyPath: "private.key",
      }),
    ).toThrow("currently assigned");
  } finally {
    vi.mocked(networkInterfaces).mockReturnValue(addresses);
  }
});
