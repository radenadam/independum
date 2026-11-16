import { expect, vi } from "vitest";
import { waitFor } from "../../../scripts/wait-for.ts";
import { followChats } from "./chat-api.ts";
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

/**
 * Drops the shared stream once and waits until it connects again, which tells every view that
 * loads data by itself to load it again, as after a server restart.
 */
export async function reconnectAfterDrop(): Promise<void> {
  const controllers = answerWithStreams();
  const connections: string[] = [];
  const stop = followChats(
    () => undefined,
    (connection) => connections.push(connection),
  );
  try {
    await waitFor(() => expect(controllers).toHaveLength(1));
    controllers[0]?.close();
    await waitFor(() => expect(connections).toEqual(["following", "reconnecting", "following"]));
  } finally {
    stop();
  }
}
