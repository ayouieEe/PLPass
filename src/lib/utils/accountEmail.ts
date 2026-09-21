const ACCOUNT_EMAIL_DOMAIN = "plpasig.edu.ph";

function compactNamePart(value: string | undefined) {
  return (value ?? "")
    .normalize("NFKD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[^\p{L}\p{N}]/gu, "")
    .toLowerCase();
}

/** Builds the institution account address from a person's legal name. */
export function generateAccountEmail(lastName: string, firstName: string, middleName?: string) {
  const surname = compactNamePart(lastName);
  const givenNames = `${compactNamePart(firstName)}${compactNamePart(middleName)}`;
  if (!surname || !givenNames) return "";
  return `${surname}_${givenNames}@${ACCOUNT_EMAIL_DOMAIN}`;
}

export { ACCOUNT_EMAIL_DOMAIN };
