export const STUDENT_NUMBER_PATTERN = /^\d{2}-\d{5}$/;

/** Formats the seven-digit school number as NN-NNNNN while it is entered. */
export function formatStudentNumber(value: string) {
  const digits = value.replace(/\D/g, "");
  return digits.length > 2 ? `${digits.slice(0, 2)}-${digits.slice(2)}` : digits;
}

export function isStudentNumber(value: string) {
  return STUDENT_NUMBER_PATTERN.test(value.trim());
}
