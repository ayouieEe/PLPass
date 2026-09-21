export const LEGAL_POLICY_VERSION = "2026-09-21";

export type LegalDocumentType = "terms" | "privacy";

export const LEGAL_DOCUMENTS = {
  terms: { label: "Terms of Use", path: "/terms" },
  privacy: { label: "Privacy Policy", path: "/privacy" }
} as const satisfies Record<LegalDocumentType, { label: string; path: string }>;

export const TERMS_SECTIONS = [
  ["Account responsibility", "Use only your assigned PLPass account, keep your credentials private, and report suspected compromise promptly. Account details must remain accurate enough for attendance support."],
  ["Acceptable use", "Use PLPass for legitimate school attendance and request workflows. Do not probe, bypass, scrape, impersonate another student, or interfere with the service or another person’s records."],
  ["Attendance integrity", "Check in only for yourself and only through the verification method provided for the event. Sharing QR credentials, asking another person to check in, or attempting to alter a record outside the correction process is not permitted."],
  ["Verification and requests", "QR and facial verification may be offered by an event organizer. Use the Request History, Correction Requests, or Report an Issue tools when a credential, event, or attendance record needs review."],
  ["Service availability", "PLPass may be unavailable or limited during maintenance, connectivity problems, or an event-system issue. A submitted request or report is not a guarantee of approval or attendance correction."],
  ["Account action", "Access may be limited or suspended when necessary to protect the service, investigate suspected misuse, or follow institutional instructions. The institution’s established support and review channels remain available."],
  ["Updates", "The institution may update these terms as the service or its rules change. The current version and effective date are always available from the sign-in page and your Profile."],
  ["Review status", "This student-facing text is a PLPass product draft and must be reviewed and approved by the institution and its legal/privacy officers before production adoption."]
] as const;

export const PRIVACY_SECTIONS = [
  ["Information used by PLPass", "PLPass uses account and student details, event participation, attendance records, correction and issue requests, device/session information needed for security, and notification status to provide the student workspace."],
  ["Verification data", "When enabled for an event, QR credentials and facial-verification enrollment or matching data may be used to verify attendance. Facial enrollment is separate from general Terms and Privacy acceptance and is handled through the institution’s credential process."],
  ["Why it is used", "The information supports attendance recording, event participation, request review, credential support, account security, auditability, service reliability, and communications about your PLPass activity."],
  ["Who can access it", "Access is limited by role and institutional permissions. Students see their own account, attendance, and request information; authorized organizers and administrators may see the records needed for their assigned responsibilities."],
  ["Security and storage", "PLPass uses authenticated access, role-aware database policies, protected storage, and audit controls appropriate to the application. No system can promise that every service or network is risk-free."],
  ["Retention", "Records are retained and disposed of according to the institution’s approved records, attendance, and privacy requirements. This page does not invent a retention period; contact the institution for the governing schedule."],
  ["Your choices and rights", "You may review your visible records and use the correction or issue-reporting workflows when something is inaccurate. Privacy questions, access requests, or concerns should be directed to the institution’s designated support or privacy office."],
  ["Policy updates", "The current version and effective date are shown here. Material changes should be communicated through the institution’s normal student channels and reflected in the policy shown in PLPass."],
  ["Review status", "This student-facing text is a PLPass product draft and must be reviewed and approved by the institution and its legal/privacy officers before production adoption."]
] as const;
