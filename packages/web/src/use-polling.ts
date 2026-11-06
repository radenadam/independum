import { useEffect } from "react";

/** Loads current settings immediately and once each second until the view leaves. */
export function usePolling(load: () => void): void {
  useEffect(() => {
    load();
    const timer = setInterval(load, 1000);
    return () => clearInterval(timer);
  }, [load]);
}
