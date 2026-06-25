export type AttendanceStatus = "present" | "late" | "absent" | "manual";

export type LiveAttendanceRecord = {
  id: string;
  studentName: string;
  identifier: string;
  status: AttendanceStatus;
  timestamp: string;
};

export type TapResult = {
  studentName: string;
  nfcValue: string;
  status: AttendanceStatus;
  message: string;
  timestamp: string;
};
