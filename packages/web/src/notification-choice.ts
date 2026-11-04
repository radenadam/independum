/** Whether Independum tells the user through the system when a reply is done, on this browser. */
export type NotificationChoice = "off" | "on";

const storageKey = "independum.notifications";

/** Returns what the browser allows: no notifications at all, not asked yet, allowed, or blocked. */
export function notificationPermission(): NotificationPermission | "unsupported" {
  return "Notification" in window ? Notification.permission : "unsupported";
}

/** Returns whether the user turned notifications on, while the browser still allows them. */
export function readNotificationChoice(): NotificationChoice {
  return localStorage.getItem(storageKey) === "on" && notificationPermission() === "granted"
    ? "on"
    : "off";
}

/**
 * Turns notifications on or off, and asks the browser first when they turn on, so they stay off
 * when the browser says no.
 */
export async function chooseNotifications(choice: NotificationChoice): Promise<NotificationChoice> {
  if (choice === "on" && notificationPermission() === "default") {
    await Notification.requestPermission();
  }
  const chosen = choice === "on" && notificationPermission() === "granted" ? "on" : "off";
  localStorage.setItem(storageKey, chosen);
  return chosen;
}

/**
 * Shows a notification through the system while Independum is not in front, when the user turned
 * them on, and brings Independum to the front when the user clicks it. A newer one with the same
 * tag takes the place of an older one.
 */
export function notify(title: string, body: string, tag: string): void {
  if (readNotificationChoice() !== "on") {
    return;
  }
  if (document.visibilityState === "visible" && document.hasFocus()) {
    return;
  }
  try {
    const notice = new Notification(title, { body, tag });
    notice.addEventListener("click", () => {
      window.focus();
      notice.close();
    });
  } catch {
    // Some phone browsers show notifications only from a service worker, which Independum does
    // not have yet, so there the notification does not show.
  }
}
