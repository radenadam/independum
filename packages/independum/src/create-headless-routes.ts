import { Hono } from "hono";
import { validateChatSettings } from "./configuration-schema.ts";
import type { Operations } from "./create-operations.ts";
import { HeadlessError, type HeadlessPrompt } from "./headless-types.ts";

/** Creates compact submission and blocking observation routes behind the ordinary API boundary. */
export function createHeadlessRoutes(operations: Operations): Hono {
  const routes = new Hono();
  routes.onError((error, context) => {
    const failure =
      error instanceof HeadlessError
        ? error
        : new HeadlessError("The headless request failed.", "serverFailure", 1);
    const status =
      failure.exitCode === 2
        ? 400
        : failure.exitCode === 3
          ? 404
          : failure.exitCode === 6
            ? 409
            : 500;
    return context.json(
      {
        version: 1,
        type: "error",
        status: "failed",
        code: failure.code,
        message: failure.message,
        exitCode: failure.exitCode,
      },
      status,
    );
  });
  routes.post("/prompt", async (context) => {
    const input = promptInput(await context.req.json().catch(() => undefined));
    return context.json(await operations.prompt(input), 202);
  });
  routes.get("/operations/:id", async (context) =>
    context.json(await operations.show(context.req.param("id"))),
  );
  routes.get("/operations/:id/wait", async (context) => {
    const onQuestion = context.req.query("onQuestion") ?? "fail";
    if (onQuestion !== "fail" && onQuestion !== "wait") {
      throw new HeadlessError("Question handling must be fail or wait.", "invalidInput", 2);
    }
    return context.json(
      await operations.wait(context.req.param("id"), onQuestion, context.req.raw.signal),
    );
  });
  return routes;
}

function promptInput(value: unknown): HeadlessPrompt {
  if (typeof value !== "object" || value === null || Array.isArray(value)) {
    throw new HeadlessError("A prompt requires a supported input object.", "invalidInput", 2);
  }
  if (
    Object.keys(value).some(
      (key) =>
        !["requestId", "text", "chatId", "project", "profile", "isLiteral", "onQuestion"].includes(
          key,
        ),
    )
  ) {
    throw new HeadlessError("The prompt has unknown fields.", "invalidInput", 2);
  }
  const input = value as Record<string, unknown>;
  if (
    typeof input.requestId !== "string" ||
    !/^[A-Za-z0-9._-]{1,128}$/.test(input.requestId) ||
    typeof input.text !== "string" ||
    input.text.trim() === "" ||
    (input.chatId !== undefined && (typeof input.chatId !== "string" || input.chatId === "")) ||
    (input.project !== undefined && typeof input.project !== "string") ||
    (input.chatId !== undefined && (input.project !== undefined || input.profile !== undefined)) ||
    (input.isLiteral !== undefined && typeof input.isLiteral !== "boolean") ||
    (input.onQuestion !== undefined && input.onQuestion !== "fail" && input.onQuestion !== "wait")
  ) {
    throw new HeadlessError(
      "The prompt input, target, or question handling is invalid.",
      "invalidInput",
      2,
    );
  }
  if (input.profile !== undefined) {
    try {
      validateChatSettings({ formatVersion: 1, profile: input.profile }, "Request body");
    } catch {
      throw new HeadlessError("The profile reference is invalid.", "invalidInput", 2);
    }
  }
  return input as unknown as HeadlessPrompt;
}
