import type { ReactElement } from "react";
import { CommandButton } from "./command-button.tsx";
import { Greeting } from "./greeting.tsx";

/** Properties of the home screen. */
interface HomeScreenProps {
  onConnect: () => void;
}

/** Draws the home screen before any login, which points the user to the login screen. */
export function HomeScreen({ onConnect }: HomeScreenProps): ReactElement {
  return (
    <Greeting title="No model yet." lines={["Independum needs a model before it can chat."]}>
      <CommandButton shortcut="c" label="Connect a model" onClick={onConnect} />
    </Greeting>
  );
}
