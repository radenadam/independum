import type { ProviderSummary } from "independum/api-types";
import { type ReactElement, useState } from "react";
import { CommandButton } from "./command-button.tsx";
import styles from "./connect-screen.module.css";
import { LoginPanel } from "./login-panel.tsx";
import { PickList } from "./pick-list.tsx";
import { ScreenHeading } from "./screen-heading.tsx";
import { ScreenLayout } from "./screen-layout.tsx";
import { TextField } from "./text-field.tsx";

/** Properties of the connect screen. */
interface ConnectScreenProps {
  providers: ProviderSummary[];
  onProvidersChanged: () => void;
  onDone: () => void;
}

/** Draws the provider list with a search field, and the sign-in options of the chosen provider. */
export function ConnectScreen({
  providers,
  onProvidersChanged,
  onDone,
}: ConnectScreenProps): ReactElement {
  const [query, setQuery] = useState("");
  const [pickedId, setPickedId] = useState<string | undefined>();
  const search = query.trim().toLowerCase();
  const shown = providers.filter((provider) => provider.name.toLowerCase().includes(search));
  const picked = providers.find((provider) => provider.id === pickedId);

  return (
    <ScreenLayout
      aside={<CommandButton shortcut="b" label="Back" onClick={onDone} isQuiet isBack />}
    >
      <div className={styles.grid}>
        <div className={styles.head}>
          <ScreenHeading
            title="Connect a model."
            intro="Pick the provider you use. You can add more later, and change or remove any login at any time."
          />
        </div>
        <div className={styles.search}>
          <TextField
            id="provider-search"
            label="search providers"
            value={query}
            onChange={setQuery}
            placeholder="type a name"
          />
        </div>
        <div className={styles.list}>
          <PickList
            entries={shown.map((provider) => ({
              id: provider.id,
              name: provider.name,
              detail: provider.login === null ? methodsOf(provider) : "logged in",
              isDetailMarked: provider.login !== null,
            }))}
            pickedId={pickedId}
            onPick={setPickedId}
          />
          {shown.length === 0 ? (
            <p className={styles.note}>No provider matches that search.</p>
          ) : null}
          <p className={styles.note}>
            {shown.length === providers.length
              ? `${providers.length} providers.`
              : `${shown.length} of ${providers.length} providers.`}
          </p>
        </div>
        <div className={styles.detail}>
          {picked === undefined ? (
            <p className={styles.hint}>
              Choose a provider.
              <br />
              Its sign-in options appear here.
            </p>
          ) : (
            <LoginPanel
              key={picked.id}
              provider={picked}
              onClose={() => setPickedId(undefined)}
              onChanged={onProvidersChanged}
              onDone={onDone}
            />
          )}
        </div>
      </div>
    </ScreenLayout>
  );
}

function methodsOf(provider: ProviderSummary): string {
  const methods = [
    provider.account === null ? undefined : "account",
    provider.apiKey?.canLogIn === true ? "api key" : undefined,
  ];
  return methods.filter((method) => method !== undefined).join(", ");
}
