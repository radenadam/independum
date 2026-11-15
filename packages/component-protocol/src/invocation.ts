import type { JsonValue, RequestFrame } from "./schemas.ts";

interface Undispatched {
  dispatch: "absent";
  effects: "absent";
}
interface Attempted {
  dispatch: "uncertain";
  effects: "uncertain";
}
interface Dispatched {
  dispatch: "known";
  effects: "uncertain" | "known";
}
type Delivery = Undispatched | Attempted | Dispatched;
type Terminal =
  | { phase: "settled"; delivery: Dispatched; output: JsonValue }
  | { phase: "cancelled"; delivery: Delivery; error: Error; cancellationDeadline?: number }
  | { phase: "failed" | "interrupted"; delivery: Delivery; error: Error };
type InvocationState =
  | { phase: "prepared"; delivery: Undispatched }
  | { phase: "dispatch-attempted"; delivery: Attempted }
  | { phase: "dispatched"; delivery: Dispatched }
  | { phase: "cancelling"; delivery: Delivery; cancellationDeadline?: number }
  | Terminal;
type InvocationEvent =
  | { type: "send-attempted" | "sent" }
  | { type: "received"; sequence: number; effects?: "known" | "absent" | "uncertain" | undefined }
  | { type: "sent-frame"; sequence: number }
  | { type: "cancel" | "deadline"; deadline?: number }
  | { type: "completed"; output: JsonValue }
  | { type: "failed" | "send-failed" | "interrupted"; error: Error };

/** Owns legal invocation transitions, delivery facts, revocation, and single settlement. */
export class Invocation {
  readonly request: RequestFrame;
  readonly controller: AbortController = new AbortController();
  readonly caller: { resolve(value: JsonValue): void; reject(error: Error): void } | undefined;
  readonly cancellationFailure: () => Error;
  #sentSequence: number;
  #receivedSequence: number;
  timer?: ReturnType<typeof setTimeout>;
  cancellationTimer?: ReturnType<typeof setTimeout>;
  #state: InvocationState;

  constructor(
    request: RequestFrame,
    cancellationFailure: () => Error,
    caller?: { resolve(value: JsonValue): void; reject(error: Error): void },
  ) {
    this.request = request;
    this.caller = caller;
    this.cancellationFailure = cancellationFailure;
    this.#sentSequence = caller === undefined ? 0 : 1;
    this.#receivedSequence = caller === undefined ? 1 : 0;
    this.#state =
      caller === undefined
        ? { phase: "dispatched", delivery: { dispatch: "known", effects: "uncertain" } }
        : { phase: "prepared", delivery: { dispatch: "absent", effects: "absent" } };
  }

  get isSettled(): boolean {
    return "output" in this.#state || "error" in this.#state;
  }

  get delivery(): Delivery {
    return { ...this.#state.delivery };
  }

  get isCancelled(): boolean {
    return this.#state.phase === "cancelling" || this.#state.phase === "cancelled";
  }

  get cancellationDeadline(): number | undefined {
    return "cancellationDeadline" in this.#state ? this.#state.cancellationDeadline : undefined;
  }

  get sentSequence(): number {
    return this.#sentSequence;
  }

  get receivedSequence(): number {
    return this.#receivedSequence;
  }

  dispatch(send: () => void): void {
    if (this.isSettled) {
      return;
    }
    if (this.#state.phase === "cancelling") {
      throw this.cancellationFailure();
    }
    if (this.#state.phase !== "prepared") {
      throw new Error("Only a prepared invocation can attempt dispatch.");
    }
    this.transition({ type: "send-attempted" });
    send();
    this.transition({ type: "sent" });
  }

  transition(event: InvocationEvent): void {
    if (event.type === "sent-frame") {
      this.#sentSequence = event.sequence;
      return;
    }
    const state = this.#state;
    if ("output" in state || "error" in state) {
      return;
    }
    switch (event.type) {
      case "send-attempted":
        if (state.phase === "prepared") {
          this.#state = {
            phase: "dispatch-attempted",
            delivery: { dispatch: "uncertain", effects: "uncertain" },
          };
        }
        return;
      case "sent":
      case "received":
        if (event.type === "received") {
          this.#receivedSequence = event.sequence;
        }
        // A correlated reply is evidence of delivery even during a reentrant send.
        if (state.phase === "dispatch-attempted") {
          this.#state = {
            phase: "dispatched",
            delivery: { dispatch: "known", effects: "uncertain" },
          };
        } else if (state.phase === "cancelling" && state.delivery.dispatch === "uncertain") {
          this.#state = {
            ...state,
            phase: "cancelling",
            delivery: { dispatch: "known", effects: "uncertain" },
          };
        }
        if (
          this.#state.phase === "dispatched" &&
          event.type === "received" &&
          event.effects === "known"
        ) {
          this.#state = { phase: "dispatched", delivery: { dispatch: "known", effects: "known" } };
        }
        return;
      case "cancel":
      case "deadline": {
        const cancellationDeadline =
          event.deadline === undefined
            ? this.cancellationDeadline
            : Math.min(event.deadline, this.cancellationDeadline ?? event.deadline);
        this.#state = {
          phase: "cancelling",
          delivery: state.delivery,
          ...(cancellationDeadline === undefined ? {} : { cancellationDeadline }),
        };
        clearTimeout(this.timer);
        this.controller.abort();
        return;
      }
      case "completed":
        // Revoked work can settle only through a cancellation failure.
        if (state.phase === "cancelling") {
          this.transition({ type: "failed", error: this.cancellationFailure() });
          return;
        }
        if (state.phase !== "dispatched") {
          return;
        }
        this.#state = { phase: "settled", delivery: state.delivery, output: event.output };
        clearTimeout(this.timer);
        this.caller?.resolve(event.output);
        return;
      case "failed":
      case "send-failed":
      case "interrupted":
        this.#state = {
          phase:
            event.type === "interrupted"
              ? "interrupted"
              : state.phase === "cancelling"
                ? "cancelled"
                : "failed",
          delivery: state.delivery,
          error: event.error,
          ...(state.phase === "cancelling" && state.cancellationDeadline !== undefined
            ? { cancellationDeadline: state.cancellationDeadline }
            : {}),
        };
        clearTimeout(this.timer);
        this.controller.abort(event.error);
        this.caller?.reject(event.error);
    }
  }
}
