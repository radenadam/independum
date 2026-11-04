import { type ReactElement, useState } from "react";
import {
  chooseNotifications,
  notificationPermission,
  readNotificationChoice,
} from "./notification-choice.ts";
import { SettingChoice } from "./setting-choice.tsx";

/** Draws the notification settings, which today hold whether a done reply shows one. */
export function NotificationsSection(): ReactElement {
  const [current, setCurrent] = useState(readNotificationChoice);
  const permission = notificationPermission();

  return (
    <SettingChoice
      label="When a reply is done"
      choices={[
        { value: "off", label: "Off" },
        { value: "on", label: "On" },
      ]}
      current={current}
      note={
        permission === "unsupported"
          ? "This browser cannot show notifications."
          : permission === "denied"
            ? "The browser blocks notifications from Independum. Allow them in the settings of this site, then turn them on."
            : "Independum tells you through the system when a reply ends while its window is not in front, with the title of the chat and the start of the reply. It asks the browser first."
      }
      onChoose={(choice) => {
        chooseNotifications(choice).then(setCurrent, () => setCurrent("off"));
      }}
    />
  );
}
