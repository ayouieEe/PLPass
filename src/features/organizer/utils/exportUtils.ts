import { exportReportPdf, exportReportXlsx, type ReportExportScope } from "@/lib/exports/reportExport";

/**
 * Export utilities for organizer reports.
 * Uses jsPDF and jspdf-autotable for direct PDF downloads and Blob/CSV for tabular downloads.
 */

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------
export type ExportStudentRow = {
  studentId: string;
  name: string;
  email: string;
  program: string;
  yearLevel: number | string;
  section: string;
  status: string;
  attendanceRate: number;
  eventsJoined: number;
  qrStatus: string;
  facialStatus: string;
  correctionRequests: number;
};

export type ExportParticipationRow = {
  studentId: string;
  name: string;
  program: string;
  yearLevel: number | string;
  section: string;
  attendanceRate: number;
  eventsJoined: number;
  correctionRequests: number;
};

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function escapeCsv(value: string | number): string {
  const raw = String(value ?? "");
  const str = /^[=+\-@]/.test(raw) ? `'${raw}` : raw;
  if (str.includes(",") || str.includes('"') || str.includes("\n")) {
    return `"${str.replace(/"/g, '""')}"`;
  }
  return str;
}

export type ExportTableRow = Record<string, string | number | boolean | null | undefined>;

function reportFileName(title: string) {
  const safeTitle = title.toLowerCase().replace(/\b(?:xlsx|pdf)\b/g, "").replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "");
  return `plpass-${safeTitle || "organizer-report"}-${todayLabel()}`;
}

export function exportTabularReportCsv(title: string, rows: ExportTableRow[]) {
  const headers = Array.from(new Set(rows.flatMap((row) => Object.keys(row))));
  const data = rows.map((row) => headers.map((header) => String(row[header] ?? "")));
  downloadFile(buildCsvString(headers, data), `${reportFileName(title)}.csv`, "text/csv;charset=utf-8;");
}

export async function exportTabularReportXlsx(title: string, rows: ExportTableRow[]) {
  await exportReportXlsx({ title, rows, fileName: reportFileName(title) });
}

export async function exportTabularReportPdf(title: string, rows: ExportTableRow[]) {
  await exportReportPdf({ title, rows, fileName: reportFileName(title) });
}

export async function exportTabularReport(title: string, rows: ExportTableRow[], scope?: ReportExportScope) {
  if (/\bpdf\b/i.test(title)) await exportReportPdf({ title, rows, fileName: reportFileName(title), scope });
  else await exportReportXlsx({ title, rows, fileName: reportFileName(title), scope });
}

function buildCsvString(headers: string[], rows: (string | number)[][]): string {
  const headerLine = headers.map(escapeCsv).join(",");
  const dataLines = rows.map((row) => row.map(escapeCsv).join(","));
  return [headerLine, ...dataLines].join("\r\n");
}

function downloadFile(content: Blob | string, filename: string, mimeType: string) {
  const blob = content instanceof Blob ? content : new Blob([content], { type: mimeType });
  const url = URL.createObjectURL(blob);
  const anchor = document.createElement("a");
  anchor.href = url;
  anchor.download = filename;
  document.body.appendChild(anchor);
  anchor.click();
  document.body.removeChild(anchor);
  URL.revokeObjectURL(url);
}

function todayLabel(): string {
  return new Date().toISOString().slice(0, 10);
}

// ---------------------------------------------------------------------------
// Student List exports
// ---------------------------------------------------------------------------

export async function exportStudentListXlsx(students: ExportStudentRow[]) {
  const headers = [
    "Student ID",
    "Full Name",
    "Email",
    "Program",
    "Year Level",
    "Section",
    "Status",
    "Attendance Rate (%)",
    "Events Joined",
    "QR Credential",
    "Facial Credential",
    "Correction Requests"
  ];

  const rows = students.map((s) => [
    s.studentId,
    s.name,
    s.email,
    s.program,
    s.yearLevel,
    s.section,
    s.status,
    s.attendanceRate,
    s.eventsJoined,
    s.qrStatus,
    s.facialStatus,
    s.correctionRequests
  ]);

  await exportReportXlsx({ title: "Student List Report", rows: rows.map((row) => Object.fromEntries(headers.map((header, index) => [header, row[index]]))), fileName: `student-list-${todayLabel()}` });
}

export async function exportStudentListPdf(students: ExportStudentRow[]) {
  await exportReportPdf({ title: "Student List Report", fileName: `student-list-${todayLabel()}`, rows: students.map((s) => ({ "Student ID": s.studentId, "Full Name": s.name, Program: s.program, "Year / Sec": `Year ${s.yearLevel} - ${s.section}`, Email: s.email, Status: s.status, Attendance: `${s.attendanceRate}%`, Events: s.eventsJoined, QR: s.qrStatus, Facial: s.facialStatus, Requests: s.correctionRequests })) });
}

// ---------------------------------------------------------------------------
// Participation History exports
// ---------------------------------------------------------------------------

