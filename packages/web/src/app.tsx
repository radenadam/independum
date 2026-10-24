import type { ProviderSummary } from "independum/api-types";
import { type ReactElement, useCallback, useEffect, useState } from "react";
import { readAccessToken } from "./access-token.ts";
import styles from "./app.module.css";
import { ConnectScreen } from "./connect-screen.tsx";
import { hasBeenGreeted, rememberGreeting } from "./first-launch.ts";
import { Greeting } from "./greeting.tsx";
import { HomeScreen } from "./home-screen.tsx";
import { fetchProviders } from "./login-api.ts";
import { requestApi } from "./request-api.ts";
import { TopBar } from "./top-bar.tsx";
import { WelcomeScreen } from "./welcome-screen.tsx";

type Connection = "checking" | "connected" | "needsLink" | "restarted" | "unreachable";
type Screen = "welcome" | "connect" | "home";

/** What a connection problem shows: its place in the top bar, a title, and one line under it. */
interface ConnectionProblem {
  location: string;
  title: string;
  line: string;
}

const connectionProblems: Record<"needsLink" | "restarted" | "unreachable", ConnectionProblem> = {
  needsLink: {
    location: "link",
    title: "Hello.",
    line: "Open the link that Independum printed in your terminal.",
  },
  restarted: {
    location: "restarted",
    title: "Welcome back.",
    line: "Independum restarted. Open the new link from your terminal.",
  },
  unreachable: {
    location: "offline",
    title: "Not running.",
    line: "Start Independum from your terminal, then open the link it prints.",
  },
};

export function App(): ReactElement {
  const [connection, setConnection] = useState<Connection>("checking");
  const [providers, setProviders] = useState<ProviderSummary[] | undefined>();
  const [screen, setScreen] = useState<Screen | undefined>();

  const loadProviders = useCallback((): void => {
    fetchProviders().then(
      (loaded) => {
        setProviders(loaded);
        setScreen(
          (current) =>
            current ??
            (loaded.some((provider) => provider.login !== null) || hasBeenGreeted()
              ? "home"
              : "welcome"),
        );
      },
      () => setConnection("unreachable"),
    );
  }, []);

  useEffect(() => {
    if (readAccessToken() === undefined) {
      setConnection("needsLink");
      return;
    }
    requestApi("/api/health").then(
      (response) => {
        const next = connectionFor(response);
        setConnection(next);
        if (next === "connected") {
          loadProviders();
        }
      },
      () => setConnection("unreachable"),
    );
  }, [loadProviders]);

  function greetAndGo(next: Screen): void {
    rememberGreeting();
    setScreen(next);
  }

  return (
    <div className={styles.page}>
      <div className={styles.glow} aria-hidden="true" />
      {connection === "checking" ? null : connection !== "connected" ? (
        <>
          <TopBar location={connectionProblems[connection].location} />
          <Greeting
            title={connectionProblems[connection].title}
            lines={[connectionProblems[connection].line]}
          />
        </>
      ) : screen === undefined || providers === undefined ? null : (
        <>
          <TopBar location={screen} />
          {screen === "welcome" ? (
            <WelcomeScreen
              onGetStarted={() => greetAndGo("connect")}
              onLookAround={() => greetAndGo("home")}
            />
          ) : null}
          {screen === "connect" ? (
            <ConnectScreen
              providers={providers}
              onProvidersChanged={loadProviders}
              onDone={() => setScreen("home")}
            />
          ) : null}
          {screen === "home" ? (
            <HomeScreen providers={providers} onManageLogins={() => setScreen("connect")} />
          ) : null}
        </>
      )}
    </div>
  );
}

// A 401 means the server no longer knows this token, which happens after every restart.
function connectionFor(response: Response): Connection {
  if (response.ok) {
    return "connected";
  }
  return response.status === 401 ? "restarted" : "unreachable";
}
