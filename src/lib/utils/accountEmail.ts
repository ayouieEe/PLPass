const ACCOUNT_EMAIL_DOMAIN = "plpasig.edu.ph";

function compactNamePart(value: string | undefined) {
  return (value ?? "")
    .normalize("NFKD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[^\p{L}\p{N}]/gu, "")
    .toLowerCase();
}

/** Builds the institution account address from a person's legal name. */
export function generateAccountEmail(lastName: string, firstName: string, _middleName?: string, nameExtension?: string) {
  const surname = compactNamePart(lastName);
  const extension = compactNamePart(nameExtension);
  const givenName = compactNamePart(firstName);
  if (!surname || !givenName) return "";
  return `${surname}${extension}_${givenName}@${ACCOUNT_EMAIL_DOMAIN}`;
}

function generateLegacyAccountEmail(lastName: string, firstName: string, middleName?: string, nameExtension?: string) {
  const surname = compactNamePart(lastName);
  const extension = compactNamePart(nameExtension);
  const givenName = `${compactNamePart(firstName)}${compactNamePart(middleName)}`;
  if (!surname || !compactNamePart(firstName)) return "";
  return `${surname}${extension}_${givenName}@${ACCOUNT_EMAIL_DOMAIN}`;
}

/** Recognizes both the current and legacy institution-generated address formats. */
export function isGeneratedAccountEmail(email: string, lastName: string, firstName: string, middleName?: string, nameExtension?: string) {
  const normalizedEmail = email.trim().toLowerCase();
  return [
    generateAccountEmail(lastName, firstName, middleName, nameExtension),
    generateLegacyAccountEmail(lastName, firstName, middleName, nameExtension)
  ].some((generated) => generated !== "" && generated.toLowerCase() === normalizedEmail);
}

export { ACCOUNT_EMAIL_DOMAIN };
