export function normalizeInviteEmail(value: unknown) {
  const email = typeof value === "string" ? value.trim().toLowerCase() : "";
  if (!email || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) throw new Error("Enter a valid email address.");
  return email;
}

export function normalizeStaffEmail(value: unknown) {
  const email = normalizeInviteEmail(value);
  if (!email.endsWith("@plpasig.edu.ph")) throw new Error("Use an @plpasig.edu.ph email address for staff accounts.");
  return email;
}
