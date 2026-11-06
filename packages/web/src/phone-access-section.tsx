import type {
  PairedPhone,
  PhoneAccessState,
  PhoneConnection,
  PhoneInvitation,
} from "independum/api-types";
import { type ReactElement, useCallback, useEffect, useState } from "react";
import { BoxedList } from "./boxed-list.tsx";
import { ChoiceGroup } from "./choice-group.tsx";
import { ModalDialog } from "./modal-dialog.tsx";
import { PairingCode } from "./pairing-code.tsx";
import styles from "./phone-access-section.module.css";
import { PlaceNote } from "./place-frame.tsx";
import { PlaceSection } from "./place-section.tsx";
import { forgetAccessToken, isPhoneBrowser } from "./read-access-token.ts";
import { requestApi } from "./request-api.ts";
import { TextButton } from "./text-button.tsx";
import { TextField } from "./text-field.tsx";
import { usePolling } from "./use-polling.ts";

/** Configures private HTTPS access locally and lets phones manage only their own pairing. */
export function PhoneAccessSection(): ReactElement {
  const [state, setState] = useState<PhoneAccessState>();
  const [self, setSelf] = useState<PairedPhone>();
  const [name, setName] = useState("");
  const [failure, setFailure] = useState<string>();
  const [kind, setKind] = useState<PhoneConnection["kind"]>("proxy");
  const [address, setAddress] = useState("");
  const [origin, setOrigin] = useState("");
  const [port, setPort] = useState("4871");
  const [certificatePath, setCertificatePath] = useState("");
  const [keyPath, setKeyPath] = useState("");
  const [invitation, setInvitation] = useState<PhoneInvitation>();
  const [selected, setSelected] = useState<PairedPhone>();
  const isPhone = isPhoneBrowser();
  const load = useCallback((): void => {
    const request = isPhone
      ? phoneRequest<PairedPhone>("/api/phone/self").then(setSelf)
      : phoneRequest<PhoneAccessState>("/api/phone-access").then(setState);
    request.catch((error: unknown) => setFailure(messageOf(error)));
  }, [isPhone]);
  usePolling(load);
  useEffect(() => {
    if (state?.pairing === null) {
      setInvitation(undefined);
    }
  }, [state?.pairing]);

  function act(path: string, method: string, body?: unknown): void {
    setFailure(undefined);
    phoneRequest(path, method, body)
      .then(load)
      .catch((error: unknown) => setFailure(messageOf(error)));
  }

  function invite(): void {
    setFailure(undefined);
    phoneRequest<PhoneInvitation>("/api/phone-access/invitation", "POST")
      .then((value) => {
        setInvitation(value);
        load();
      })
      .catch((error: unknown) => setFailure(messageOf(error)));
  }

  function cancel(): void {
    const id = invitation?.id ?? state?.pairing?.id;
    setInvitation(undefined);
    if (id !== undefined) {
      act("/api/phone-access/invitation", "DELETE", { id });
    }
  }

  function select(phone: PairedPhone): void {
    setSelected(phone);
    setName(phone.name);
  }

  return (
    <>
      {failure === undefined ? null : <PlaceNote>{failure}</PlaceNote>}
      {isPhone ? (
        <PlaceSection heading="This browser">
          <PlaceNote>{self?.name ?? "Loading this browser."}</PlaceNote>
          <TextField
            id="self-phone-name"
            label="New browser name"
            value={name}
            onChange={setName}
          />
          <TextButton label="Save name" onClick={() => act("/api/phone/self", "PUT", { name })} />
          <TextButton
            label="Disconnect this browser"
            onClick={() => {
              requestApi("/api/phone/self", { method: "DELETE" })
                .catch(() => undefined)
                .finally(() => {
                  forgetAccessToken();
                  window.location.reload();
                });
            }}
          />
          <PlaceNote>Manage access and other paired browsers on the computer.</PlaceNote>
        </PlaceSection>
      ) : (
        <>
          <PlaceSection heading="Connection">
            <PlaceNote>
              {state?.connection === null
                ? "Phone access is off."
                : state?.connection === undefined
                  ? "Loading phone access."
                  : `Phone access is on at ${state.connection.origin}. Listening on ${state.connection.address}:${state.connection.port}.`}
            </PlaceNote>
            {state?.connection === null ? (
              <>
                <ChoiceGroup
                  label="Phone connection"
                  choices={[
                    { value: "proxy", label: "A route I run" },
                    { value: "certificate", label: "This network" },
                  ]}
                  current={kind}
                  onChoose={setKind}
                />
                {kind === "proxy" ? (
                  <>
                    <PlaceNote>
                      Choose a private HTTPS route that you control, such as Tailscale Serve. Set it
                      up on this computer to forward to the loopback backend shown below. Use Serve
                      for private access. Public forwarding and Tailscale Funnel are outside this
                      setup.
                    </PlaceNote>
                    <PlaceNote>
                      The proxy must keep authorization headers and send event streams as they
                      arrive. Its connection to this backend stays on this computer. Independum does
                      not install a route or verify its privacy.
                    </PlaceNote>
                  </>
                ) : (
                  <>
                    <PlaceNote>
                      Choose one address on your private network. Supply a certificate and key for
                      your HTTPS address. Your phone must already trust the certificate's issuer. Do
                      not dismiss certificate warnings. A private HTTPS route is easier if you have
                      no certificate.
                    </PlaceNote>
                    <PlaceNote>
                      For a private certificate, transfer its public trust certificate through a
                      trusted channel and verify its fingerprint before installing it. Never
                      transfer the private key. On iPhone, enable the installed certificate in
                      Settings, General, About, Certificate Trust Settings. On Android, use the
                      system certificate settings for browser server trust. Installing a root
                      certificate grants trust beyond Independum.
                    </PlaceNote>
                    <label className={styles.label} htmlFor="phone-address">
                      Private network address
                    </label>
                    <select
                      id="phone-address"
                      className={styles.select}
                      value={address}
                      onChange={(event) => setAddress(event.target.value)}
                    >
                      <option value="">Choose an address</option>
                      {state.addresses.map((entry) => (
                        <option key={`${entry.name}:${entry.address}`} value={entry.address}>
                          {entry.name}: {entry.address}
                        </option>
                      ))}
                    </select>
                    <TextField
                      id="phone-certificate"
                      label="Certificate file path"
                      value={certificatePath}
                      onChange={setCertificatePath}
                    />
                    <TextField
                      id="phone-key"
                      label="Private key file path"
                      value={keyPath}
                      onChange={setKeyPath}
                    />
                  </>
                )}
                <TextField
                  id="phone-origin"
                  label="Private HTTPS address"
                  placeholder="https://your-private-name"
                  value={origin}
                  onChange={setOrigin}
                />
                <TextField
                  id="phone-port"
                  label={kind === "proxy" ? "Loopback backend port" : "HTTPS listening port"}
                  kind="number"
                  value={port}
                  onChange={setPort}
                />
                {kind === "proxy" ? (
                  <PlaceNote>Proxy target: http://127.0.0.1:{port}</PlaceNote>
                ) : null}
                <TextButton
                  label="Enable phone access"
                  isPrimary
                  onClick={() =>
                    act("/api/phone-access", "PUT", {
                      kind,
                      address: kind === "proxy" ? "127.0.0.1" : address,
                      port: Number(port),
                      origin,
                      ...(kind === "certificate" ? { certificatePath, keyPath } : {}),
                    })
                  }
                />
              </>
            ) : state?.connection === undefined ? null : (
              <div className={styles.actions}>
                <TextButton label="Pair a device" onClick={invite} />
                <TextButton
                  label="Turn phone access off"
                  onClick={() => {
                    setInvitation(undefined);
                    act("/api/phone-access", "DELETE");
                  }}
                />
              </div>
            )}
            <PlaceNote>
              Access starts off on each launch. Pairings stay saved until revoked. A paired browser
              can drive the agent and its tools.
            </PlaceNote>
          </PlaceSection>
          <PlaceSection heading="Paired browsers">
            {state?.phones.length === 0 ? (
              <PlaceNote>No paired browsers.</PlaceNote>
            ) : (
              <BoxedList
                hasLongNames
                entries={(state?.phones ?? []).map((phone) => ({
                  key: phone.id,
                  name: phone.name,
                  detail: `Last seen ${new Date(phone.lastSeenAt).toLocaleString()}`,
                  onOpen: () => select(phone),
                  trailing: (
                    <TextButton
                      label="Revoke"
                      onClick={() => act(`/api/phone-access/phones/${phone.id}`, "DELETE")}
                    />
                  ),
                }))}
              />
            )}
            {selected === undefined ||
            !state?.phones.some((phone) => phone.id === selected.id) ? null : (
              <>
                <PlaceNote>Paired {new Date(selected.pairedAt).toLocaleString()}.</PlaceNote>
                <TextField
                  id="paired-phone-name"
                  label="Browser name"
                  value={name}
                  onChange={setName}
                />
                <TextButton
                  label="Save name"
                  onClick={() => act(`/api/phone-access/phones/${selected.id}`, "PUT", { name })}
                />
              </>
            )}
            {(state?.phones.length ?? 0) > 0 ? (
              <TextButton
                label="Disconnect all devices"
                onClick={() => act("/api/phone-access/phones", "DELETE")}
              />
            ) : null}
          </PlaceSection>
          <ModalDialog
            isOpen={invitation !== undefined || state?.pairing != null}
            label="Pair a device"
            className={styles.dialog}
            isFullOnPhone
            onClose={cancel}
          >
            <div className={styles.pairing}>
              <h3 className={styles.heading}>Pair a device</h3>
              {state?.pairing == null ? (
                <PlaceNote>This invitation has expired or was cancelled.</PlaceNote>
              ) : (
                <>
                  {invitation === undefined ? null : (
                    <>
                      <PlaceNote>
                        Scan this QR code or open the one-use address in the phone browser. It
                        expires at {new Date(invitation.expiresAt).toLocaleTimeString()}.
                      </PlaceNote>
                      <div className={styles.invitation}>
                        <img
                          className={styles.qr}
                          src={`data:image/svg+xml,${encodeURIComponent(invitation.qrSvg)}`}
                          alt="Pairing QR code"
                          width={240}
                          height={240}
                        />
                        <a className={styles.link} href={invitation.url}>
                          {invitation.url}
                        </a>
                      </div>
                      <TextButton
                        label="Copy pairing link"
                        onClick={() => {
                          navigator.clipboard
                            .writeText(invitation.url)
                            .catch(() => setFailure("The pairing link could not be copied."));
                        }}
                      />
                    </>
                  )}
                  {state.pairing.code === null ? (
                    <PlaceNote>Waiting for a phone to request pairing.</PlaceNote>
                  ) : (
                    <>
                      <PlaceNote>
                        {state.pairing.name} requests access. Approve only when the phone shows this
                        same code.
                      </PlaceNote>
                      <PairingCode code={state.pairing.code} />
                      {state.pairing.isApproved ? (
                        <PlaceNote>Approved. Waiting for the phone to connect.</PlaceNote>
                      ) : (
                        <TextButton
                          label="Approve matching code"
                          isPrimary
                          onClick={() => {
                            act("/api/phone-access/approve", "POST", {
                              id: state.pairing?.id,
                              code: state.pairing?.code,
                            });
                          }}
                        />
                      )}
                    </>
                  )}
                </>
              )}
              <TextButton label="Cancel pairing" onClick={cancel} />
            </div>
          </ModalDialog>
        </>
      )}
    </>
  );
}

async function phoneRequest<Value = void>(
  path: string,
  method = "GET",
  body?: unknown,
): Promise<Value> {
  const response = await requestApi(path, { method, ...(body === undefined ? {} : { body }) });
  if (response.status === 204) {
    return undefined as Value;
  }
  const value = await response.json();
  if (!response.ok) {
    throw new Error(value.error ?? "The phone access request failed.");
  }
  return value;
}

function messageOf(error: unknown): string {
  return error instanceof Error ? error.message : "The phone access request failed.";
}
