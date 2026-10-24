import { readAccessToken } from "./access-token.ts";

/** Sends a request to the Independum API with the access token attached. */
export function requestApi(path: string): Promise<Response> {
  return fetch(path, { headers: { authorization: `Bearer ${readAccessToken() ?? ""}` } });
}
