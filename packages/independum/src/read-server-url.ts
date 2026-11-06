/** Reads a loopback HTTP origin without credentials, a path, or other URL components. */
export function readServerUrl(value: string, allowsLocalhost = false): string {
  const url = new URL(value);
  const hosts = allowsLocalhost ? ["127.0.0.1", "localhost"] : ["127.0.0.1"];
  if (
    url.protocol !== "http:" ||
    !hosts.includes(url.hostname) ||
    url.username !== "" ||
    url.password !== "" ||
    url.pathname !== "/" ||
    url.search !== "" ||
    url.hash !== ""
  ) {
    throw new Error("The server address must be a loopback HTTP origin.");
  }
  return url.origin;
}
