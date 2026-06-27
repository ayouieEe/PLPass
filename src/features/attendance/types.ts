export type AttendanceStatus = "present" | "late" | "absent" | "manual";
export type ReaderState = "ready" | "processing" | "success" | "error" | "disconnected";

export type LiveAttendanceRecord = {
  id: string;
  studentName: string;
  identifier: string;
  status: AttendanceStatus;
  timestamp: string;
};

export type TapResult = {
  studentName?: string;
  studentNumber?: string;
  status: AttendanceStatus;
  message: string;
  timestamp: string;
  resultLabel?: string;
  method?: string;
};
