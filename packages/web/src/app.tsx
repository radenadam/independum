import type { ProviderSummary } from "independum/api-types";
import { type ReactElement, useCallback, useEffect, useState } from "react";
import { readAccessToken } from "./access-token.ts";
import styles from "./app.module.css";
import { hasBeenGreeted, rememberGreeting } from "./first-launch.ts";
import { Greeting } from "./greeting.tsx";
import { fetchProviders } from "./login-api.ts";
import { requestApi } from "./request-api.ts";
import { TopBar } from "./top-bar.tsx";
import { WelcomeScreen } from "./welcome-screen.tsx";
import { WorkingScreen } from "./working-screen.tsx";

type Connection = "checking" | "connected" | "needsLink" | "expiredLink" | "unreachable";
type Screen = "welcome" | "working";

/** What a connection problem shows: its place in the top bar, a title, and one line under it. */
interface ConnectionProblem {
  location: string;
  title: string;
  line: string;
}

const connectionProblems: Record<"needsLink" | "expiredLink" | "unreachable", ConnectionProblem> = {
  needsLink: {
    location: "link",
    title: "Hello.",
    line: "Open the link that Independum printed in your terminal.",
  },
  expiredLink: {
    location: "expired link",
    title: "This link has expired.",
    line: "Independum makes a new link each time it starts. Open the newest link from your terminal.",
  },
  unreachable: {
    location: "offline",
    title: "Not running.",
    line: "Start Independum from your terminal, then open the link it prints.",
  },
};

export function App(): ReactElement {
  const [connection, setConnection] = useState<Connection>("checking");
  const [screen, setScreen] = useState<Screen | undefined>();
  const [startsWithLogins, setStartsWithLogins] = useState(false);

  // A user who has a login or has seen the greeting goes straight to the working screen.
  const chooseScreen = useCallback((): void => {
    fetchProviders().then(
      (loaded) => setScreen(hasLogin(loaded) || hasBeenGreeted() ? "working" : "welcome"),
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
          chooseScreen();
        }
      },
      () => setConnection("unreachable"),
    );
  }, [chooseScreen]);

  const expireLink = useCallback((): void => setConnection("expiredLink"), []);

  function greetAndGo(isLoggingIn: boolean): void {
    rememberGreeting();
    setStartsWithLogins(isLoggingIn);
    setScreen("working");
  }

  if (connection === "connected" && screen === "working") {
    return (
      <div className={styles.page}>
        <WorkingScreen startsWithLogins={startsWithLogins} onExpiredLink={expireLink} />
      </div>
    );
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
      ) : screen === undefined ? null : (
        <>
          <TopBar location="welcome" />
          <WelcomeScreen
            onGetStarted={() => greetAndGo(true)}
            onLookAround={() => greetAndGo(false)}
          />
        </>
      )}
    </div>
  );
}

// A 401 means the server does not know this token. Either Independum started again since the
// link was printed, or the link was copied only in part.
function connectionFor(response: Response): Connection {
  if (response.ok) {
    return "connected";
  }
  return response.status === 401 ? "expiredLink" : "unreachable";
}

function hasLogin(providers: ProviderSummary[]): boolean {
  return providers.some((provider) => provider.login !== null);
}
