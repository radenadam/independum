import { useEffect, useState } from "react";
import { useReconnections } from "./use-reconnections.ts";

/**
 * Returns what a view loads from the server and why its last load failed, and loads it again when
 * the load or version changes, a reload is asked for, or the UI reaches the server again.
 */
export function useServerData<Data>(
  load: (() => Promise<Data>) | undefined,
  version: unknown = 0,
  scope: unknown = undefined,
): { data: Data | undefined; failure: string | undefined; reload: () => void } {
  const [loaded, setLoaded] = useState<{
    scope: unknown;
    data: Data | undefined;
    failure: string | undefined;
  }>({ scope, data: undefined, failure: undefined });
  const [reloads, setReloads] = useState(0);
  const reconnections = useReconnections();

  // A reload in the same scope, such as the same chat, keeps what the view shows until an answer
  // arrives, and a later success clears an earlier failure, so an open view recovers in place.
  // Another scope starts empty.
  // biome-ignore lint/correctness/useExhaustiveDependencies: Version, reloads, and reconnection load again.
  useEffect(() => {
    if (load === undefined) {
      return;
    }
    let isCurrent = true;
    setLoaded((current) =>
      Object.is(current.scope, scope) ? current : { scope, data: undefined, failure: undefined },
    );
    load().then(
      (data) => {
        if (isCurrent) {
          setLoaded({ scope, data, failure: undefined });
        }
      },
      (error: unknown) => {
        if (isCurrent) {
          setLoaded((current) => ({
            scope,
            data: Object.is(current.scope, scope) ? current.data : undefined,
            failure: error instanceof Error ? error.message : String(error),
          }));
        }
      },
    );
    return () => {
      isCurrent = false;
    };
  }, [load, version, scope, reloads, reconnections]);

  const isCurrentScope = Object.is(loaded.scope, scope);
  return {
    data: isCurrentScope ? loaded.data : undefined,
    failure: isCurrentScope ? loaded.failure : undefined,
    reload: () => setReloads((current) => current + 1),
  };
}
