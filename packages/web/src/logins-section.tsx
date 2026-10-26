import type { ProviderSummary } from "independum/api-types";
import { type ReactElement, useCallback, useEffect, useState } from "react";
import { fetchProviders, removeLogin } from "./login-api.ts";
import { LoginFlow } from "./login-flow.tsx";
import styles from "./logins-section.module.css";
import { MenuList } from "./menu-list.tsx";
import { ProviderLogo } from "./provider-logo.tsx";
import { TextButton } from "./text-button.tsx";
import { TextField } from "./text-field.tsx";

/** Properties of the logins section. */
interface LoginsSectionProps {
  onChanged: () => void;
}

/** What the logins section shows: the logins, the providers to add, or the sign-in of one. */
type View = { kind: "logins" } | { kind: "providers" } | { kind: "provider"; providerId: string };

/**
 * Draws the saved logins with a way to remove each, and the providers with their sign-in steps.
 */
export function LoginsSection({ onChanged }: LoginsSectionProps): ReactElement {
  const [providers, setProviders] = useState<ProviderSummary[] | undefined>();
  const [chosenView, setView] = useState<View | undefined>();
  const [query, setQuery] = useState("");

  const load = useCallback((): void => {
    fetchProviders().then(setProviders, () => setProviders([]));
  }, []);

  useEffect(load, [load]);

  function change(): void {
    load();
    onChanged();
  }

  if (providers === undefined) {
    return <p className={styles.note}>Loading the logins.</p>;
  }
  const logins = providers.filter((provider) => provider.login !== null);
  // Without a login there is nothing to list, so the section opens on the providers.
  const view = chosenView ?? (logins.length === 0 ? { kind: "providers" } : { kind: "logins" });

  if (view.kind === "provider") {
    const provider = providers.find((candidate) => candidate.id === view.providerId);
    return (
      <div className={styles.section}>
        <TextButton label="Back to providers" onClick={() => setView({ kind: "providers" })} />
        {provider === undefined ? null : (
          <LoginFlow
            key={provider.id}
            provider={provider}
            onChanged={change}
            onDone={() => setView({ kind: "logins" })}
          />
        )}
      </div>
    );
  }

  if (view.kind === "providers") {
    const search = query.trim().toLowerCase();
    const shown = providers.filter((provider) => provider.name.toLowerCase().includes(search));
    return (
      <div className={styles.section}>
        {logins.length === 0 ? (
          <p className={styles.note}>
            Choose the provider you use. Independum reaches its models through this login.
          </p>
        ) : (
          <TextButton label="Back to logins" onClick={() => setView({ kind: "logins" })} />
        )}
        <TextField
          id="provider-search"
          label="Search providers"
          kind="search"
          value={query}
          onChange={setQuery}
          isFocusedFirst
        />
        <MenuList
          groups={[
            {
              key: "providers",
              heading: `${providers.length} providers`,
              choices: shown.map((provider) => ({
                key: provider.id,
                name: provider.name,
                detail: provider.login === null ? methodsOf(provider) : "connected",
                logo: <ProviderLogo providerId={provider.id} size={18} keepsSpace />,
                isCurrent: false,
                onChoose: () => setView({ kind: "provider", providerId: provider.id }),
              })),
            },
          ]}
          layout="row"
          emptyNote="No provider matches that search."
        />
      </div>
    );
  }

  return (
    <div className={styles.section}>
      <p className={styles.note}>
        Independum reaches models through these logins. Pi keeps them on this machine, in
        ~/.independum.
      </p>
      <ul className={styles.logins}>
        {logins.map((provider) => (
          <li key={provider.id} className={styles.login}>
            <ProviderLogo providerId={provider.id} size={20} keepsSpace />
            <span className={styles.text}>
              <span className={styles.name}>{provider.name}</span>
              <span className={styles.method}>
                {provider.login?.method === "account"
                  ? (provider.account?.label ?? "Account")
                  : "API key"}
              </span>
            </span>
            <span className={styles.connected}>connected</span>
            <span>
              <TextButton
                label="Remove"
                onClick={() => {
                  removeLogin(provider.id).then(change, change);
                }}
              />
            </span>
          </li>
        ))}
      </ul>
      <TextButton icon="add" label="Add a login" onClick={() => setView({ kind: "providers" })} />
    </div>
  );
}

function methodsOf(provider: ProviderSummary): string {
  const methods = [
    provider.account === null ? undefined : "account",
    provider.apiKey?.canLogIn === true ? "API key" : undefined,
  ];
  return methods.filter((method) => method !== undefined).join(", ");
}
