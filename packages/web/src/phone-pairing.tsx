import { type ReactElement, useEffect, useState } from "react";
import { ModalDialog } from "./modal-dialog.tsx";
import { PairingCode } from "./pairing-code.tsx";
import styles from "./phone-pairing.module.css";
import { PlaceNote } from "./place-frame.tsx";
import { rememberPhoneCredential } from "./read-access-token.ts";
import { TextButton } from "./text-button.tsx";
import { TextField } from "./text-field.tsx";

/** Shows the comparison code while the computer decides whether to approve this browser. */
export function PhonePairing({ invitation }: { invitation: string }): ReactElement {
  const [name, setName] = useState("Phone browser");
  const [claim, setClaim] = useState<{ receipt: string; code: string; expiresAt: number }>();
  const [failure, setFailure] = useState<string>();
  const [isClaiming, setIsClaiming] = useState(false);
  useEffect(() => {
    if (claim === undefined) {
      return;
    }
    const controller = new AbortController();
    let timer: ReturnType<typeof setTimeout>;
    async function poll(): Promise<void> {
      try {
        const response = await fetch("/api/pairing/receipt", {
          headers: { authorization: `Bearer ${claim?.receipt ?? ""}` },
          signal: controller.signal,
        });
        const body = await response.json();
        if (!response.ok) {
          throw new Error(body.error);
        }
        if (body.state === "approved" && typeof body.credential === "string") {
          rememberPhoneCredential(body.credential);
          window.location.reload();
          return;
        }
        timer = setTimeout(() => {
          poll();
        }, 1000);
      } catch (error) {
        if (!controller.signal.aborted) {
          setFailure(
            error instanceof Error ? error.message : "The pairing request could not connect.",
          );
        }
      }
    }
    poll();
    return () => {
      controller.abort();
      clearTimeout(timer);
    };
  }, [claim]);

  function begin(): void {
    if (isClaiming) {
      return;
    }
    setIsClaiming(true);
    fetch("/api/pairing/claim", {
      method: "POST",
      headers: { authorization: `Bearer ${invitation}`, "content-type": "application/json" },
      body: JSON.stringify({ name }),
    })
      .then(async (response) => {
        const body = await response.json();
        if (!response.ok) {
          throw new Error(body.error);
        }
        setClaim(body);
      })
      .catch((error: unknown) =>
        setFailure(error instanceof Error ? error.message : "The invitation could not be claimed."),
      )
      .finally(() => setIsClaiming(false));
  }

  return (
    <ModalDialog
      isOpen
      label="Pair this phone"
      className={styles.dialog}
      isFullOnPhone
      onClose={() => {
        window.location.reload();
      }}
    >
      <div className={styles.content}>
        <h2 className={styles.heading}>Pair this phone</h2>
        {failure !== undefined ? (
          <PlaceNote>{failure} Ask for a new pairing link on the computer.</PlaceNote>
        ) : claim === undefined ? (
          <>
            <PlaceNote>
              This browser gains access only after approval on the computer. A paired browser can
              drive the agent and its tools.
            </PlaceNote>
            <TextField id="phone-name" label="Browser name" value={name} onChange={setName} />
            {isClaiming ? (
              <PlaceNote>Requesting approval.</PlaceNote>
            ) : (
              <TextButton label="Request pairing" isPrimary onClick={begin} />
            )}
          </>
        ) : (
          <>
            <PlaceNote>
              Compare this code with the computer. Approve there only when both codes match.
            </PlaceNote>
            <PairingCode code={claim.code} />
            <PlaceNote>
              Waiting for approval. This request expires at{" "}
              {new Date(claim.expiresAt).toLocaleTimeString()}.
            </PlaceNote>
          </>
        )}
      </div>
    </ModalDialog>
  );
}
