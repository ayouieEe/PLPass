export const USER_ROLES = ["admin", "faculty", "organizer", "student"] as const;
export type UserRole = (typeof USER_ROLES)[number];

export const STUDENT_STATUSES = ["enrolled", "loa", "dropped", "archived"] as const;
export type StudentStatus = (typeof STUDENT_STATUSES)[number];

export const FACULTY_EMPLOYMENT_STATUSES = ["active", "part_time", "on_leave", "separated"] as const;
export type FacultyEmploymentStatus = (typeof FACULTY_EMPLOYMENT_STATUSES)[number];

export const ATTENDANCE_STATUSES = ["present", "late", "absent", "excused"] as const;
export type AttendanceStatus = (typeof ATTENDANCE_STATUSES)[number];

export const SESSION_STATUSES = ["draft", "active", "completed", "cancelled"] as const;
export type SessionStatus = (typeof SESSION_STATUSES)[number];

export const EVENT_STATUSES = ["pending", "approved", "rejected", "completed", "cancelled"] as const;
export type EventStatus = (typeof EVENT_STATUSES)[number];

export const NFC_CREDENTIAL_STATUSES = ["activated", "inactive", "lost", "damaged", "replaced", "blocked"] as const;
export type NfcCredentialStatus = (typeof NFC_CREDENTIAL_STATUSES)[number];

export const NFC_CREDENTIAL_REQUEST_TYPES = ["lost", "damaged", "replacement"] as const;
export type NfcCredentialRequestType = (typeof NFC_CREDENTIAL_REQUEST_TYPES)[number];

export const NFC_CREDENTIAL_REQUEST_STATUSES = ["pending", "approved", "rejected", "completed"] as const;
export type NfcCredentialRequestStatus = (typeof NFC_CREDENTIAL_REQUEST_STATUSES)[number];

export const CORRECTION_REQUEST_STATUSES = ["pending", "approved", "rejected"] as const;
export type CorrectionRequestStatus = (typeof CORRECTION_REQUEST_STATUSES)[number];

export const REPORT_STATUSES = ["queued", "processing", "ready", "failed"] as const;
export type ReportStatus = (typeof REPORT_STATUSES)[number];

export const NOTIFICATION_STATUSES = ["unread", "read", "archived"] as const;
export type NotificationStatus = (typeof NOTIFICATION_STATUSES)[number];

export const NOTIFICATION_TYPES = ["attendance", "correction", "system", "report"] as const;
export type NotificationType = (typeof NOTIFICATION_TYPES)[number];

export const VERIFICATION_METHODS = ["nfc", "qr", "manual", "online"] as const;
export type VerificationMethod = (typeof VERIFICATION_METHODS)[number];

export const ATTENDANCE_SESSION_TYPES = ["class", "event"] as const;
export type AttendanceSessionType = (typeof ATTENDANCE_SESSION_TYPES)[number];

export const ATTENDANCE_MODES = ["required", "optional", "makeup"] as const;
export type AttendanceMode = (typeof ATTENDANCE_MODES)[number];

export const ML_PREDICTION_TYPES = ["random_forest_risk", "linear_regression_anomaly", "k_means_cluster"] as const;
export type MlPredictionType = (typeof ML_PREDICTION_TYPES)[number];

export const RISK_LEVELS = ["low", "medium", "high", "critical"] as const;
export type RiskLevel = (typeof RISK_LEVELS)[number];

export const SORT_DIRECTIONS = ["asc", "desc"] as const;
export type SortDirection = (typeof SORT_DIRECTIONS)[number];

export const NFC_READER_STATUSES = ["active", "inactive", "maintenance"] as const;
export type NfcReaderStatus = (typeof NFC_READER_STATUSES)[number];
