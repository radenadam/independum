import { randomUUID } from "node:crypto";
import type { ModelRuntime } from "@earendil-works/pi-coding-agent";

type LoginInteraction = Parameters<ModelRuntime["login"]>[2];
type PiPrompt = Parameters<LoginInteraction["prompt"]>[0];
type PiNotice = Parameters<LoginInteraction["notify"]>[0];

/** A sign-in method that a provider offers. */
export type LoginMethod = "apiKey" | "account";

/** An option of a choice question. */
interface ChoiceOption {
  id: string;
  label: string;
  description?: string;
}

/** One step of a login, as the UI receives it. */
export type LoginEvent =
  | {
      type: "question";
      questionId: string;
      kind: "text" | "secret" | "choice" | "code";
      message: string;
      placeholder?: string;
      options?: ChoiceOption[];
    }
  | { type: "questionClosed"; questionId: string }
  | { type: "link"; url: string; instructions?: string }
  | { type: "deviceCode"; code: string; url: string }
  | { type: "note"; message: string }
  | { type: "done" }
  | { type: "failed"; message: string };

/** A login in progress, which records its events and waits for answers from the UI. */
export interface LoginSession {
  readonly events: LoginEvent[];
  subscribe(listener: (event: LoginEvent) => void): () => void;
  answer(questionId: string, value: string): boolean;
  cancel(): void;
}

/** A question waiting for the UI, with the callbacks that settle it. */
interface PendingQuestion {
  resolve(value: string): void;
  reject(error: Error): void;
}

/** Starts a Pi login for one provider and method, and returns the session that tracks it. */
export function startLoginSession(
  models: ModelRuntime,
  providerId: string,
  method: LoginMethod,
): LoginSession {
  const events: LoginEvent[] = [];
  const listeners = new Set<(event: LoginEvent) => void>();
  const pending = new Map<string, PendingQuestion>();
  const controller = new AbortController();

  function emit(event: LoginEvent): void {
    events.push(event);
    for (const listener of listeners) {
      listener(event);
    }
  }

  function ask(prompt: PiPrompt): Promise<string> {
    const questionId = randomUUID();
    return new Promise((resolve, reject) => {
      pending.set(questionId, { resolve, reject });
      // Pi withdraws a question when another path finishes the step, such as a browser callback.
      prompt.signal?.addEventListener(
        "abort",
        () => {
          pending.delete(questionId);
          emit({ type: "questionClosed", questionId });
          reject(new Error("The question is no longer needed."));
        },
        { once: true },
      );
      emit(questionFor(questionId, prompt));
    });
  }

  models
    .login(providerId, method === "apiKey" ? "api_key" : "oauth", {
      signal: controller.signal,
      prompt: ask,
      notify: (notice) => emit(eventFor(notice)),
    })
    .then(
      () => emit({ type: "done" }),
      (error: unknown) =>
        emit({
          type: "failed",
          message: controller.signal.aborted ? "The login was cancelled." : messageOf(error),
        }),
    );

  return {
    events,
    subscribe(listener) {
      listeners.add(listener);
      return () => listeners.delete(listener);
    },
    answer(questionId, value) {
      const question = pending.get(questionId);
      if (question === undefined) {
        return false;
      }
      pending.delete(questionId);
      question.resolve(value);
      return true;
    },
    cancel() {
      controller.abort();
      for (const question of pending.values()) {
        question.reject(new Error("The login was cancelled."));
      }
      pending.clear();
    },
  };
}

function questionFor(questionId: string, prompt: PiPrompt): LoginEvent {
  const placeholder =
    "placeholder" in prompt && prompt.placeholder ? { placeholder: prompt.placeholder } : {};
  switch (prompt.type) {
    case "select":
      return {
        type: "question",
        questionId,
        kind: "choice",
        message: prompt.message,
        options: prompt.options.map((option) => ({
          id: option.id,
          label: option.label,
          ...(option.description ? { description: option.description } : {}),
        })),
      };
    case "manual_code":
      return {
        type: "question",
        questionId,
        kind: "code",
        message: prompt.message,
        ...placeholder,
      };
    case "secret":
      return {
        type: "question",
        questionId,
        kind: "secret",
        message: prompt.message,
        ...placeholder,
      };
    default:
      return {
        type: "question",
        questionId,
        kind: "text",
        message: prompt.message,
        ...placeholder,
      };
  }
}

function eventFor(notice: PiNotice): LoginEvent {
  switch (notice.type) {
    case "auth_url":
      return {
        type: "link",
        url: notice.url,
        ...(notice.instructions ? { instructions: notice.instructions } : {}),
      };
    case "device_code":
      return { type: "deviceCode", code: notice.userCode, url: notice.verificationUri };
    default:
      return { type: "note", message: notice.message };
  }
}

function messageOf(error: unknown): string {
  return error instanceof Error ? error.message : "The login failed.";
}
