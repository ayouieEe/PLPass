export function buildStudentQrPayload(studentNumber: string) {
  // The school ID and PLPass must identify the student with the same value.
  // The credential record is validated separately during scanning.
  return studentNumber.trim();
}

export function extractQrCredentialId(rawCode: string) {
  const normalized = rawCode.trim().replace(/^PLPASS-QR:/i, "").trim();
  const parts = normalized
    .split(":")
    .map((part) => part.trim())
    .filter(Boolean);

  return parts.length ? parts[parts.length - 1] : normalized;
}

export function extractSchoolStudentNumber(rawCode: string) {
  return rawCode.match(/\b\d{2}-\d{5}\b/)?.[0] ?? "";
}
