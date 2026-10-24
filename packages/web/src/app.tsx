import { type ReactElement, useEffect, useState } from "react";
import { readAccessToken } from "./access-token.ts";
import { Mark } from "./mark.tsx";
import { requestApi } from "./request-api.ts";

type Connection = "checking" | "connected" | "needsLink" | "restarted" | "unreachable";

const connectionMessages: Record<Connection, string> = {
  checking: "Connecting.",
  connected: "Connected.",
  needsLink: "Open the link that Independum printed in your terminal.",
  restarted: "Independum restarted. Open the new link from your terminal.",
  unreachable:
    "Independum is not running. Start it from your terminal, then open the link it prints.",
};

export function App(): ReactElement {
  const [connection, setConnection] = useState<Connection>("checking");

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
    <main>
      <h1>
        <Mark /> Independum
      </h1>
      <p>{connectionMessages[connection]}</p>
    </main>
  );
}

// A 401 means the server no longer knows this token, which happens after every restart.
function connectionFor(response: Response): Connection {
  if (response.ok) {
    return "connected";
  }
  return response.status === 401 ? "restarted" : "unreachable";
}
