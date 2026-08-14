export function buildStudentQrPayload(studentNumber: string, credentialId: string) {
  return `PLPASS-QR:${studentNumber.trim()}:${credentialId.trim()}`;
}

export function extractQrCredentialId(rawCode: string) {
  const normalized = rawCode.trim().replace(/^PLPASS-QR:/i, "").trim();
  const parts = normalized
    .split(":")
    .map((part) => part.trim())
    .filter(Boolean);

  return parts.length ? parts[parts.length - 1] : normalized;
}
