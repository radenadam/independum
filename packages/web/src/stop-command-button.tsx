import type { ReactElement } from "react";
import { IconButton } from "./icon-button.tsx";

/** Properties of the button that stops a command. */
interface StopCommandButtonProps {
  onStop: () => void;
}

/** Draws the button that stops one running command, while the reply goes on. */
export function StopCommandButton({ onStop }: StopCommandButtonProps): ReactElement {
  return (
    <IconButton
      icon="stopCommand"
      label="Stop this command"
      size="small"
      tipAlign="end"
      onClick={onStop}
    />
  );
}
