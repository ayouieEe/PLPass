export type CredentialDisplayStatus = "Pending" | "Active";
export type FacialCredentialDisplayStatus = "Pending" | "Active" | "Deactivated";

export function getQrCredentialDisplayStatus(credential?: {
  status?: string;
  revokedAt?: string;
  expiresAt?: string;
}): CredentialDisplayStatus {
  const isExpired = Boolean(credential?.expiresAt && new Date(credential.expiresAt).getTime() <= Date.now());
  return credential?.status?.toLowerCase() === "activated" && !credential.revokedAt && !isExpired ? "Active" : "Pending";
}

export function getFacialCredentialDisplayStatus(profile?: { status?: string }): FacialCredentialDisplayStatus {
  if (!profile) return "Pending";
  return profile.status?.toLowerCase() === "activated" ? "Active" : "Deactivated";
}
