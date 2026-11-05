/** Registers one listener and returns its independent unsubscribe function. */
export function subscribeTo<Value>(
  listeners: Set<(value: Value) => void>,
  listener: (value: Value) => void,
): () => void {
  listeners.add(listener);
  return () => {
    listeners.delete(listener);
  };
}
