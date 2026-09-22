import { formatStudentNumber, isStudentNumber } from "../utils/studentNumber.js";

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

export function extractStudentNumber(rawCode: string) {
  const normalized = extractQrCredentialId(rawCode);
  const formatted = formatStudentNumber(normalized);
  return isStudentNumber(formatted) ? formatted : "";
}

export function normalizeStudentLookupValue(rawValue: string) {
  return extractQrCredentialId(rawValue).replace(/\s+/g, " ").trim().toLowerCase();
}

/**
 * Attendance QR payloads are deliberately limited to the value printed on the
 * student's school ID: the student number or the student's full name. Keep
 * this separate from the legacy credential normalizer, which understands old
 * PLPASS-QR wrappers and opaque credential IDs.
 */
export function normalizeStudentIdentityValue(rawValue: string) {
  return String(rawValue ?? "").replace(/\s+/g, " ").trim().toLowerCase();
}

/** True when a QR payload contains this participant's ID or full name. */
export function studentIdentityMatchesPayload(payload: string, studentNumber: string, fullName: string) {
  const value = normalizeStudentIdentityValue(payload);
  if (!value) return false;

  const scannedStudentNumber = extractStudentNumber(payload);
  const knownStudentNumber = extractStudentNumber(studentNumber);
  if (scannedStudentNumber && knownStudentNumber && scannedStudentNumber === knownStudentNumber) return true;

  const studentId = normalizeStudentIdentityValue(studentNumber);
  if (studentId && value.includes(studentId)) return true;

  // Names on school QR codes may be rendered as "LAST, FIRST MIDDLE" while
  // the participant list stores "First Middle Last". Ignore case, commas,
  // periods, and word order, but require every name token to be present.
  const payloadTokens: string[] = value.match(/[a-z0-9]+/g) ?? [];
  const nameTokens: string[] = normalizeStudentIdentityValue(fullName).match(/[a-z0-9]+/g) ?? [];
  return nameTokens.length >= 2 && nameTokens.every((token) => payloadTokens.includes(token));
}

export function extractSchoolStudentNumber(rawCode: string) {
  return extractStudentNumber(rawCode);
}
