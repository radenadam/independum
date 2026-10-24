import { expect, test } from "vitest";
import { createServer } from "./create-server.ts";

const server = createServer({ token: "test-token", addresses: ["127.0.0.1:4870"] });
const healthUrl = "http://127.0.0.1:4870/api/health";
const withToken = { authorization: "Bearer test-token" };

async function statusOf(url: string, headers: Record<string, string>): Promise<number> {
  const response = await server.request(url, { headers });
  return response.status;
}

test("health route reports ok to a request with the token", async () => {
  const response = await server.request(healthUrl, { headers: withToken });
  expect(response.status).toBe(200);
  expect(await response.json()).toEqual({ status: "ok" });
});

test("api rejects a request without the token", async () => {
  expect(await statusOf(healthUrl, {})).toBe(401);
});

test("api rejects a request with a wrong token", async () => {
  expect(await statusOf(healthUrl, { authorization: "Bearer wrong-token" })).toBe(401);
});

test("api rejects a request addressed to another host", async () => {
  expect(await statusOf("http://attacker.example:4870/api/health", withToken)).toBe(403);
});

test("api rejects a request from another origin", async () => {
  expect(await statusOf(healthUrl, { ...withToken, origin: "https://attacker.example" })).toBe(403);
});

test("api accepts a request from its own origin", async () => {
  expect(await statusOf(healthUrl, { ...withToken, origin: "http://127.0.0.1:4870" })).toBe(200);
});
