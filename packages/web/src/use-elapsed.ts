import { useEffect, useState } from "react";

// A running timer moves this often.
const tickInterval = 100;

/** Returns how long ago something started, which counts up while it runs. */
export function useElapsed(startedAt: number | undefined, isRunning: boolean): number {
  const [now, setNow] = useState(() => Date.now());

  useEffect(() => {
    if (!isRunning) {
      return;
    }
    const timer = setInterval(() => setNow(Date.now()), tickInterval);
    return () => clearInterval(timer);
  }, [isRunning]);

  return startedAt === undefined ? 0 : Math.max(0, now - startedAt);
}
