export type OrganizerEventStatus = "incoming" | "today" | "active" | "completed" | "cancelled";
export type AttendanceMethod = "QR Code" | "Facial Recognition" | "Manual";
export type AttendanceStatus = "present" | "late" | "absent";
export type LateReason = "Traffic / Commute" | "Class or Academic Conflict" | "Personal / Health" | "Weather / Force Majeure" | "Other";
export type CorrectionStatus = "Pending" | "Approved" | "Rejected";
export type CredentialStatus = "Generated" | "Regeneration Requested" | "Ready" | "Needs Review" | "Activated" | "Inactive" | "Damaged";

export type OrganizerStudent = {
  id: string;
  name: string;
  schoolId: string;
  program: string;
  yearLevel: number | string;
  section: string;
  email: string;
  qrStatus: CredentialStatus;
  facialStatus: CredentialStatus;
  accountStatus: "Active" | "Suspended";
};

export type OrganizerEvent = {
  code: string;
  name: string;
  category: string;
  venue: string;
  date: string;
  startTime: string;
  endTime: string;
  predictedTurnout: number;
  objectives: string[];
  status: OrganizerEventStatus;
};

export type OrganizerAttendanceRow = {
  id: string;
  studentId: string;
  studentName: string;
  eventCode: string;
  attendanceMethod: AttendanceMethod;
  checkInTime: string;
  checkOutTime?: string;
  attendanceStatus: AttendanceStatus;
  lateReason?: LateReason;
};

export type OrganizerCompletedEvent = OrganizerEvent & {
  present: number;
  late: number;
  absent: number;
  totalRegistered: number;
  attendanceRate: number;
  sentiment: {
    positive: number;
    neutral: number;
    negative: number;
  };
  feedbackComments: string[];
};

export type OrganizerCorrectionRequest = {
  id: string;
  studentName: string;
  eventCode: string;
  requestType: "Excused Absence" | "Correction - Wrong Status" | "Correction - Wrong Time-In";
  explanation: string;
  fileAttached: boolean;
  status: CorrectionStatus;
  requestedStatus: AttendanceStatus;
  decisionRemarks?: string;
};

export type OrganizerUiState = {
  students: OrganizerStudent[];
  events: OrganizerEvent[];
  attendanceRows: OrganizerAttendanceRow[];
  completedEvents: OrganizerCompletedEvent[];
  correctionRequests: OrganizerCorrectionRequest[];
  notifications: string[];
};

export const lateReasons: LateReason[] = [
  "Traffic / Commute",
  "Class or Academic Conflict",
  "Personal / Health",
  "Weather / Force Majeure",
  "Other"
];

export const defaultOrganizerStudents: OrganizerStudent[] = [];

const emptyOrganizerUiState: OrganizerUiState = {
  students: [],
  events: [],
  attendanceRows: [],
  completedEvents: [],
  correctionRequests: [],
  notifications: []
};

export function getDefaultOrganizerUiState(): OrganizerUiState {
  return emptyOrganizerUiState;
}

export function loadOrganizerUiState(): OrganizerUiState {
  return emptyOrganizerUiState;
}

export function saveOrganizerUiState(state: OrganizerUiState) {
  return state;
}

export function resetOrganizerUiState() {
  return emptyOrganizerUiState;
}

export function publishOrganizerEvent(state: OrganizerUiState, ..._args: unknown[]) {
  void _args;
  return state;
}

export function startOrganizerSession(state: OrganizerUiState, ..._args: unknown[]) {
  void _args;
  return state;
}

export function endOrganizerSession(state: OrganizerUiState, eventCode: string, attendanceRows: OrganizerAttendanceRow[]) {
  return {
    ...state,
    attendanceRows: [
      ...state.attendanceRows.filter((row) => row.eventCode !== eventCode),
      ...attendanceRows
    ]
  };
}

export function approveOrganizerCorrectionRequest(state: OrganizerUiState, ..._args: unknown[]) {
  void _args;
  return state;
}

export function rejectOrganizerCorrectionRequest(state: OrganizerUiState, ..._args: unknown[]) {
  void _args;
  return state;
}

export function regenerateOrganizerQr(state: OrganizerUiState, ..._args: unknown[]) {
  void _args;
  return state;
}

export function updateOrganizerFacialStatus(state: OrganizerUiState, ..._args: unknown[]) {
  void _args;
  return state;
}

export function createUiExport(label: string) {
  return `${label} export is ready.`;
}
