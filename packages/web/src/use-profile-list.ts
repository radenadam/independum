import { useEffect, useState } from "react";
import { fetchProfiles, type ProfileList } from "./profile-api.ts";
import { useReconnections } from "./use-reconnections.ts";

/**
 * Returns the profiles that a project can choose, or why they did not load, and loads them again
 * when the version changes, a reload is asked for, or the UI reaches the server again.
 */
export function useProfileList(
  projectId: string | undefined,
  version = 0,
): { list: ProfileList | undefined; failure: string | undefined; reload: () => void } {
  const [loaded, setLoaded] = useState<{
    list: ProfileList | undefined;
    failure: string | undefined;
  }>({ list: undefined, failure: undefined });
  const [reloads, setReloads] = useState(0);
  const reconnections = useReconnections();

  // biome-ignore lint/correctness/useExhaustiveDependencies: Version, reloads, and reconnection refresh the profile files.
  useEffect(() => {
    let isCurrent = true;
    fetchProfiles(projectId).then(
      (list) => {
        if (isCurrent) {
          setLoaded({ list, failure: undefined });
        }
      },
      (error: unknown) => {
        if (isCurrent) {
          setLoaded((current) => ({ ...current, failure: String(error) }));
        }
      },
    );
    return () => {
      isCurrent = false;
    };
  }, [projectId, version, reloads, reconnections]);

  return { ...loaded, reload: () => setReloads((current) => current + 1) };
}
