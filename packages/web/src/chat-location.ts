/** Returns the chat chosen by this browser tab. */
export function chatIdFromUrl(url: URL): string | undefined {
  return url.searchParams.get("chat") || undefined;
}

/** Returns a URL that keeps this tab on its chosen chat after a reload. */
export function urlForChat(url: URL, id: string): URL {
  const next = new URL(url);
  next.searchParams.set("chat", id);
  return next;
}
