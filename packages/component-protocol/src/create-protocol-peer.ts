import type { TSchema } from "typebox";
import {
  ContractValidationError,
  type ErrorKind,
  type InvocationIdentity,
  type JsonValue,
  type NotificationFrame,
  negotiateVersion,
  type Operation,
  operationInputs,
  operationOutputs,
  type ProtocolFailure,
  type ProtocolFrame,
  protocolSchemas,
  protocolVersion,
  type RequestFrame,
  type ResponseFrame,
  roundTripJson,
  type Version,
  VersionNegotiationError,
  validateValue,
} from "./schemas.ts";
import type { ProtocolTransport, TransportEvent } from "./transports.ts";

export interface EvidenceRecord {
  invocationId: string | null;
  sequence: number;
  direction: "sent" | "received" | "local";
  kind: "frame" | "rejected" | "late" | "diagnostic" | "end" | "exit" | "interrupted";
  value: JsonValue;
}
export interface InvocationContext {
  signal: AbortSignal;
  progress(value: JsonValue): void;
  log(level: "debug" | "info" | "warning" | "error", message: string): void;
  assertCapability(handle: string): void;
}
export interface PeerOptions {
  transport: ProtocolTransport;
  role: "broker" | "component";
  binding: Pick<InvocationIdentity, "runId" | "componentInstanceId" | "configurationRevision">;
  contracts: Record<string, Version>;
  capabilities: string[];
  record(record: EvidenceRecord): void;
  authorize(request: RequestFrame): void;
  handlers: Partial<
    Record<
      Operation,
      (request: RequestFrame, context: InvocationContext) => JsonValue | Promise<JsonValue>
    >
  >;
}
export interface ProtocolPeer {
  request(
    method: Operation,
    identity: InvocationIdentity,
    input: JsonValue,
    capabilities?: string[],
  ): Promise<JsonValue>;
  cancel(invocationId: string, reason: string, deadline: number): void;
  close(): void;
  isStopped(): boolean;
}
interface Invocation {
  request: RequestFrame;
  controller: AbortController;
  sentSequence: number;
  receivedSequence: number;
  isSettled: boolean;
  resolve?: (value: JsonValue) => void;
  reject?: (error: Error) => void;
  timer?: ReturnType<typeof setTimeout>;
  cancellationTimer?: ReturnType<typeof setTimeout>;
}
export class ProtocolError extends Error {
  failure: ProtocolFailure;
  constructor(message: string, failure: ProtocolFailure) {
    super(message);
    this.failure = failure;
  }
}

function validateContribution(request: RequestFrame, output?: unknown): void {
  const input = request.params.input as Record<string, JsonValue>;
  if (request.method === "tool.execute") {
    const definition = input.definition as Record<string, JsonValue>;
    if (output === undefined) {
      validateValue(definition.parameters as TSchema, input.arguments);
    } else {
      const result = output as Record<string, JsonValue>;
      if (definition.resultSchema !== null) {
        validateValue(definition.resultSchema as TSchema, result.structuredData);
      }
    }
  }
  if (request.method === "stage.apply" && output !== undefined) {
    const result = output as Record<string, JsonValue>;
    if (
      (input.mode === "observe" && result.action !== "continue") ||
      (result.action === "block" && !(input.allowedEffects as string[]).includes("block")) ||
      (result.action === "replace" && !(input.allowedEffects as string[]).includes("replace"))
    ) {
      throw new ContractValidationError([
        { pointer: "/action", reason: "The stage does not allow this effect." },
      ]);
    }
    if (result.action === "replace") {
      validateValue(input.replacementSchema as TSchema, result.replacement);
    }
  }
}