export async function exportParticipationHistoryXlsx(students: ExportParticipationRow[]) {
  const headers = [
    "Student ID",
    "Full Name",
    "Program",
    "Year Level",
    "Section",
    "Attendance Rate (%)",
    "Events Joined",
    "Correction Requests Filed"
  ];

  const rows = students.map((s) => [
    s.studentId,
    s.name,
    s.program,
    s.yearLevel,
    s.section,
    s.attendanceRate,
    s.eventsJoined,
    s.correctionRequests
  ]);

  await exportReportXlsx({ title: "Participation History Report", rows: rows.map((row) => Object.fromEntries(headers.map((header, index) => [header, row[index]]))), fileName: `participation-history-${todayLabel()}` });
}

export async function exportParticipationHistoryPdf(students: ExportParticipationRow[]) {
  await exportReportPdf({ title: "Participation History Report", fileName: `participation-history-${todayLabel()}`, rows: students.map((s) => ({ "Student ID": s.studentId, "Full Name": s.name, Program: s.program, "Year / Sec": `Year ${s.yearLevel} - ${s.section}`, "Attendance Rate": `${s.attendanceRate}%`, "Events Joined": s.eventsJoined, "Correction Requests Filed": s.correctionRequests })) });
}

// ---------------------------------------------------------------------------
// Correction Requests exports
// ---------------------------------------------------------------------------

export type ExportCorrectionRequestRow = {
  requestId: string;
  studentId: string;
  studentName: string;
  eventCode: string;
  eventName: string;
  requestType: string;
  dateSubmitted: string;
  status: string;
  recordedStatus: string;
  requestedStatus: string;
};

export async function exportCorrectionRequestsXlsx(requests: ExportCorrectionRequestRow[]) {
  const headers = [
    "Request ID",
    "Student ID",
    "Student Name",
    "Event Code",
    "Event Name",
    "Request Type",
    "Date Submitted",
    "Status",
    "Recorded Status",
    "Requested Status"
  ];

  const rows = requests.map((r) => [
    r.requestId,
    r.studentId,
    r.studentName,
    r.eventCode,
    r.eventName,
    r.requestType,
    r.dateSubmitted,
    r.status,
    r.recordedStatus,
    r.requestedStatus
  ]);

  await exportReportXlsx({ title: "Correction Requests Report", rows: rows.map((row) => Object.fromEntries(headers.map((header, index) => [header, row[index]]))), fileName: `correction-requests-${todayLabel()}` });
}

export async function exportCorrectionRequestsPdf(requests: ExportCorrectionRequestRow[]) {
  await exportReportPdf({ title: "Correction Requests Report", fileName: `correction-requests-${todayLabel()}`, rows: requests.map((r) => ({ "Request ID": r.requestId, "Student ID": r.studentId, "Student Name": r.studentName, "Event Code": r.eventCode, "Request Type": r.requestType, "Date Submitted": r.dateSubmitted, Status: r.status, Recorded: r.recordedStatus, Requested: r.requestedStatus })) });
}

// ---------------------------------------------------------------------------
// QR Credentials & Facial Profiles exports
// ---------------------------------------------------------------------------

export type ExportQrCredentialRow = {
  studentId: string;
  studentName: string;
  status: string;
  dateGenerated: string;
  lastUsed: string;
};

export type ExportFacialProfileRow = {
  studentId: string;
  studentName: string;
  status: string;
  enrollmentDate: string;
  lastScan: string;
};

export async function exportQrCredentialsXlsx(rows: ExportQrCredentialRow[]) {
  await exportReportXlsx({ title: "QR Credentials Report", fileName: `qr-credentials-${todayLabel()}`, rows: rows.map((r) => ({ "Student ID": r.studentId, "Student Name": r.studentName, "QR Status": r.status, "Date Generated": r.dateGenerated, "Last Used": r.lastUsed })) });
}

export async function exportQrCredentialsPdf(rows: ExportQrCredentialRow[]) {
  await exportReportPdf({ title: "QR Credentials Report", fileName: `qr-credentials-${todayLabel()}`, rows: rows.map((r) => ({ "Student ID": r.studentId, "Student Name": r.studentName, "QR Status": r.status, "Date Generated": r.dateGenerated, "Last Used": r.lastUsed })) });
}

export async function exportFacialProfilesXlsx(rows: ExportFacialProfileRow[]) {
  await exportReportXlsx({ title: "Facial Enrollment Profiles Report", fileName: `facial-profiles-${todayLabel()}`, rows: rows.map((r) => ({ "Student ID": r.studentId, "Student Name": r.studentName, "Facial Status": r.status, "Enrollment Date": r.enrollmentDate, "Last Scan": r.lastScan })) });
}

export async function exportFacialProfilesPdf(rows: ExportFacialProfileRow[]) {
  await exportReportPdf({ title: "Facial Enrollment Profiles Report", fileName: `facial-profiles-${todayLabel()}`, rows: rows.map((r) => ({ "Student ID": r.studentId, "Student Name": r.studentName, "Facial Status": r.status, "Enrollment Date": r.enrollmentDate, "Last Scan": r.lastScan })) });
}


