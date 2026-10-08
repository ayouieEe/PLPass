export type CredentialDisplayStatus = "Pending" | "Active";

export function getQrCredentialDisplayStatus(credential?: {
  status?: string;
  revokedAt?: string;
  expiresAt?: string;
}): CredentialDisplayStatus {
  const isExpired = Boolean(credential?.expiresAt && new Date(credential.expiresAt).getTime() <= Date.now());
  return credential?.status?.toLowerCase() === "activated" && !credential.revokedAt && !isExpired ? "Active" : "Pending";
}
