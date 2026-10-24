import { randomUUID } from "node:crypto";
import type { ModelRuntime } from "@earendil-works/pi-coding-agent";
import { Hono } from "hono";
import { streamSSE } from "hono/streaming";
import type { LoginEvent, LoginMethod, ProviderSummary } from "./api-types.ts";
import { type LoginSession, startLoginSession } from "./login-session.ts";

const loginMethods: LoginMethod[] = ["apiKey", "account"];

// Finished sessions stay for a while, because a fast login can end before the UI starts reading.
const finishedSessionLifetime = 5 * 60 * 1000;

/** Creates the routes that list providers and start, follow, answer, cancel, and remove logins. */
export function createLoginRoutes(models: ModelRuntime): Hono {
  const sessions = new Map<string, LoginSession>();
  const routes = new Hono();

  routes.get("/providers", async (context) => {
    const providers = await Promise.all(
      models.getProviders().map(async (provider): Promise<ProviderSummary> => {
        const check = await models.checkAuth(provider.id);
        const { apiKey, oauth } = provider.auth;
        return {
          id: provider.id,
          name: provider.name,
          apiKey: apiKey ? { label: apiKey.name, canLogIn: apiKey.login !== undefined } : null,
          account: oauth
            ? {
                label: oauth.name,
                buttonLabel: oauth.loginLabel ?? null,
                isSubscription: oauth.isSubscription === true,
              }
            : null,
          login: check
            ? {
                method: check.type === "api_key" ? "apiKey" : "account",
                source: check.source ?? null,
              }
            : null,
        };
      }),
    );
    return context.json({ providers });
  });

  routes.delete("/providers/:providerId/login", async (context) => {
    await models.logout(context.req.param("providerId"));
    return context.body(null, 204);
  });

  routes.post("/logins", async (context) => {
    const body: { providerId?: unknown; method?: unknown } = await context.req
      .json()
      .catch(() => ({}));
    const provider =
      typeof body.providerId === "string" ? models.getProvider(body.providerId) : undefined;
    const method = loginMethods.find((candidate) => candidate === body.method);
    const offered = method === "apiKey" ? provider?.auth.apiKey?.login : provider?.auth.oauth;
    if (provider === undefined || method === undefined || offered === undefined) {
      return context.json({ error: "That provider does not offer that sign-in method." }, 400);
    }
    const id = randomUUID();
    const session = startLoginSession(models, provider.id, method);
    sessions.set(id, session);
    session.subscribe((event) => {
      if (isFinal(event)) {
        setTimeout(() => sessions.delete(id), finishedSessionLifetime).unref();
      }
    });
    return context.json({ id }, 201);
  });

  routes.get("/logins/:id/events", (context) => {
    const session = sessions.get(context.req.param("id"));
    if (session === undefined) {
      return context.json({ error: "No login with that id." }, 404);
    }
    return streamSSE(context, async (stream) => {
      let writing = Promise.resolve();
      let unsubscribe: (() => void) | undefined;
      await new Promise<void>((resolve) => {
        function send(event: LoginEvent): void {
          writing = writing.then(() => stream.writeSSE({ data: JSON.stringify(event) }));
          if (isFinal(event)) {
            resolve();
          }
        }
        for (const event of session.events) {
          send(event);
        }
        unsubscribe = session.subscribe(send);
        stream.onAbort(resolve);
      });
      unsubscribe?.();
      await writing;
    });
  });

  routes.post("/logins/:id/answers", async (context) => {
    const session = sessions.get(context.req.param("id"));
    const body: { questionId?: unknown; value?: unknown } = await context.req
      .json()
      .catch(() => ({}));
    if (
      session === undefined ||
      typeof body.questionId !== "string" ||
      typeof body.value !== "string" ||
      !session.answer(body.questionId, body.value)
    ) {
      return context.json({ error: "No question with that id is waiting." }, 404);
    }
    return context.body(null, 204);
  });

  routes.delete("/logins/:id", (context) => {
    sessions.get(context.req.param("id"))?.cancel();
    return context.body(null, 204);
  });

  return routes;
}

function isFinal(event: LoginEvent): boolean {
  return event.type === "done" || event.type === "failed";
}
