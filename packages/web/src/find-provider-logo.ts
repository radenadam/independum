// The icon package names each brand once, then adds these endings for its other drawings. The
// longer endings come first, so a name loses its whole ending.
const variantEndings = ["-brand-color", "-text-cn", "-brand", "-color", "-text"];

/**
 * Returns the name of the logo file for a Pi provider id, preferring the drawing in brand colors,
 * or undefined when no logo matches.
 */
export function findProviderLogo(providerId: string, fileNames: string[]): string | undefined {
  const files = new Set(fileNames);
  // Only a plain or a colored drawing works as a small logo, because the text drawings are wide.
  const brands = new Set(
    fileNames.flatMap((name) => {
      const brand = brandOf(name);
      return files.has(brand) || files.has(`${brand}-color`) ? [brand] : [];
    }),
  );
  const brand = findBrand(providerId.toLowerCase(), brands);
  if (brand === undefined) {
    return undefined;
  }
  return files.has(`${brand}-color`) ? `${brand}-color` : brand;
}

// Pi names providers by their own conventions, so the id is tried whole, then without hyphens,
// then by its parts, with and without the "ai" that many brands add or drop.
function findBrand(providerId: string, brands: Set<string>): string | undefined {
  const parts = providerId.split("-");
  const first = parts[0] ?? providerId;
  const last = parts.at(-1) ?? providerId;
  const candidates = [
    providerId,
    parts.join(""),
    first,
    first.length > 4 && first.endsWith("ai") ? first.slice(0, -2) : undefined,
    `${first}ai`,
    parts.length > 1 && last.length >= 4 ? last : undefined,
  ];
  const found = candidates.find((candidate) => candidate !== undefined && brands.has(candidate));
  if (found !== undefined || first.length < 5) {
    return found;
  }
  const starting = [...brands].filter((brand) => brand.startsWith(first));
  return starting.length === 1 ? starting[0] : undefined;
}

function brandOf(fileName: string): string {
  const ending = variantEndings.find((candidate) => fileName.endsWith(candidate));
  return ending === undefined ? fileName : fileName.slice(0, -ending.length);
}
