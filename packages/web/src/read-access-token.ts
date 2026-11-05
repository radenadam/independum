const storageKey = "independum.accessToken";

/** Returns the access token from the link or from storage, and removes it from the address bar. */
export function readAccessToken(): string | undefined {
  const fromLink = new URLSearchParams(window.location.hash.slice(1)).get("token");
  if (fromLink !== null) {
    history.replaceState(null, "", window.location.pathname + window.location.search);
    localStorage.setItem(storageKey, fromLink);
    return fromLink;
  }
  return localStorage.getItem(storageKey) ?? undefined;
}
