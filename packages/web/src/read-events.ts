/**
 * Reads the server-sent events of a response and calls back with each one until the stream ends.
 */
export async function readEvents<StreamedEvent>(
  response: Response,
  onEvent: (event: StreamedEvent) => void,
): Promise<void> {
  if (response.body === null) {
    throw new Error("The response has no event stream.");
  }
  const reader = response.body.pipeThrough(new TextDecoderStream()).getReader();
  let buffer = "";
  for (let chunk = await reader.read(); !chunk.done; chunk = await reader.read()) {
    buffer += chunk.value;
    for (let end = buffer.indexOf("\n\n"); end !== -1; end = buffer.indexOf("\n\n")) {
      const data = buffer.slice(0, end).replace(/^data: ?/m, "");
      buffer = buffer.slice(end + 2);
      onEvent(JSON.parse(data) as StreamedEvent);
    }
  }
}
