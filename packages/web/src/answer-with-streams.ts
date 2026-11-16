import { vi } from "vitest";
import { requestApi } from "./request-api.ts";

/**
 * Answers each request of a test with an event stream that stays open until the test ends it or
 * the request stops, and returns the controllers of those streams in request order.
 */
export function answerWithStreams(): ReadableStreamDefaultController<Uint8Array>[] {
  const controllers: ReadableStreamDefaultController<Uint8Array>[] = [];
  vi.mocked(requestApi).mockImplementation(async (_path, options) => {
    const body = new ReadableStream<Uint8Array>({
      start(controller) {
        controllers.push(controller);
        options?.signal?.addEventListener("abort", () => controller.error(new Error("Stopped.")));
      },
    });
    return new Response(body);
  });
  return controllers;
}
