import type { ProviderSummary } from "independum/api-types";
import { type ReactElement, useCallback, useEffect, useState } from "react";
import styles from "./app.module.css";
import { hasBeenGreeted, rememberGreeting } from "./first-launch.ts";
import { Greeting } from "./greeting.tsx";
import { fetchProviders } from "./login-api.ts";
import { PhonePairing } from "./phone-pairing.tsx";
import { isPhoneBrowser, readAccessToken, readPairingInvitation } from "./read-access-token.ts";
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
  const [invitation] = useState(readPairingInvitation);
  const [connection, setConnection] = useState<Connection>("checking");
  const [screen, setScreen] = useState<Screen | undefined>();
  const [startsWithLogins, setStartsWithLogins] = useState(false);

  // A user who has a login or has seen the greeting goes straight to the working screen.
  const chooseScreen = useCallback((): void => {
    fetchProviders().then(
      (loaded) =>
        setScreen(hasLogin(loaded) || hasBeenGreeted() || isPhoneBrowser() ? "working" : "welcome"),
      () => setConnection("unreachable"),
    );
  }, []);

  useEffect(() => {
    if (invitation !== undefined) {
      return;
    }
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
  }, [chooseScreen, invitation]);

  const expireLink = useCallback((): void => setConnection("expiredLink"), []);

  function greetAndGo(isLoggingIn: boolean): void {
    rememberGreeting();
    setStartsWithLogins(isLoggingIn);
    setScreen("working");
  }

  if (invitation !== undefined) {
    return <PhonePairing invitation={invitation} />;
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
            title={
              isPhoneBrowser()
                ? connection === "unreachable"
                  ? "Cannot connect."
                  : "This browser needs pairing."
                : connectionProblems[connection].title
            }
            lines={[
              isPhoneBrowser()
                ? connection === "unreachable"
                  ? "Check that Independum is running on the computer and phone access is enabled."
                  : "Open a new pairing link from Phone access in Settings on the computer."
                : connectionProblems[connection].line,
            ]}
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

// A 401 means the browser credential is absent, expired, or revoked.
function connectionFor(response: Response): Connection {
  if (response.ok) {
    return "connected";
  }
  return response.status === 401 ? "expiredLink" : "unreachable";
}

function hasLogin(providers: ProviderSummary[]): boolean {
  return providers.some((provider) => provider.login !== null);
}
