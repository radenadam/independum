import type { ProviderSummary } from "independum/api-types";
import type { ReactElement } from "react";
import { CommandButton } from "./command-button.tsx";
import { Greeting } from "./greeting.tsx";

/** Properties of the home screen. */
interface HomeScreenProps {
  providers: ProviderSummary[];
  onManageLogins: () => void;
}

/** Draws the home screen, which shows the connected providers until the chat exists. */
export function HomeScreen({ providers, onManageLogins }: HomeScreenProps): ReactElement {
  const connected = providers.filter((provider) => provider.login !== null);
  if (connected.length === 0) {
    return (
      <Greeting title="No model yet." lines={["Independum needs a model before it can chat."]}>
        <CommandButton shortcut="c" label="Connect a model" onClick={onManageLogins} />
      </Greeting>
    );
  }
  return (
    <Greeting
      title="Ready."
      lines={[`Connected to ${connected.map((provider) => provider.name).join(", ")}.`]}
    >
      <CommandButton shortcut="l" label="Manage logins" onClick={onManageLogins} />
    </Greeting>
  );
}
