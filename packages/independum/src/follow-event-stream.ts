/** A stream of server-sent events that a test reads one event at a time. */
export interface EventStreamReader<StreamedEvent> {
  next(): Promise<StreamedEvent>;
  close(): Promise<void>;
}

/** Reads the server-sent events of a response one at a time, for tests. */
export function followEventStream<StreamedEvent>(
  response: Response,
): EventStreamReader<StreamedEvent> {
  if (response.body === null) {
    throw new Error("The response has no event stream.");
  }
  const reader = response.body.getReader();
  const decoder = new TextDecoder();
  let buffer = "";
  return {
    async next() {
      while (!buffer.includes("\n\n")) {
        const { value, done } = await reader.read();
        if (done) {
          throw new Error("The event stream ended early.");
        }
        buffer += decoder.decode(value, { stream: true });
      }
      const end = buffer.indexOf("\n\n");
      const data = buffer.slice(0, end).replace(/^data: ?/m, "");
      buffer = buffer.slice(end + 2);
      return JSON.parse(data) as StreamedEvent;
    },
    close: () => reader.cancel(),
  };
}
