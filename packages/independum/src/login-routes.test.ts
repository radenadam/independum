import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterAll, expect, test } from "vitest";
import type { LoginEvent, ProviderSummary } from "./api-types.ts";
import { createModelRuntime } from "./create-model-runtime.ts";
import { createLoginRoutes } from "./login-routes.ts";

const directory = mkdtempSync(join(tmpdir(), "independum-test-"));
afterAll(() => rmSync(directory, { recursive: true, force: true }));
const routes = createLoginRoutes(await createModelRuntime(directory));
const json = { "content-type": "application/json" };

async function findProvider(id: string): Promise<ProviderSummary | undefined> {
  const response = await routes.request("/providers");
  const { providers } = (await response.json()) as { providers: ProviderSummary[] };
  return providers.find((provider) => provider.id === id);
}

function startLogin(providerId: string, method: string): Promise<Response> {
  return Promise.resolve(
    routes.request("/logins", {
      method: "POST",
      headers: json,
      body: JSON.stringify({ providerId, method }),
    }),
  );
}

async function followLogin(
  providerId: string,
): Promise<{ id: string; next: () => Promise<LoginEvent> }> {
  const { id } = (await (await startLogin(providerId, "apiKey")).json()) as { id: string };
  const stream = await routes.request(`/logins/${id}/events`);
  if (stream.body === null) {
    throw new Error("The login sent no event stream.");
  }
  const reader = stream.body.getReader();
  const decoder = new TextDecoder();
  let buffer = "";
  async function next(): Promise<LoginEvent> {
    while (!buffer.includes("\n\n")) {
      const { value, done } = await reader.read();
      if (done) {
        throw new Error("The event stream ended early.");
      }
      buffer += decoder.decode(value, { stream: true });
    }
    const end = buffer.indexOf("\n\n");
    const data = buffer.slice(0, end).replace(/^data: ?/m, "");
    buffer = buffer.slice(end + 2);
    return JSON.parse(data) as LoginEvent;
  }
  return { id, next };
}

async function logInWithKey(providerId: string, key: string): Promise<LoginEvent[]> {
  const { id, next } = await followLogin(providerId);
  const question = await next();
  if (question.type !== "question") {
    throw new Error("The login did not ask a question first.");
  }
  await routes.request(`/logins/${id}/answers`, {
    method: "POST",
    headers: json,
    body: JSON.stringify({ questionId: question.questionId, value: key }),
  });
  return [question, await next()];
}

test("providers lists every pi provider with its sign-in methods", async () => {
  expect(await findProvider("anthropic")).toMatchObject({
    name: "Anthropic",
    apiKey: { label: "Anthropic API key", canLogIn: true },
    account: { isSubscription: true },
  });
});

test("an api key login asks for the key and saves it", async () => {
  const [question, last] = await logInWithKey("deepseek", "test-key");
  expect(question).toMatchObject({
    type: "question",
    kind: "secret",
    message: "Enter DeepSeek API key",
  });
  expect(last).toEqual({ type: "done" });
  expect((await findProvider("deepseek"))?.login).toEqual({
    method: "apiKey",
    source: "stored credential",
  });
});

test("logging out removes a saved login", async () => {
  await logInWithKey("deepseek", "test-key");
  const removed = await routes.request("/providers/deepseek/login", { method: "DELETE" });
  expect(removed.status).toBe(204);
  expect((await findProvider("deepseek"))?.login).toBeNull();
});

test("a login is refused for an unknown provider or a method the provider lacks", async () => {
  expect((await startLogin("no-such-provider", "apiKey")).status).toBe(400);
  expect((await startLogin("openai-codex", "apiKey")).status).toBe(400);
});

test("cancelling a login ends it with a clear message", async () => {
  const { id, next } = await followLogin("deepseek");
  expect((await next()).type).toBe("question");
  await routes.request(`/logins/${id}`, { method: "DELETE" });
  let event = await next();
  while (event.type !== "done" && event.type !== "failed") {
    event = await next();
  }
  expect(event).toEqual({ type: "failed", message: "The login was cancelled." });
});

test("answering a question that is not waiting fails", async () => {
  const response = await routes.request("/logins/no-such-login/answers", {
    method: "POST",
    headers: json,
    body: JSON.stringify({ questionId: "none", value: "x" }),
  });
  expect(response.status).toBe(404);
});
