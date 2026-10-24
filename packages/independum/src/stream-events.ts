import type { Context } from "hono";
import { streamSSE } from "hono/streaming";

/**
 * Streams the given events and then every new one to the client, until the client leaves or a last
 * event arrives.
 */
export function streamEvents<StreamedEvent>(
  context: Context,
  first: StreamedEvent[],
  subscribe: (listener: (event: StreamedEvent) => void) => () => void,
  isLast: (event: StreamedEvent) => boolean,
): Response {
  return streamSSE(context, async (stream) => {
    let writing = Promise.resolve();
    let unsubscribe: (() => void) | undefined;
    await new Promise<void>((resolve) => {
      function send(event: StreamedEvent): void {
        writing = writing.then(() => stream.writeSSE({ data: JSON.stringify(event) }));
        if (isLast(event)) {
          resolve();
        }
      }
      for (const event of first) {
        send(event);
      }
      unsubscribe = subscribe(send);
      stream.onAbort(resolve);
    });
    unsubscribe?.();
    await writing;
  });
}
