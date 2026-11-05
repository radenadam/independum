import type { ProfileReference, ProfileResource } from "independum/api-types";
import { type ReactElement, useState } from "react";
import { MenuList } from "./menu-list.tsx";
import { PlaceNote } from "./place-frame.tsx";
import { Popover } from "./popover.tsx";
import styles from "./profile-selector.module.css";
import { TextButton } from "./text-button.tsx";
import { TextField } from "./text-field.tsx";

interface ProfileSelectorProps {
  label: string;
  profiles: ProfileResource[];
  current: ProfileReference | null;
  hasUserDefault?: boolean;
  onChoose: (reference: ProfileReference | null) => void;
}

/** Draws a searchable profile menu with an explicit scope for every choice. */
export function ProfileSelector({
  label,
  profiles,
  current,
  hasUserDefault = false,
  onChoose,
}: ProfileSelectorProps): ReactElement {
  const [isOpen, setIsOpen] = useState(false);
  const [query, setQuery] = useState("");
  const shown = profiles.filter((profile) =>
    `${profile.document?.profile.name ?? profile.reference.id} ${profile.reference.scope}`
      .toLowerCase()
      .includes(query.toLowerCase()),
  );
  const selected = profiles.find(
    (profile) => profile.reference.scope === current?.scope && profile.reference.id === current.id,
  );
  function choose(reference: ProfileReference | null): void {
    setIsOpen(false);
    onChoose(reference);
  }
  return (
    <div className={styles.selector}>
      <TextButton
        label={`${label}: ${current === null ? "Use user default" : (selected?.document?.profile.name ?? current.id)}`}
        onClick={() => setIsOpen(true)}
      />
      {isOpen ? (
        <Popover label={label} place="below" onClose={() => setIsOpen(false)}>
          <TextField
            id="profile-search"
            label="Search profiles"
            kind="search"
            value={query}
            onChange={setQuery}
            isFocusedFirst
          />
          <MenuList
            groups={[
              ...(hasUserDefault
                ? [
                    {
                      key: "default",
                      choices: [
                        {
                          key: "default",
                          name: "Use user default",
                          isCurrent: current === null,
                          onChoose: () => choose(null),
                        },
                      ],
                    },
                  ]
                : []),
              ...(["user", "project"] as const).map((scope) => ({
                key: scope,
                heading: scope === "user" ? "User profiles" : "Project profiles",
                choices: shown
                  .filter(
                    (profile) => profile.reference.scope === scope && profile.issues.length === 0,
                  )
                  .map((profile) => ({
                    key: profile.reference.id,
                    name: profile.document?.profile.name ?? profile.reference.id,
                    detail: `${scope} profile, ${profile.reference.id}`,
                    isCurrent:
                      profile.reference.scope === current?.scope &&
                      profile.reference.id === current.id,
                    onChoose: () => choose(profile.reference),
                  })),
              })),
            ]}
            layout="stacked"
            emptyNote="No profiles match."
          />
          {shown
            .filter((profile) => profile.issues.length > 0)
            .map((profile) => (
              <PlaceNote key={`${profile.reference.scope}:${profile.reference.id}`}>
                {profile.reference.scope} profile {profile.reference.id}:{" "}
                {profile.issues[0]?.message}
              </PlaceNote>
            ))}
        </Popover>
      ) : null}
    </div>
  );
}
