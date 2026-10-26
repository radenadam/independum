import { type CSSProperties, type ReactElement, useEffect, useState } from "react";
import { findProviderLogo } from "./find-provider-logo.ts";
import styles from "./provider-logo.module.css";

/** Properties of a provider logo. */
interface ProviderLogoProps {
  providerId: string;
  size: number;
  keepsSpace?: boolean;
}

const folder = "/node_modules/@lobehub/icons-static-svg/icons/";
// The files load one by one when a logo first shows, so the page never fetches all of them. Knip
// cannot see a package that only a glob names, so `knip.json` lists it.
const logoFiles = import.meta.glob<string>("/node_modules/@lobehub/icons-static-svg/icons/*.svg", {
  query: "?url",
  import: "default",
});
const logoNames = Object.keys(logoFiles).map((path) => path.slice(folder.length, -".svg".length));
const foundLogos = new Map<string, string | undefined>();
const logoUrls = new Map<string, string>();

/**
 * Draws the logo of a provider in its brand colors, or in the text color when the logo has one
 * color, and nothing when no logo matches.
 */
export function ProviderLogo({
  providerId,
  size,
  keepsSpace = false,
}: ProviderLogoProps): ReactElement | null {
  if (!foundLogos.has(providerId)) {
    foundLogos.set(providerId, findProviderLogo(providerId, logoNames));
  }
  const name = foundLogos.get(providerId);
  const url = name === undefined ? undefined : logoUrls.get(name);
  const [, setLoadedName] = useState<string | undefined>();

  useEffect(() => {
    const load = name === undefined ? undefined : logoFiles[`${folder}${name}.svg`];
    if (name === undefined || load === undefined || logoUrls.has(name)) {
      return;
    }
    // A logo that fails to load stays an empty space, because the provider name says the same.
    load().then(
      (loaded) => {
        logoUrls.set(name, loaded);
        setLoadedName(name);
      },
      () => undefined,
    );
  }, [name]);

  if (name === undefined && !keepsSpace) {
    return null;
  }
  const variables = {
    "--logo-size": `${size}px`,
    "--logo-url": url === undefined ? "none" : `url("${url}")`,
  } as CSSProperties;
  // A one color logo fills the text color through its mask, so it waits for its file and never
  // shows as a plain square.
  const kind = name?.endsWith("-color") === true ? styles.colored : styles.plain;
  return (
    <span
      className={url === undefined ? styles.logo : `${styles.logo} ${kind}`}
      style={variables}
      aria-hidden="true"
    />
  );
}
