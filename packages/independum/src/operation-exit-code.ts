import type { Operation } from "./headless-types.ts";

/** Maps operation state to the command exit contract. */
export function operationExitCode(operation: Pick<Operation, "status" | "code">): number {
  if (operation.code === "approvalRequired" || operation.status === "waitingForInput") {
    return 7;
  }
  switch (operation.status) {
    case "completed":
      return 0;
    case "cancelled":
      return 9;
    case "outputLimited":
      return 10;
    case "interrupted":
      return 5;
    default:
      return operation.code === "chatUnavailable" ? 6 : 1;
  }
}
