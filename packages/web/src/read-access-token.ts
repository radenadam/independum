const storageKey = "independum.accessToken";
const phoneKey = "independum.isPhone";

/** Returns the access token from the link or from storage, and removes it from the address bar. */
export function readAccessToken(): string | undefined {
  const fromLink = new URLSearchParams(window.location.hash.slice(1)).get("token");
  if (fromLink !== null) {
    history.replaceState(null, "", window.location.pathname + window.location.search);
    localStorage.setItem(storageKey, fromLink);
    localStorage.removeItem(phoneKey);
    return fromLink;
  }
  return localStorage.getItem(storageKey) ?? undefined;
}

/** Removes a one-use pairing invitation from browser history before starting its claim. */
export function readPairingInvitation(): string | undefined {
  const invitation = new URLSearchParams(window.location.hash.slice(1)).get("pair");
  if (invitation === null) {
    return undefined;
  }
  history.replaceState(null, "", window.location.pathname + window.location.search);
  return invitation;
}

/** Saves the credential issued to this browser after local approval. */
export function rememberPhoneCredential(credential: string): void {
  localStorage.setItem(storageKey, credential);
  localStorage.setItem(phoneKey, "true");
}

/** Returns whether this browser last authenticated through phone pairing. */
export function isPhoneBrowser(): boolean {
  return localStorage.getItem(phoneKey) === "true";
}

/** Removes this browser's credential when it disconnects itself. */
export function forgetAccessToken(): void {
  localStorage.removeItem(storageKey);
}
