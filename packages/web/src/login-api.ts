import type { LoginEvent, LoginMethod, ProviderSummary } from "independum/api-types";
import { readEvents } from "./read-events.ts";
import { requestApi } from "./request-api.ts";

/** A running login, which the UI can answer or cancel. */
export interface LoginHandle {
  answer(questionId: string, value: string): Promise<void>;
  cancel(): Promise<void>;
}

/** Returns every provider with its sign-in methods and its current login. */
export async function fetchProviders(): Promise<ProviderSummary[]> {
  const response = await requestApi("/api/providers");
  if (!response.ok) {
    throw new Error("The provider list could not be loaded.");
  }
  const { providers } = (await response.json()) as { providers: ProviderSummary[] };
  return providers;
}

/** Starts a login and calls back with each of its steps until it ends. */
export async function startLogin(
  providerId: string,
  method: LoginMethod,
  onEvent: (event: LoginEvent) => void,
): Promise<LoginHandle> {
  const started = await requestApi("/api/logins", { body: { providerId, method } });
  if (!started.ok) {
    throw new Error("The login could not start.");
  }
  const { id } = (await started.json()) as { id: string };
  // The stream is read with fetch, because EventSource cannot send the access token header.
  const stream = await requestApi(`/api/logins/${id}/events`);
  readEvents(stream, onEvent).catch(() =>
    onEvent({ type: "failed", message: "The connection to Independum was lost." }),
  );
  return {
    async answer(questionId, value) {
      await requestApi(`/api/logins/${id}/answers`, { body: { questionId, value } });
    },
    async cancel() {
      await requestApi(`/api/logins/${id}`, { method: "DELETE" });
    },
  };
}

/** Removes the saved login of a provider. */
export async function removeLogin(providerId: string): Promise<void> {
  await requestApi(`/api/providers/${providerId}/login`, { method: "DELETE" });
}
