import { readAccessToken } from "./access-token.ts";

/** How to send an API request, when it is more than a plain read. */
interface RequestOptions {
  method?: string;
  body?: unknown;
}

/** Sends a request to the Independum API with the access token attached. */
export function requestApi(path: string, options: RequestOptions = {}): Promise<Response> {
  const headers: Record<string, string> = { authorization: `Bearer ${readAccessToken() ?? ""}` };
  if (options.body === undefined) {
    return fetch(path, { method: options.method ?? "GET", headers });
  }
  headers["content-type"] = "application/json";
  return fetch(path, {
    method: options.method ?? "POST",
    headers,
    body: JSON.stringify(options.body),
  });
}
