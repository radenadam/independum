import type { Context } from "hono";
import { streamSSE } from "hono/streaming";

/**
 * Streams the given events and then every new one to the client, until the client leaves or a last
 * event arrives.
 */
export function streamEvents<StreamedEvent>(
  context: Context,
  first: StreamedEvent[] | (() => Promise<StreamedEvent[]>),
  subscribe: (listener: (event: StreamedEvent) => void) => () => void,
  isLast: (event: StreamedEvent) => boolean,
): Response {
  return streamSSE(context, async (stream) => {
    let writing = Promise.resolve();
    const { promise: finished, resolve: finish } = Promise.withResolvers<void>();
    function send(event: StreamedEvent): void {
      writing = writing.then(() => stream.writeSSE({ data: JSON.stringify(event) }));
      if (isLast(event)) {
        finish();
      }
    }
    // A snapshot can read files, so events that arrive while it loads wait behind it.
    const pending: StreamedEvent[] = [];
    let isReady = false;
    const unsubscribe = subscribe((event) => {
      if (isReady) {
        send(event);
      } else {
        pending.push(event);
      }
    });
    stream.onAbort(finish);
    try {
      for (const event of typeof first === "function" ? await first() : first) {
        send(event);
      }
      isReady = true;
      for (const event of pending) {
        send(event);
      }
      await finished;
    } finally {
      unsubscribe();
    }
    await writing;
  });
}
