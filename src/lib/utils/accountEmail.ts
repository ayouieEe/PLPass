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

export { ACCOUNT_EMAIL_DOMAIN };
