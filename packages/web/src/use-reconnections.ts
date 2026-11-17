import { useEffect, useState } from "react";
import { followReconnections } from "./chat-api.ts";

/**
 * Returns a number that changes each time the UI reaches the server again after it was away, so
 * data that a view loads by itself can load again.
 */
export function useReconnections(): number {
  const [count, setCount] = useState(0);
  useEffect(() => followReconnections(() => setCount((current) => current + 1)), []);
  return count;
}
