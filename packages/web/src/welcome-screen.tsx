import type { ReactElement } from "react";
import { CommandButton } from "./command-button.tsx";
import { Greeting } from "./greeting.tsx";

/** Properties of the welcome screen. */
interface WelcomeScreenProps {
  onGetStarted: () => void;
  onLookAround: () => void;
}

/** Draws the greeting a new user sees, with the choice to log in or to look around first. */
export function WelcomeScreen({ onGetStarted, onLookAround }: WelcomeScreenProps): ReactElement {
  return (
    <Greeting
      title="Hello."
      lines={[
        "This is Independum.",
        "An agent harness with nothing hidden.",
        "Every part of it is text you can read and change.",
      ]}
    >
      <CommandButton shortcut="1" label="Get started" onClick={onGetStarted} />
      <CommandButton shortcut="2" label="Just look around" onClick={onLookAround} isQuiet />
    </Greeting>
  );
}