/** Enforces the shared protocol without implementing a loader, journal, model, or effect service. */
export function createProtocolPeer(providedOptions: PeerOptions): ProtocolPeer {
  const options: PeerOptions = {
    ...providedOptions,
    binding: { ...providedOptions.binding },
    contracts: roundTripJson(providedOptions.contracts) as unknown as Record<string, Version>,
    capabilities: [...providedOptions.capabilities],
    handlers: { ...providedOptions.handlers },
  };
  const invocations = new Map<string, Invocation>();
  const requests = new Map<string | number, Invocation>();
  const evidenceSequences = new Map<string | null, number>();
  let nextRequest = 0;
  let isStopped = false;
  let isInitialized = false;
  let isDisposed = false;
  let hasEvidenceFailed = false;
  let negotiated: Record<string, Version> = {};
  let granted: string[] = [];
  const lifecycle = new Set<Operation>(["initialize", "describe", "dispose"]);
  const services = new Set<Operation>([
    "model.call",
    "component.call",
    "state.read",
    "state.write",
    "effect.request",
  ]);

  function record(
    kind: EvidenceRecord["kind"],
    direction: EvidenceRecord["direction"],
    value: unknown,
    invocationId: string | null = null,
  ): void {
    const sequence = (evidenceSequences.get(invocationId) ?? 0) + 1;
    try {
      options.record({ kind, direction, value: roundTripJson(value), invocationId, sequence });
      evidenceSequences.set(invocationId, sequence);
    } catch {
      hasEvidenceFailed = true;
      stop(new Error("Evidence recording fails. Further automatic work is stopped."));
      options.transport.close();
      throw new Error("Evidence recording fails. Further automatic work is stopped.");
    }
  }
  function stop(error: Error): void {
    if (isStopped) {
      return;
    }
    isStopped = true;
    for (const invocation of invocations.values()) {
      if (!invocation.isSettled && !hasEvidenceFailed) {
        try {
          record(
            "interrupted",
            "local",
            {
              outcome: "interrupted",
              reason: error.message,
              dispatch: "known",
              effects: "uncertain",
            },
            invocation.request.params.identity.invocationId,
          );
        } catch {
          hasEvidenceFailed = true;
        }
      }
      invocation.controller.abort(error);
      finish(invocation);
      invocation.reject?.(error);
    }
  }
  function finish(invocation: Invocation): void {
    invocation.isSettled = true;
    clearTimeout(invocation.timer);
  }
  function failure(kind: ErrorKind, message: string, invocation?: Invocation): ProtocolError {
    return new ProtocolError(message, {
      kind,
      identity: invocation?.request.params.identity ?? null,
      contract: invocation?.request.params.contract ?? { id: "wire", version: protocolVersion },
      sequence: 0,
      locations: [{ pointer: "", reason: message }],
      text: null,
      dispatch: invocation === undefined ? "absent" : "known",
      effects: invocation === undefined ? "absent" : "uncertain",
    });
  }
  function send(frame: ProtocolFrame, invocationId: string | null): void {
    if (isStopped) {
      throw new Error("The protocol peer is stopped.");
    }
    validateValue(protocolSchemas.frame as TSchema, frame);
    record("frame", "sent", frame, invocationId);
    options.transport.send(frame);
  }
  function checkIdentity(value: InvocationIdentity): void {
    for (const key of ["runId", "componentInstanceId", "configurationRevision"] as const) {
      if (value[key] !== options.binding[key]) {
        throw failure("denied-authority", `The captured ${key} does not match.`);
      }
    }
    if (value.deadline !== null && value.deadline <= Date.now()) {
      throw failure("cancellation", "The invocation deadline has expired.");
    }
    if (value.parentInvocationId !== null) {
      const parent = invocations.get(value.parentInvocationId);
      if (
        parent === undefined ||
        parent.isSettled ||
        parent.controller.signal.aborted ||
        parent.request.params.identity.invocationId === value.invocationId
      ) {
        throw failure("denied-authority", "The invocation has no active authorized parent.");
      }
      const deadline = parent.request.params.identity.deadline;
      if (deadline !== null && (value.deadline === null || value.deadline > deadline)) {
        throw failure("denied-authority", "A nested invocation cannot extend its parent deadline.");
      }
    }
  }
  function checkRequest(request: RequestFrame): void {
    const { identity, contract, wireVersion, capabilities } = request.params;
    checkIdentity(identity);
    if (isDisposed) {
      throw failure("protocol-failure", "The disposed instance cannot accept new work.");
    }
    if (
      request.method === "dispose" &&
      [...invocations.values()].some((invocation) => !invocation.isSettled)
    ) {
      throw failure("protocol-failure", "Disposal waits until owned invocations settle.");
    }
    if (wireVersion.major !== 1 || wireVersion.minor !== 0) {
      throw failure("protocol-failure", "The wire version is not negotiated.");
    }
    const selected = lifecycle.has(request.method) ? protocolVersion : negotiated[request.method];
    if (request.method !== "initialize" && !isInitialized) {
      throw failure("protocol-failure", "Initialization must complete before other operations.");
    }
    if (
      selected === undefined ||
      contract.id !== request.method ||
      contract.version.major !== selected.major ||
      contract.version.minor !== selected.minor
    ) {
      throw failure("protocol-failure", "The contribution contract is not negotiated.");
    }
    if (capabilities.some((handle) => !granted.includes(handle))) {
      throw failure("denied-authority", "The request names an ungranted capability.");
    }
    const parent =
      identity.parentInvocationId === null
        ? undefined
        : invocations.get(identity.parentInvocationId);
    if (
      parent !== undefined &&
      capabilities.some((handle) => !parent.request.params.capabilities.includes(handle))
    ) {
      throw failure("denied-authority", "A nested invocation cannot acquire broader authority.");
    }
    options.authorize(roundTripJson(request) as unknown as RequestFrame);
  }
  function addInvocation(request: RequestFrame, isOutgoing: boolean): Invocation {
    if (invocations.has(request.params.identity.invocationId) || requests.has(request.id)) {
      throw failure("protocol-failure", "Request and invocation identities cannot be reused.");
    }
    const invocation: Invocation = {
      request: roundTripJson(request) as unknown as RequestFrame,
      controller: new AbortController(),
      sentSequence: isOutgoing ? 1 : 0,
      receivedSequence: isOutgoing ? 0 : 1,
      isSettled: false,
    };
    invocations.set(request.params.identity.invocationId, invocation);
    requests.set(request.id, invocation);
    const deadline = request.params.identity.deadline;
    if (deadline !== null) {
      scheduleDeadline(invocation, deadline, false);
    }
    return invocation;
  }
  function scheduleDeadline(
    invocation: Invocation,
    deadline: number,
    isCancellation: boolean,
  ): void {
    const field = isCancellation ? "cancellationTimer" : "timer";
    invocation[field] = setTimeout(
      () => {
        if (Date.now() < deadline) {
          scheduleDeadline(invocation, deadline, isCancellation);
        } else if (isCancellation) {
          options.transport.terminate();
        } else if (!invocation.isSettled) {
          cancel(
            invocation.request.params.identity.invocationId,
            "The invocation deadline has expired.",
            Date.now(),
          );
        }
      },
      Math.max(0, Math.min(deadline - Date.now(), 2 ** 31 - 1)),
    );
  }
  function notify(
    invocation: Invocation,
    method: NotificationFrame["method"],
    data: JsonValue,
  ): void {
    if (invocation.isSettled && method !== "cancel") {
      throw failure(
        "protocol-failure",
        "Settled invocations cannot publish notifications.",
        invocation,
      );
    }
    if (method !== "cancel" && invocation.controller.signal.aborted) {
      throw failure("cancellation", "Capabilities are revoked after cancellation.", invocation);
    }
    send(
      {
        jsonrpc: "2.0",
        method,
        params: {
          wireVersion: protocolVersion,
          identity: invocation.request.params.identity,
          contract: invocation.request.params.contract,
          sequence: ++invocation.sentSequence,
          data,
        },
      },
      invocation.request.params.identity.invocationId,
    );
  }
  function revoke(invocation: Invocation, deadline: number): void {
    invocation.controller.abort();
    for (const child of invocations.values()) {
      if (
        child.request.params.identity.parentInvocationId ===
        invocation.request.params.identity.invocationId
      ) {
        revoke(child, deadline);
      }
    }
    if (
      options.transport.canTerminate &&
      options.role === "broker" &&
      invocation.cancellationTimer === undefined
    ) {
      scheduleDeadline(invocation, deadline, true);
    }
  }
  function cancel(invocationId: string, reason: string, deadline: number): void {
    validateValue(protocolSchemas.cancelData as TSchema, { reason, deadline });
    const invocation = invocations.get(invocationId);
    if (invocation === undefined) {
      throw new Error("The cancellation invocation is unknown.");
    }
    // Revocation is synchronous so a queued terminal response cannot restore authority.
    if (!invocation.isSettled) {
      revoke(invocation, deadline);
    }
    notify(invocation, "cancel", { reason, deadline });
  }
  function initialize(request: RequestFrame): JsonValue {
    if (isInitialized) {
      throw failure("protocol-failure", "The component is already initialized.");
    }
    const input = request.params.input as unknown as {
      wireVersions: Version[];
      manifestVersions: Version[];
      contracts: Record<string, Version[]>;
      componentInstanceId: string;
      requestedCapabilities: string[];
      grantedCapabilities: string[];
    };
    if (input.componentInstanceId !== options.binding.componentInstanceId) {
      throw failure("denied-authority", "Initialization cannot change the component instance.");
    }
    const wireVersion = negotiateVersion(input.wireVersions, [protocolVersion]);
    const manifestVersion = negotiateVersion(input.manifestVersions, [protocolVersion]);
    const contracts: Record<string, Version> = {};
    for (const [id, versions] of Object.entries(input.contracts)) {
      const supported = options.contracts[id];
      if (supported !== undefined) {
        contracts[id] = negotiateVersion(versions, [supported]);
      }
    }
    const grantedCapabilities = input.grantedCapabilities.filter((handle) =>
      options.capabilities.includes(handle),
    );
    return roundTripJson({
      wireVersion,
      manifestVersion,
      contracts,
      componentInstanceId: input.componentInstanceId,
      grantedCapabilities,
    });
  }
  function acceptInitialization(output: JsonValue, request: RequestFrame): void {
    validateValue(operationOutputs.initialize, output);
    const selected = output as unknown as {
      wireVersion: Version;
      manifestVersion: Version;
      contracts: Record<string, Version>;
      componentInstanceId: string;
      grantedCapabilities: string[];
    };
    const offer = request.params.input as unknown as {
      wireVersions: Version[];
      manifestVersions: Version[];
      contracts: Record<string, Version[]>;
      grantedCapabilities: string[];
    };
    function isOffered(value: Version, available: Version[]): boolean {
      return available.some(
        (candidate) => candidate.major === value.major && candidate.minor >= value.minor,
      );
    }
    if (
      selected.componentInstanceId !== options.binding.componentInstanceId ||
      !isOffered(selected.wireVersion, offer.wireVersions) ||
      !isOffered(selected.manifestVersion, offer.manifestVersions) ||
      !isOffered(selected.wireVersion, [protocolVersion]) ||
      !isOffered(selected.manifestVersion, [protocolVersion]) ||
      selected.grantedCapabilities.some(
        (handle) =>
          !offer.grantedCapabilities.includes(handle) || !options.capabilities.includes(handle),
      )
    ) {
      throw failure(
        "protocol-failure",
        "Initialization selects unoffered identity, authority, or versions.",
      );
    }
    for (const [id, version] of Object.entries(selected.contracts)) {
      if (
        !isOffered(version, offer.contracts[id] ?? []) ||
        options.contracts[id] === undefined ||
        !isOffered(version, [options.contracts[id]])
      ) {
        throw failure(
          "protocol-failure",
          "Initialization selects an unoffered contribution contract.",
        );
      }
    }
    negotiated = roundTripJson(selected.contracts) as unknown as Record<string, Version>;
    granted = [...selected.grantedCapabilities];
    isInitialized = true;
  }
  function reply(invocation: Invocation, output: JsonValue | undefined, error?: unknown): void {
    if (invocation.isSettled || isStopped) {
      return;
    }
    const request = invocation.request;
    let problem = error;
    if (problem === undefined && invocation.controller.signal.aborted) {
      problem = failure("cancellation", "The invocation settles after cancellation.", invocation);
    }
    try {
      if (problem === undefined) {
        validateValue(operationOutputs[request.method], output);
        validateContribution(request, output);
        if (request.method === "initialize") {
          acceptInitialization(output as JsonValue, request);
        }
      }
    } catch (error) {
      problem = error;
    }
    const sequence = ++invocation.sentSequence;
    const response: ResponseFrame =
      problem === undefined
        ? {
            jsonrpc: "2.0",
            id: request.id,
            result: {
              identity: request.params.identity,
              contract: request.params.contract,
              sequence,
              outcome: "completed",
              output: output as JsonValue,
              dispatch: "known",
              effects: "uncertain",
            },
          }
        : errorResponse(request.id, problem, invocation, sequence);
    send(response, request.params.identity.invocationId);
    finish(invocation);
    if (request.method === "dispose" && problem === undefined) {
      isInitialized = false;
      isDisposed = true;
    }
  }
  function errorResponse(
    id: string | number | null,
    error: unknown,
    invocation?: Invocation,
    sequence = 0,
    code?: number,
  ): ResponseFrame {
    const problem =
      error instanceof ProtocolError
        ? error
        : failure(
            error instanceof ContractValidationError
              ? "invalid-input"
              : error instanceof VersionNegotiationError
                ? "protocol-failure"
                : "execution-failure",
            error instanceof Error ? error.message : "Component execution fails.",
            invocation,
          );
    const data: ProtocolFailure = {
      ...problem.failure,
      sequence,
      identity: invocation?.request.params.identity ?? problem.failure.identity,
      contract: invocation?.request.params.contract ?? problem.failure.contract,
    };
    if (
      problem.failure.identity !== null &&
      data.identity?.invocationId !== problem.failure.identity.invocationId
    ) {
      const cause = problem.failure;
      data.causes = [
        ...(cause.causes ?? []),
        {
          identity: cause.identity,
          contract: cause.contract,
          kind: cause.kind,
          locations: cause.locations,
          dispatch: cause.dispatch,
          effects: cause.effects,
        },
      ];
      data.locations = [{ pointer: "", reason: problem.message }];
      data.dispatch = "known";
      data.effects = "uncertain";
    }
    if (error instanceof ContractValidationError) {
      data.locations = error.locations;
    }
    return {
      jsonrpc: "2.0",
      id,
      error: {
        code: code ?? (data.kind === "invalid-input" ? -32602 : -32000),
        message: problem.message,
        data,
      },
    };
  }
  function receiveRequest(request: RequestFrame): void {
    let invocation: Invocation | undefined;
    try {
      if ((options.role === "broker") !== services.has(request.method)) {
        throw failure("denied-authority", "The operation is not allowed in this direction.");
      }
      validateValue(operationInputs[request.method], request.params.input);
      checkRequest(request);
      validateContribution(request);
      if (request.params.sequence !== 1) {
        throw failure("protocol-failure", "A request begins its sender sequence at one.");
      }
      invocation = addInvocation(request, false);
      const active = invocation;
      const context: InvocationContext = {
        signal: active.controller.signal,
        progress(value): void {
          notify(active, "progress", { value });
        },
        log(level, message): void {
          notify(active, "log", { level, message });
        },
        assertCapability(handle): void {
          if (
            isStopped ||
            active.isSettled ||
            active.controller.signal.aborted ||
            !active.request.params.capabilities.includes(handle) ||
            !granted.includes(handle)
          ) {
            throw failure(
              "denied-authority",
              "The invocation capability is absent or revoked.",
              active,
            );
          }
        },
      };
      const handler = options.handlers[request.method];
      if (request.method !== "initialize" && handler === undefined) {
        throw failure(
          "missing-dependency",
          "The declared operation has no available implementation.",
          invocation,
        );
      }
      const output =
        request.method === "initialize" ? initialize(request) : handler?.(request, context);
      void Promise.resolve(output)
        .then(
          (value) => reply(active, value),
          (error) => reply(active, undefined, error),
        )
        .catch((error: unknown) =>
          stop(error instanceof Error ? error : new Error("Protocol execution fails.")),
        );
    } catch (error) {
      record(
        "rejected",
        "local",
        error instanceof Error ? error.message : "The request is rejected.",
        request.params.identity.invocationId,
      );
      if (invocation === undefined) {
        if (invocations.has(request.params.identity.invocationId) || requests.has(request.id)) {
          stop(
            failure(
              "protocol-failure",
              "A duplicate request cannot create another terminal response.",
            ),
          );
          options.transport.close();
          return;
        }
        invocation = {
          request,
          controller: new AbortController(),
          sentSequence: 0,
          receivedSequence: 1,
          isSettled: false,
        };
      }
      reply(invocation, undefined, error);
    }
  }
  function correlate(frame: ResponseFrame | NotificationFrame): Invocation {
    const details = "params" in frame ? frame.params : (frame.result ?? frame.error?.data);
    const invocation =
      details?.identity === null || details?.identity === undefined
        ? undefined
        : invocations.get(details.identity.invocationId);
    if (invocation === undefined || details === undefined) {
      throw failure("protocol-failure", "The message has no correlated invocation.");
    }
    const expected = invocation.request.params;
    if (
      ("id" in frame && frame.id !== invocation.request.id) ||
      (Object.keys(expected.identity) as (keyof InvocationIdentity)[]).some(
        (key) => details.identity?.[key] !== expected.identity[key],
      ) ||
      details.contract.id !== expected.contract.id ||
      details.contract.version.major !== expected.contract.version.major ||
      details.contract.version.minor !== expected.contract.version.minor ||
      ("params" in frame &&
        (frame.params.wireVersion.major !== 1 || frame.params.wireVersion.minor !== 0)) ||
      (!invocation.isSettled && details.sequence !== invocation.receivedSequence + 1)
    ) {
      throw failure(
        "protocol-failure",
        "Message identity, contract, or sequence does not correlate.",
        invocation,
      );
    }
    if (!invocation.isSettled) {
      invocation.receivedSequence = details.sequence;
    }
    return invocation;
  }
  function receive(event: TransportEvent): void {
    try {
      if (event.type !== "message") {
        if (event.type === "fault") {
          record("rejected", "received", event);
          if (!isStopped) {
            send(
              errorResponse(null, failure("protocol-failure", event.reason), undefined, 0, -32700),
              null,
            );
          }
          stop(failure("protocol-failure", event.reason));
        } else if (event.type === "diagnostic") {
          record("diagnostic", "received", event.text);
        } else {
          record(event.type, "received", event);
          if (event.type === "exit") {
            for (const invocation of invocations.values()) {
              clearTimeout(invocation.cancellationTimer);
            }
          }
          stop(failure("execution-failure", "The worker ends without further protocol delivery."));
        }
        return;
      }
      const raw = event.value as ProtocolFrame;
      const identity =
        "params" in Object(raw)
          ? (raw as RequestFrame).params?.identity
          : ((raw as ResponseFrame)?.result?.identity ??
            (raw as ResponseFrame)?.error?.data.identity);
      record("frame", "received", event.value, identity?.invocationId ?? null);
      if (isStopped) {
        record("late", "local", event.value, identity?.invocationId ?? null);
        return;
      }
      try {
        validateValue(protocolSchemas.frame as TSchema, event.value);
      } catch (error) {
        record("rejected", "local", {
          reason: error instanceof Error ? error.message : "Invalid frame.",
          value: event.value,
        });
        const id =
          typeof (raw as ResponseFrame)?.id === "string" ||
          typeof (raw as ResponseFrame)?.id === "number"
            ? (raw as ResponseFrame).id
            : null;
        send(
          errorResponse(
            id,
            failure("protocol-failure", "The received frame does not match the protocol schema."),
            undefined,
            0,
            "method" in Object(raw) &&
              typeof (raw as RequestFrame).method === "string" &&
              !Object.hasOwn(operationInputs, (raw as RequestFrame).method)
              ? -32601
              : -32600,
          ),
          null,
        );
        stop(failure("protocol-failure", "The received frame does not match the protocol schema."));
        return;
      }
      if ("method" in raw && "id" in raw) {
        receiveRequest(raw);
        return;
      }
      const invocation = correlate(raw);
      if (invocation.isSettled) {
        record("late", "local", raw, invocation.request.params.identity.invocationId);
        return;
      }
      if ("method" in raw) {
        if (raw.method === "cancel") {
          const data = raw.params.data as { deadline: number };
          revoke(invocation, data.deadline);
        }
        return;
      }
      if (invocation.resolve === undefined) {
        throw failure(
          "protocol-failure",
          "A response cannot settle an incoming request.",
          invocation,
        );
      }
      if (raw.error !== undefined) {
        finish(invocation);
        invocation.reject?.(new ProtocolError(raw.error.message, raw.error.data));
      } else if (raw.result !== undefined) {
        validateValue(operationOutputs[invocation.request.method], raw.result.output);
        if (invocation.request.method === "initialize") {
          acceptInitialization(raw.result.output, invocation.request);
        }
        if (invocation.request.method === "dispose") {
          isInitialized = false;
          isDisposed = true;
        }
        finish(invocation);
        invocation.resolve(raw.result.output);
      }
    } catch (error) {
      stop(error instanceof Error ? error : new Error("Protocol delivery fails."));
    }
  }
  options.transport.listen(receive);
  return {
    async request(method, identity, input, capabilities = []): Promise<JsonValue> {
      const request: RequestFrame = {
        jsonrpc: "2.0",
        id: `${options.role}:${++nextRequest}`,
        method,
        params: {
          wireVersion: protocolVersion,
          identity,
          sequence: 1,
          contract: {
            id: method,
            version: lifecycle.has(method)
              ? protocolVersion
              : (negotiated[method] ?? protocolVersion),
          },
          capabilities,
          input,
        },
      };
      validateValue(operationInputs[method], input);
      checkRequest(request);
      const invocation = addInvocation(request, true);
      return new Promise<JsonValue>((resolve, reject) => {
        invocation.resolve = resolve;
        invocation.reject = reject;
        try {
          send(invocation.request, invocation.request.params.identity.invocationId);
        } catch (error) {
          finish(invocation);
          reject(error);
        }
      });
    },
    cancel,
    close(): void {
      stop(new Error("The protocol peer is closed."));
      for (const invocation of invocations.values()) {
        clearTimeout(invocation.cancellationTimer);
      }
      options.transport.close();
    },
    isStopped(): boolean {
      return isStopped;
    },
  };
}
