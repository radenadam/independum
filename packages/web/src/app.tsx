import { type ReactElement, useEffect, useState } from "react";
import { readAccessToken } from "./access-token.ts";
import styles from "./app.module.css";
import { RisingMark } from "./mark.tsx";
import { requestApi } from "./request-api.ts";
import { TopBar } from "./top-bar.tsx";

type Connection = "checking" | "connected" | "needsLink" | "restarted" | "unreachable";

/** What a connection state shows: its place in the top bar, a title, and one line under it. */
interface ConnectionScreen {
  location: string;
  title: string;
  line: string;
}

const connectionScreens: Record<Connection, ConnectionScreen> = {
  checking: { location: "connecting", title: "", line: "" },
  connected: { location: "home", title: "Hello.", line: "Independum is connected and ready." },
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
  const screen = connectionScreens[connection];

  useEffect(() => {
    if (readAccessToken() === undefined) {
      setConnection("needsLink");
      return;
    }
    requestApi("/api/health").then(
      (response) => setConnection(connectionFor(response)),
      () => setConnection("unreachable"),
    );
  }, []);

  return (
    <div className={styles.page}>
      <div className={styles.glow} aria-hidden="true" />
      <TopBar location={screen.location} />
      <main className={styles.main}>
        {connection === "checking" ? null : (
          <div className={styles.column}>
            <RisingMark />
            <div className={styles.text}>
              <h1 className={styles.title}>{screen.title}</h1>
              <p className={styles.line}>{screen.line}</p>
            </div>
          </div>
        )}
      </main>
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
