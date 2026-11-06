import { readAccessToken } from "./read-access-token.ts";

/** How to send an API request, when it is more than a plain read. */
interface RequestOptions {
  file?: File;
  method?: string;
  body?: unknown;
  bodyText?: string;
  signal?: AbortSignal;
  revision?: string;
}

/** Sends a request to the Independum API with the access token attached. */
export function requestApi(path: string, options: RequestOptions = {}): Promise<Response> {
  const headers: Record<string, string> = { authorization: `Bearer ${readAccessToken() ?? ""}` };
  const signal = options.signal === undefined ? {} : { signal: options.signal };
  if (options.revision !== undefined) {
    headers[options.revision === "*" ? "If-None-Match" : "If-Match"] = options.revision;
  }
  if (options.file !== undefined) {
    headers["content-type"] = options.file.type || "application/octet-stream";
    return fetch(path, { method: "POST", headers, body: options.file, ...signal });
  }
  if (options.body === undefined && options.bodyText === undefined) {
    return fetch(path, { method: options.method ?? "GET", headers, ...signal });
  }
  headers["content-type"] = "application/json";
  return fetch(path, {
    method: options.method ?? "POST",
    headers,
    body: options.bodyText ?? JSON.stringify(options.body),
    ...signal,
  });
}
