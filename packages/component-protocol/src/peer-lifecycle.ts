import type { Operation, Version } from "./schemas.ts";

export interface InitializationSelection {
  wireVersion: Version;
  manifestVersion: Version;
  contracts: Record<string, Version>;
  componentInstanceId: string;
  grantedCapabilities: string[];
}
type PeerState =
  | { phase: "uninitialized" | "disposed" }
  | { phase: "initializing"; invocation: object }
  | { phase: "ready"; selection: InitializationSelection }
  | { phase: "disposing"; invocation: object; selection: InitializationSelection }
  | { phase: "stopped"; evidence: "available" | "failed" };
type PeerEvent =
  | { type: "initialize" | "dispose"; invocation: object }
  | { type: "completed"; invocation: object; selection?: InitializationSelection }
  | { type: "failed"; invocation: object }
  | { type: "stop" | "evidence-failed" };

/** Reserves lifecycle transitions before reentrant services and commits claims before delivery. */
export class PeerLifecycle {
  #state: PeerState = { phase: "uninitialized" };

  get phase(): PeerState["phase"] {
    return this.#state.phase;
  }

  isStopped(): boolean {
    return this.#state.phase === "stopped";
  }

  get canRecord(): boolean {
    return this.#state.phase !== "stopped" || this.#state.evidence === "available";
  }

  get selection(): InitializationSelection | undefined {
    return "selection" in this.#state ? this.#state.selection : undefined;
  }

  assertAdmission(method: Operation, hasPendingWork: boolean): void {
    const state = this.#state;
    if (state.phase === "stopped") {
      throw new Error("The protocol peer is stopped.");
    }
    if (state.phase === "disposed" || state.phase === "disposing") {
      throw new Error("The instance cannot accept new work after disposal begins.");
    }
    if (method === "initialize") {
      if (state.phase !== "uninitialized") {
        throw new Error("Initialization is already pending or complete.");
      }
      return;
    }
    if (state.phase !== "ready") {
      throw new Error("Initialization must complete before other operations.");
    }
    if (method === "dispose") {
      if (hasPendingWork) {
        throw new Error("Disposal waits until owned invocations settle.");
      }
    }
  }

  admit(method: Operation, invocation: object, hasPendingWork: boolean): void {
    this.assertAdmission(method, hasPendingWork);
    if (method === "initialize" || method === "dispose") {
      this.transition({ type: method, invocation });
    }
  }

  transition(event: PeerEvent): void {
    const state = this.#state;
    if (event.type === "evidence-failed") {
      this.#state = { phase: "stopped", evidence: "failed" };
    } else if (event.type === "stop") {
      if (state.phase !== "stopped") {
        this.#state = { phase: "stopped", evidence: "available" };
      }
    } else if (state.phase === "uninitialized" && event.type === "initialize") {
      this.#state = { phase: "initializing", invocation: event.invocation };
    } else if (state.phase === "ready" && event.type === "dispose") {
      this.#state = {
        phase: "disposing",
        invocation: event.invocation,
        selection: state.selection,
      };
    } else if (
      (state.phase === "initializing" || state.phase === "disposing") &&
      "invocation" in event &&
      event.invocation === state.invocation
    ) {
      if (event.type === "failed") {
        this.#state =
          state.phase === "initializing"
            ? { phase: "uninitialized" }
            : { phase: "ready", selection: state.selection };
      } else if (event.type === "completed") {
        if (state.phase === "disposing") {
          this.#state = { phase: "disposed" };
        } else if (event.selection !== undefined) {
          this.#state = { phase: "ready", selection: event.selection };
        }
      }
    }
  }
}
