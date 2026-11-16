import type { TSchema } from "typebox";
import { Invocation, type InvocationAction } from "./invocation.ts";
import { type InitializationSelection, PeerLifecycle } from "./peer-lifecycle.ts";
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
import { encodeFrame, type ProtocolTransport, type TransportEvent } from "./transports.ts";

export interface EvidenceRecord {
  invocationId: string | null;
  sequence: number;
  direction: "sent" | "received" | "local";
  kind: "frame" | "rejected" | "late" | "diagnostic" | "end" | "exit" | "interrupted";
  value: JsonValue;
  bytes?: string;
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
    binding: roundTripJson(providedOptions.binding) as unknown as PeerOptions["binding"],
    contracts: roundTripJson(providedOptions.contracts) as unknown as Record<string, Version>,
    capabilities: roundTripJson(providedOptions.capabilities) as string[],
    handlers: { ...providedOptions.handlers },
  };
  const invocations = new Map<string, Invocation>();
  const requests = new Map<string | number, Invocation>();
  const evidenceSequences = new Map<string | null, number>();
  let nextRequest = 0;
  const lifecycle = new PeerLifecycle();
  const lifecycleOperations = new Set<Operation>(["initialize", "describe", "dispose"]);
  const services = new Set<Operation>([
    "model.call",
    "component.call",
    "state.read",
    "state.write",
    "effect.request",
  ]);

  function mayProceed(action: InvocationAction | "protocol", invocation?: Invocation): boolean {
    if (!lifecycle.allows(action, invocation, invocation?.request.method)) {
      return false;
    }
    if (invocation === undefined) {
      return action === "protocol";
    }
    if (action !== "protocol" && !invocation.allows(action)) {
      return false;
    }
    if (action === "work" || action === "dispatch" || action === "notify") {
      const parentId = invocation.request.params.identity.parentInvocationId;
      if (parentId !== null) {
        const parent = invocations.get(parentId);
        return parent !== undefined && mayProceed("work", parent);
      }
    }
    return true;
  }
  function assertProceed(action: InvocationAction | "protocol", invocation?: Invocation): void {
    if (!mayProceed(action, invocation)) {
      throw (
        invocation?.revocationFailure ??
        failure(
          "denied-authority",
          "The invocation or peer no longer admits this action.",
          invocation,
        )
      );
    }
  }

  function record(
    kind: EvidenceRecord["kind"],
    direction: EvidenceRecord["direction"],
    value: unknown,
    invocationId: string | null = null,
    bytes?: string,
  ): void {
    if (!lifecycle.canRecord) {
      throw new Error("Evidence recording fails. Further automatic work is stopped.");
    }
    const sequence = (evidenceSequences.get(invocationId) ?? 0) + 1;
    evidenceSequences.set(invocationId, sequence);
    try {
      options.record({
        kind,
        direction,
        value: roundTripJson(value),
        invocationId,
        sequence,
        ...(bytes === undefined ? {} : { bytes }),
      });
    } catch {
      stop(new Error("Evidence recording fails. Further automatic work is stopped."), true);
      throw new Error("Evidence recording fails. Further automatic work is stopped.");
    }
  }
  function stop(error: Error, hasEvidenceFailed = false): void {
    const wasStopped = lifecycle.isStopped();
    lifecycle.transition({ type: hasEvidenceFailed ? "evidence-failed" : "stop" });
    if (wasStopped) {
      return;
    }
    for (const invocation of invocations.values()) {
      if (!invocation.allows("revoke")) {
        continue;
      }
      const problem = interruption(error, invocation);
      if (lifecycle.canRecord) {
        try {
          record(
            "interrupted",
            "local",
            {
              outcome: "interrupted",
              reason: problem.message,
              failure: problem.failure,
              ...invocation.delivery,
            },
            invocation.request.params.identity.invocationId,
          );
        } catch {
          lifecycle.transition({ type: "evidence-failed" });
        }
      }
      invocation.transition({ type: "interrupted", error: problem });
      clearTimeout(invocation.cancellationTimer);
    }
    options.transport.close();
    if (options.role === "broker" && options.transport.canTerminate) {
      options.transport.terminate();
    }
  }
  function interruption(error: Error, invocation: Invocation): ProtocolError {
    if (
      error instanceof ProtocolError &&
      error.failure.identity?.invocationId === invocation.request.params.identity.invocationId
    ) {
      return protocolError(error, invocation);
    }
    return failure(
      error instanceof ProtocolError
        ? error.failure.kind === "protocol-failure"
          ? "protocol-failure"
          : "execution-failure"
        : "execution-failure",
      error.message,
      invocation,
    );
  }
  function failure(kind: ErrorKind, message: string, invocation?: Invocation): ProtocolError {
    return new ProtocolError(message, {
      kind,
      identity: invocation?.request.params.identity ?? null,
      contract: invocation?.request.params.contract ?? { id: "wire", version: protocolVersion },
      sequence: 0,
      locations: [{ pointer: "", reason: message }],
      text: null,
      ...(invocation?.delivery ?? { dispatch: "absent", effects: "absent" }),
    });
  }
  function send(
    frame: ProtocolFrame,
    invocationId: string | null,
    beforeDispatch?: () => void,
  ): void {
    const invocation = invocationId === null ? undefined : invocations.get(invocationId);
    const action =
      invocation === undefined
        ? "protocol"
        : "method" in frame
          ? "id" in frame
            ? "dispatch"
            : frame.method === "cancel"
              ? "cancel"
              : "notify"
          : "reply";
    let outgoing: ProtocolFrame;
    try {
      assertProceed(action, invocation);
      outgoing = roundTripJson(frame) as unknown as ProtocolFrame;
      validateValue(protocolSchemas.frame as TSchema, outgoing);
      encodeFrame(outgoing);
    } catch (error) {
      throw rejectDispatch(frame, error, "absent", invocation);
    }
    record("frame", "sent", outgoing, invocationId);
    assertProceed(action, invocation);
    beforeDispatch?.();
    assertProceed(action === "reply" ? "terminal" : action, invocation);
    const isRequest = "method" in outgoing && "id" in outgoing;
    try {
      if (isRequest && invocation !== undefined) {
        invocation.dispatch(() => options.transport.send(outgoing));
        armTermination(invocation);
      } else {
        options.transport.send(outgoing);
      }
    } catch (error) {
      const problem = rejectDispatch(frame, error, "uncertain", invocation);
      stop(problem);
      throw problem;
    }
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
        !mayProceed("work", parent) ||
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
    if (wireVersion.major !== 1 || wireVersion.minor !== 0) {
      throw failure("protocol-failure", "The wire version is not negotiated.");
    }
    try {
      lifecycle.assertAdmission(
        request.method,
        [...invocations.values()].some((active) => active.allows("revoke")),
      );
    } catch (error) {
      throw failure("protocol-failure", (error as Error).message);
    }
    const selected = lifecycleOperations.has(request.method)
      ? protocolVersion
      : lifecycle.selection?.contracts[request.method];
    if (request.method !== "initialize" && lifecycle.selection === undefined) {
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
    if (capabilities.some((handle) => !lifecycle.selection?.grantedCapabilities.includes(handle))) {
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
  }
  function prepareInvocation(request: RequestFrame, caller?: Invocation["caller"]): Invocation {
    const invocation = new Invocation(
      request,
      () => failure("cancellation", "The invocation settles after cancellation.", invocation),
      caller,
    );
    return invocation;
  }
  function addInvocation(invocation: Invocation, doesAdmit = true): Invocation {
    const request = invocation.request;
    assertProceed("protocol");
    if (invocations.has(request.params.identity.invocationId) || requests.has(request.id)) {
      throw failure("protocol-failure", "Request and invocation identities cannot be reused.");
    }
    if (doesAdmit) {
      try {
        lifecycle.admit(
          request.method,
          invocation,
          [...invocations.values()].some((active) => active.allows("revoke")),
        );
      } catch (error) {
        throw failure("protocol-failure", (error as Error).message, invocation);
      }
    }
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
          stop(failure("cancellation", "The cancellation deadline has expired.", invocation));
        } else if (mayProceed("revoke", invocation)) {
          try {
            cancel(
              invocation.request.params.identity.invocationId,
              "The invocation deadline has expired.",
              Date.now(),
              "deadline",
            );
          } catch (error) {
            stop(protocolError(error, invocation));
          }
        }
      },
      Math.max(0, Math.min(deadline - Date.now(), 2 ** 31 - 1)),
    );
  }
  function notify(
    invocation: Invocation,
    method: NotificationFrame["method"],
    data: JsonValue,
    beforeDispatch?: () => void,
  ): void {
    assertProceed(method === "cancel" ? "cancel" : "notify", invocation);
    const sequence = invocation.sentSequence + 1;
    send(
      {
        jsonrpc: "2.0",
        method,
        params: {
          wireVersion: protocolVersion,
          identity: invocation.request.params.identity,
          contract: invocation.request.params.contract,
          sequence,
          data,
        },
      },
      invocation.request.params.identity.invocationId,
      beforeDispatch,
    );
    invocation.transition({ type: "sent-frame", sequence });
  }
  function revoke(
    invocation: Invocation,
    deadline: number,
    event: "cancel" | "deadline" = "cancel",
  ): void {
    if (!mayProceed("revoke", invocation)) {
      return;
    }
    invocation.transition({ type: event, deadline });
    for (const child of invocations.values()) {
      if (
        child.request.params.identity.parentInvocationId ===
        invocation.request.params.identity.invocationId
      ) {
        revoke(child, deadline, event);
      }
    }
    armTermination(invocation);
  }
  function armTermination(invocation: Invocation): void {
    if (
      mayProceed("cancel", invocation) &&
      invocation.delivery.dispatch === "known" &&
      invocation.cancellationDeadline !== undefined &&
      options.transport.canTerminate &&
      options.role === "broker"
    ) {
      clearTimeout(invocation.cancellationTimer);
      scheduleDeadline(invocation, invocation.cancellationDeadline, true);
    }
  }
  function cancel(
    invocationId: string,
    reason: string,
    deadline: number,
    event: "cancel" | "deadline" = "cancel",
  ): void {
    validateValue(protocolSchemas.cancelData as TSchema, { reason, deadline });
    const invocation = invocations.get(invocationId);
    if (invocation === undefined) {
      throw new Error("The cancellation invocation is unknown.");
    }
    if (invocation.delivery.dispatch === "absent") {
      if (!mayProceed("revoke", invocation)) {
        return;
      }
      const problem = failure(
        "cancellation",
        "The invocation cancels before dispatch.",
        invocation,
      );
      record("rejected", "local", { failure: problem.failure }, invocationId);
      revoke(invocation, deadline, event);
      settle(invocation, { type: "failed", error: problem });
      return;
    }
    try {
      notify(invocation, "cancel", { reason, deadline }, () => revoke(invocation, deadline, event));
    } catch (error) {
      if (mayProceed("revoke", invocation)) {
        revoke(invocation, deadline, event);
        stop(protocolError(error, invocation));
      }
      throw error;
    }
  }
  function initialize(request: RequestFrame): JsonValue {
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
  function validateInitialization(
    output: JsonValue,
    request: RequestFrame,
  ): InitializationSelection {
    validateValue(operationOutputs.initialize, output);
    const selected = output as unknown as InitializationSelection;
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
    return selected;
  }
  function settle(
    invocation: Invocation,
    event: Parameters<Invocation["transition"]>[0],
    selection?: InitializationSelection,
  ): void {
    invocation.transition(event);
    if (invocation.outcome !== undefined) {
      lifecycle.transition({
        type: invocation.outcome === "settled" ? "completed" : "failed",
        invocation,
        ...(selection === undefined
          ? {}
          : { selection: roundTripJson(selection) as unknown as InitializationSelection }),
      });
    }
  }
  function reply(invocation: Invocation, output: JsonValue | undefined, error?: unknown): void {
    if (!mayProceed("reply", invocation)) {
      return;
    }
    const request = invocation.request;
    let problem = invocation.revocationFailure ?? error;
    let selection: InitializationSelection | undefined;
    try {
      if (problem === undefined) {
        validateValue(operationOutputs[request.method], output);
        validateContribution(request, output);
        if (request.method === "initialize") {
          selection = validateInitialization(output as JsonValue, request);
        }
      }
    } catch (error) {
      problem = error;
    }
    const sequence = invocation.sentSequence + 1;
    function finish(): void {
      problem = invocation.revocationFailure ?? problem;
      settle(
        invocation,
        problem === undefined
          ? { type: "completed", output: output as JsonValue }
          : { type: "failed", error: protocolError(problem, invocation) },
        selection,
      );
    }
    let response: ResponseFrame | undefined;
    try {
      response =
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
      send(response, request.params.identity.invocationId, finish);
    } catch {
      if (!mayProceed("reply", invocation) && !mayProceed("terminal", invocation)) {
        return;
      }
      const encodingProblem = failure(
        "protocol-failure",
        "The terminal response cannot be encoded. Use bounded values or references.",
        invocation,
      );
      problem = encodingProblem;
      if (response === undefined) {
        record(
          "rejected",
          "local",
          { frame: null, dispatch: "absent", failure: encodingProblem.failure },
          request.params.identity.invocationId,
        );
      }
      try {
        send(
          errorResponse(request.id, encodingProblem, invocation, sequence),
          request.params.identity.invocationId,
          finish,
        );
      } catch (error) {
        if (mayProceed("protocol")) {
          try {
            send(
              errorResponse(
                null,
                failure("protocol-failure", "The terminal correlation cannot fit the frame limit."),
              ),
              null,
            );
          } catch {
            // Failed delivery already retains its rejection evidence.
          }
        }
        stop(protocolError(error, invocation));
        return;
      }
    }
    invocation.transition({ type: "sent-frame", sequence, isTerminal: true });
  }
  function protocolError(error: unknown, invocation?: Invocation, sequence = 0): ProtocolError {
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
      ...(invocation?.delivery ?? {}),
    };
    if (
      invocation?.caller === undefined &&
      problem.failure.identity !== null &&
      problem.failure.dispatch === "absent" &&
      data.dispatch !== "absent"
    ) {
      const { identity, contract, kind, locations, dispatch, effects } = problem.failure;
      data.causes = [
        ...(problem.failure.causes ?? []),
        { identity, contract, kind, locations, dispatch, effects },
      ];
    }
    if (
      problem.failure.identity !== null &&
      data.identity?.invocationId !== problem.failure.identity.invocationId
    ) {
      const cause = problem.failure;
      data.causes = [
        ...(cause.causes ?? []),
        ...(cause.causes?.some(
          (entry) => entry.identity?.invocationId === cause.identity?.invocationId,
        )
          ? []
          : [
              {
                identity: cause.identity,
                contract: cause.contract,
                kind: cause.kind,
                locations: cause.locations,
                dispatch: cause.dispatch,
                effects: cause.effects,
              },
            ]),
      ];
      data.locations = [{ pointer: "", reason: problem.message }];
    }
    if (error instanceof ContractValidationError) {
      data.locations = error.locations;
    }
    return new ProtocolError(problem.message, data);
  }
  function errorResponse(
    id: string | number | null,
    error: unknown,
    invocation?: Invocation,
    sequence = 0,
    code?: number,
  ): ResponseFrame {
    const problem = protocolError(error, invocation, sequence);
    return {
      jsonrpc: "2.0",
      id,
      error: {
        code: code ?? (problem.failure.kind === "invalid-input" ? -32602 : -32000),
        message: problem.message,
        data: problem.failure,
      },
    };
  }
  function rejectDispatch(
    frame: ProtocolFrame,
    error: unknown,
    dispatch: ProtocolFailure["dispatch"] = "absent",
    active?: Invocation,
  ): ProtocolError {
    let captured: JsonValue = null;
    let identity: InvocationIdentity | null = null;
    let contract = { id: "wire", version: protocolVersion };
    try {
      captured = roundTripJson(frame);
    } catch {
      // Non-JSON values cannot be copied into evidence.
    }
    try {
      const details = "params" in frame ? frame.params : (frame.result ?? frame.error?.data);
      validateValue(protocolSchemas.contract as TSchema, details?.contract);
      contract = roundTripJson(details?.contract) as unknown as typeof contract;
      validateValue(protocolSchemas.identity as TSchema, details?.identity);
      identity = roundTripJson(details?.identity) as unknown as InvocationIdentity;
    } catch {
      // Malformed correlation fields cannot identify a denial.
    }
    const isRequest = "method" in frame && "id" in frame;
    const invocation =
      active ??
      (isRequest || identity === null ? undefined : invocations.get(identity.invocationId));
    let problem: ProtocolError;
    try {
      problem = protocolError(error, invocation);
      validateValue(protocolSchemas.failure as TSchema, problem.failure);
    } catch {
      problem = failure(
        "protocol-failure",
        "The failure details do not match the protocol schema.",
        invocation,
      );
    }
    const data: ProtocolFailure = {
      ...problem.failure,
      identity,
      contract,
      ...(invocation?.delivery ??
        (isRequest && dispatch === "uncertain"
          ? { dispatch: "uncertain", effects: "uncertain" }
          : { dispatch: "absent", effects: "absent" })),
    };
    try {
      record(
        "rejected",
        "local",
        { frame: captured, dispatch, failure: data },
        identity?.invocationId ?? null,
      );
    } catch (error) {
      const reason = error instanceof Error ? error.message : "Evidence recording fails.";
      return new ProtocolError(reason, {
        ...data,
        kind: "protocol-failure",
        locations: [{ pointer: "", reason }],
      });
    }
    return new ProtocolError(problem.message, data);
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
      invocation = addInvocation(prepareInvocation(request));
      assertProceed("work", invocation);
      options.authorize(roundTripJson(request) as unknown as RequestFrame);
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
            !mayProceed("work", active) ||
            !active.request.params.capabilities.includes(handle) ||
            !lifecycle.selection?.grantedCapabilities.includes(handle)
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
      assertProceed("work", active);
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
      if (!mayProceed("protocol")) {
        return;
      }
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
          return;
        }
        invocation = addInvocation(prepareInvocation(request), false);
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
      invocation.delivery.dispatch === "absent" ||
      (invocation.allows("receive") && details.sequence !== invocation.receivedSequence + 1)
    ) {
      throw failure(
        "protocol-failure",
        "Message identity, contract, or sequence does not correlate.",
        invocation,
      );
    }
    if (mayProceed("receive", invocation)) {
      invocation.transition({
        type: "received",
        sequence: details.sequence,
        ...("params" in frame ? {} : { effects: (frame.result ?? frame.error?.data)?.effects }),
      });
      armTermination(invocation);
    }
    return invocation;
  }
  function receive(event: TransportEvent): void {
    let invocation: Invocation | undefined;
    try {
      if (event.type !== "message") {
        if (event.type === "fault") {
          record("rejected", "received", event, null, event.rawBytes);
          if (mayProceed("protocol")) {
            send(
              errorResponse(null, failure("protocol-failure", event.reason), undefined, 0, -32700),
              null,
            );
          }
          stop(failure("protocol-failure", event.reason));
        } else if (event.type === "diagnostic") {
          record("diagnostic", "received", event.text, null, event.rawBytes);
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
            (raw as ResponseFrame)?.error?.data?.identity);
      const invocationId =
        typeof identity?.invocationId === "string" ? identity.invocationId : null;
      record("frame", "received", event.value, invocationId, event.rawBytes);
      if (!mayProceed("protocol")) {
        record("late", "local", event.value, invocationId);
        return;
      }
      try {
        validateValue(protocolSchemas.frame as TSchema, event.value);
      } catch (error) {
        record("rejected", "local", {
          reason: error instanceof Error ? error.message : "Invalid frame.",
          value: event.value,
        });
        const candidate = (raw as ResponseFrame)?.id;
        const id =
          (typeof candidate === "string" && candidate.length > 0) ||
          (typeof candidate === "number" && Number.isSafeInteger(candidate) && candidate >= 0)
            ? candidate
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
      invocation = correlate(raw);
      if (!mayProceed("receive", invocation)) {
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
      if (invocation.caller === undefined) {
        throw failure(
          "protocol-failure",
          "A response cannot settle an incoming request.",
          invocation,
        );
      }
      const revocationFailure = invocation.revocationFailure;
      if (revocationFailure !== undefined) {
        record("late", "local", raw, invocation.request.params.identity.invocationId);
        settle(invocation, {
          type: "failed",
          error: revocationFailure,
        });
        return;
      }
      if (raw.error !== undefined) {
        settle(invocation, {
          type: "failed",
          error: protocolError(new ProtocolError(raw.error.message, raw.error.data), invocation),
        });
      } else if (raw.result !== undefined) {
        let selection: InitializationSelection | undefined;
        validateValue(operationOutputs[invocation.request.method], raw.result.output);
        validateContribution(invocation.request, raw.result.output);
        if (invocation.request.method === "initialize") {
          selection = validateInitialization(raw.result.output, invocation.request);
        }
        settle(invocation, { type: "completed", output: raw.result.output }, selection);
      }
    } catch (error) {
      const problem = protocolError(error, invocation);
      if (lifecycle.canRecord) {
        try {
          record(
            "rejected",
            "local",
            { failure: problem.failure },
            invocation?.request.params.identity.invocationId ?? null,
          );
        } catch {
          return;
        }
      }
      stop(problem);
    }
  }
  options.transport.listen(receive);
  return {
    async request(method, identity, input, capabilities = []): Promise<JsonValue> {
      let request: RequestFrame = {
        jsonrpc: "2.0",
        id: `${options.role}:${++nextRequest}`,
        method,
        params: {
          wireVersion: protocolVersion,
          identity,
          sequence: 1,
          contract: {
            id: method,
            version: lifecycleOperations.has(method)
              ? protocolVersion
              : (lifecycle.selection?.contracts[method] ?? protocolVersion),
          },
          capabilities,
          input,
        },
      };
      return new Promise<JsonValue>((resolve, reject) => {
        let invocation: Invocation | undefined;
        try {
          validateValue(protocolSchemas.frame as TSchema, request);
          request = roundTripJson(request) as unknown as RequestFrame;
          invocation = prepareInvocation(request, { resolve, reject });
          validateValue(operationInputs[method], request.params.input);
          checkRequest(request);
          validateContribution(request);
          addInvocation(invocation);
          assertProceed("dispatch", invocation);
          options.authorize(roundTripJson(request) as unknown as RequestFrame);
        } catch (error) {
          const problem = rejectDispatch(request, error, "absent", invocation);
          if (invocation === undefined) {
            reject(problem);
          } else {
            settle(invocation, { type: "failed", error: problem });
          }
          return;
        }
        try {
          send(invocation.request, invocation.request.params.identity.invocationId);
        } catch (error) {
          settle(invocation, { type: "send-failed", error: protocolError(error, invocation) });
        }
      });
    },
    cancel,
    close(): void {
      stop(new Error("The protocol peer is closed."));
      for (const invocation of invocations.values()) {
        clearTimeout(invocation.cancellationTimer);
      }
    },
    isStopped(): boolean {
      return lifecycle.isStopped();
    },
  };
}
