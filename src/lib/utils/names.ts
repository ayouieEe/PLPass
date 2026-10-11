const nameBoundary = /(^|[\s\-'’])(\p{L})/gu;

type PersonNameParts = {
  firstName?: string | null;
  middleName?: string | null;
  lastName?: string | null;
  nameExtension?: string | null;
  fullName?: string | null;
  formattedName?: string | null;
};

/** Normalizes person names without changing punctuation or the user's casing. */
export function capitalizePersonName(value: string): string {
  return value
    .replace(/\s+/g, " ")
    .replace(nameBoundary, (_match, boundary: string, letter: string) => `${boundary}${letter.toLocaleUpperCase()}`);
}

/** The canonical table label for a student: surname, first name M., extension. */
export function formatSurnameFirstName({ firstName, middleName, lastName, nameExtension, fullName, formattedName }: PersonNameParts, fallback = ""): string {
  const first = firstName?.trim() ?? "";
  const middle = middleName?.trim() ?? "";
  const last = lastName?.trim() ?? "";
  const extension = nameExtension?.trim() ?? "";
  if (last && first) return `${last}, ${first}${middle ? ` ${middle.charAt(0).toLocaleUpperCase()}.` : ""}${extension ? ` ${extension}` : ""}`;
  return [first, middle, last, extension].filter(Boolean).join(" ") || formattedName?.trim() || fullName?.trim() || fallback;
}
