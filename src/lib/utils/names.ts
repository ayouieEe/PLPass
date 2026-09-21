const nameBoundary = /(^|[\s\-'’])(\p{L})/gu;

/** Normalizes person names without changing punctuation or the user's casing. */
export function capitalizePersonName(value: string): string {
  return value
    .replace(/\s+/g, " ")
    .replace(nameBoundary, (_match, boundary: string, letter: string) => `${boundary}${letter.toLocaleUpperCase()}`);
}
