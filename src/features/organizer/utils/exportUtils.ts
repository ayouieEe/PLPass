import jsPDF from "jspdf";
import autoTable from "jspdf-autotable";
import * as XLSX from "xlsx";

/**
 * Export utilities for organizer reports.
 * Uses jsPDF and jspdf-autotable for direct PDF downloads and Blob/CSV for XLSX downloads.
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
  return `${safeTitle || "organizer-report"}-${todayLabel()}`;
}

export function exportTabularReportCsv(title: string, rows: ExportTableRow[]) {
  const headers = Array.from(new Set(rows.flatMap((row) => Object.keys(row))));
  const data = rows.map((row) => headers.map((header) => String(row[header] ?? "")));
  downloadFile(buildCsvString(headers, data), `${reportFileName(title)}.csv`, "text/csv;charset=utf-8;");
}

export function exportTabularReportXlsx(title: string, rows: ExportTableRow[]) {
  const worksheet = XLSX.utils.json_to_sheet(rows);
  const workbook = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(workbook, worksheet, "Report");
  XLSX.writeFile(workbook, `${reportFileName(title)}.xlsx`);
}

export function exportTabularReportPdf(title: string, rows: ExportTableRow[]) {
  const headers = Array.from(new Set(rows.flatMap((row) => Object.keys(row))));
  const doc = new jsPDF({ orientation: "landscape", unit: "mm", format: "a4" });
  doc.setFontSize(16);
  doc.text(title.replace(/\s+(?:XLSX|PDF)$/i, ""), 14, 18);
  doc.setFontSize(9);
  doc.text(`Generated ${new Date().toLocaleDateString("en-PH", { dateStyle: "long" })} · ${rows.length} record(s)`, 14, 24);
  autoTable(doc, {
    startY: 28,
    head: [headers],
    body: rows.map((row) => headers.map((header) => String(row[header] ?? ""))),
    theme: "striped",
    headStyles: { fillColor: [79, 70, 229], textColor: [255, 255, 255], fontStyle: "bold", fontSize: 8 },
    styles: { fontSize: 7, cellPadding: 2 }
  });
  doc.save(`${reportFileName(title)}.pdf`);
}

export function exportTabularReport(title: string, rows: ExportTableRow[]) {
  if (/\bpdf\b/i.test(title)) exportTabularReportPdf(title, rows);
  else if (/\bxlsx\b/i.test(title)) exportTabularReportXlsx(title, rows);
  else exportTabularReportCsv(title, rows);
}

function buildCsvString(headers: string[], rows: (string | number)[][]): string {
  const headerLine = headers.map(escapeCsv).join(",");
  const dataLines = rows.map((row) => row.map(escapeCsv).join(","));
  return [headerLine, ...dataLines].join("\r\n");
}

function downloadFile(content: string, filename: string, mimeType: string) {
  const blob = new Blob([content], { type: mimeType });
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

export function exportStudentListXlsx(students: ExportStudentRow[]) {
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

  const csv = buildCsvString(headers, rows);
  downloadFile(csv, `student-list-${todayLabel()}.csv`, "text/csv;charset=utf-8;");
}

export function exportStudentListPdf(students: ExportStudentRow[]) {
  const doc = new jsPDF({ orientation: "landscape", unit: "mm", format: "a4" });

  // Title
  doc.setFontSize(16);
  doc.setTextColor(26, 26, 46);
  doc.text("Student List Report", 14, 18);

  // Subtitle
  doc.setFontSize(9);
  doc.setTextColor(107, 114, 128);
  doc.text(
    `Generated ${new Date().toLocaleDateString("en-PH", { dateStyle: "long" })} · ${students.length} student(s)`,
    14,
    24
  );

  autoTable(doc, {
    startY: 28,
    head: [[
      "Student ID",
      "Full Name",
      "Program",
      "Year / Sec",
      "Email",
      "Status",
      "Attendance",
      "Events",
      "QR",
      "Facial",
      "Requests"
    ]],
    body: students.map((s) => [
      s.studentId,
      s.name,
      s.program,
      `Year ${s.yearLevel} - ${s.section}`,
      s.email,
      s.status,
      `${s.attendanceRate}%`,
      s.eventsJoined,
      s.qrStatus,
      s.facialStatus,
      s.correctionRequests
    ]),
    theme: "striped",
    headStyles: {
      fillColor: [79, 70, 229],
      textColor: [255, 255, 255],
      fontStyle: "bold",
      fontSize: 9
    },
    styles: {
      fontSize: 8,
      cellPadding: 3
    },
    alternateRowStyles: {
      fillColor: [245, 245, 255]
    }
  });

  doc.save(`student-list-${todayLabel()}.pdf`);
}

// ---------------------------------------------------------------------------
// Participation History exports
// ---------------------------------------------------------------------------

export function exportParticipationHistoryXlsx(students: ExportParticipationRow[]) {
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

  const csv = buildCsvString(headers, rows);
  downloadFile(csv, `participation-history-${todayLabel()}.csv`, "text/csv;charset=utf-8;");
}

export function exportParticipationHistoryPdf(students: ExportParticipationRow[]) {
  const doc = new jsPDF({ orientation: "landscape", unit: "mm", format: "a4" });

  // Title
  doc.setFontSize(16);
  doc.setTextColor(26, 26, 46);
  doc.text("Participation History Report", 14, 18);

  // Subtitle
  doc.setFontSize(9);
  doc.setTextColor(107, 114, 128);
  doc.text(
    `Generated ${new Date().toLocaleDateString("en-PH", { dateStyle: "long" })} · ${students.length} student(s)`,
    14,
    24
  );

  autoTable(doc, {
    startY: 28,
    head: [[
      "Student ID",
      "Full Name",
      "Program",
      "Year / Sec",
      "Attendance Rate",
      "Events Joined",
      "Correction Requests Filed"
    ]],
    body: students.map((s) => [
      s.studentId,
      s.name,
      s.program,
      `Year ${s.yearLevel} - ${s.section}`,
      `${s.attendanceRate}%`,
      s.eventsJoined,
      s.correctionRequests
    ]),
    theme: "striped",
    headStyles: {
      fillColor: [79, 70, 229],
      textColor: [255, 255, 255],
      fontStyle: "bold",
      fontSize: 9
    },
    styles: {
      fontSize: 8,
      cellPadding: 3
    },
    alternateRowStyles: {
      fillColor: [245, 245, 255]
    }
  });

  doc.save(`participation-history-${todayLabel()}.pdf`);
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

export function exportCorrectionRequestsXlsx(requests: ExportCorrectionRequestRow[]) {
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

  const csv = buildCsvString(headers, rows);
  downloadFile(csv, `correction-requests-${todayLabel()}.csv`, "text/csv;charset=utf-8;");
}

export function exportCorrectionRequestsPdf(requests: ExportCorrectionRequestRow[]) {
  const doc = new jsPDF({ orientation: "landscape", unit: "mm", format: "a4" });

  // Title
  doc.setFontSize(16);
  doc.setTextColor(26, 26, 46);
  doc.text("Correction Requests Report", 14, 18);

  // Subtitle
  doc.setFontSize(9);
  doc.setTextColor(107, 114, 128);
  doc.text(
    `Generated ${new Date().toLocaleDateString("en-PH", { dateStyle: "long" })} · ${requests.length} request(s)`,
    14,
    24
  );

  autoTable(doc, {
    startY: 28,
    head: [[
      "Request ID",
      "Student ID",
      "Student Name",
      "Event Code",
      "Request Type",
      "Date Submitted",
      "Status",
      "Recorded",
      "Requested"
    ]],
    body: requests.map((r) => [
      r.requestId,
      r.studentId,
      r.studentName,
      r.eventCode,
      r.requestType,
      r.dateSubmitted,
      r.status,
      r.recordedStatus,
      r.requestedStatus
    ]),
    theme: "striped",
    headStyles: {
      fillColor: [79, 70, 229],
      textColor: [255, 255, 255],
      fontStyle: "bold",
      fontSize: 9
    },
    styles: {
      fontSize: 8,
      cellPadding: 3
    },
    alternateRowStyles: {
      fillColor: [245, 245, 255]
    }
  });

  doc.save(`correction-requests-${todayLabel()}.pdf`);
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

export function exportQrCredentialsXlsx(rows: ExportQrCredentialRow[]) {
  const headers = ["Student ID", "Student Name", "QR Status", "Date Generated", "Last Used"];
  const data = rows.map((r) => [r.studentId, r.studentName, r.status, r.dateGenerated, r.lastUsed]);
  const csv = buildCsvString(headers, data);
  downloadFile(csv, `qr-credentials-${todayLabel()}.csv`, "text/csv;charset=utf-8;");
}

export function exportQrCredentialsPdf(rows: ExportQrCredentialRow[]) {
  const doc = new jsPDF({ orientation: "landscape", unit: "mm", format: "a4" });
  doc.setFontSize(16);
  doc.setTextColor(26, 26, 46);
  doc.text("QR Credentials Report", 14, 18);
  doc.setFontSize(9);
  doc.setTextColor(107, 114, 128);
  doc.text(`Generated ${new Date().toLocaleDateString("en-PH", { dateStyle: "long" })} · ${rows.length} record(s)`, 14, 24);

  autoTable(doc, {
    startY: 28,
    head: [["Student ID", "Student Name", "QR Status", "Date Generated", "Last Used"]],
    body: rows.map((r) => [r.studentId, r.studentName, r.status, r.dateGenerated, r.lastUsed]),
    theme: "striped",
    headStyles: { fillColor: [79, 70, 229], textColor: [255, 255, 255], fontStyle: "bold", fontSize: 9 },
    styles: { fontSize: 8, cellPadding: 3 },
    alternateRowStyles: { fillColor: [245, 245, 255] }
  });

  doc.save(`qr-credentials-${todayLabel()}.pdf`);
}

export function exportFacialProfilesXlsx(rows: ExportFacialProfileRow[]) {
  const headers = ["Student ID", "Student Name", "Facial Status", "Enrollment Date", "Last Scan"];
  const data = rows.map((r) => [r.studentId, r.studentName, r.status, r.enrollmentDate, r.lastScan]);
  const csv = buildCsvString(headers, data);
  downloadFile(csv, `facial-profiles-${todayLabel()}.csv`, "text/csv;charset=utf-8;");
}

export function exportFacialProfilesPdf(rows: ExportFacialProfileRow[]) {
  const doc = new jsPDF({ orientation: "landscape", unit: "mm", format: "a4" });
  doc.setFontSize(16);
  doc.setTextColor(26, 26, 46);
  doc.text("Facial Enrollment Profiles Report", 14, 18);
  doc.setFontSize(9);
  doc.setTextColor(107, 114, 128);
  doc.text(`Generated ${new Date().toLocaleDateString("en-PH", { dateStyle: "long" })} · ${rows.length} record(s)`, 14, 24);

  autoTable(doc, {
    startY: 28,
    head: [["Student ID", "Student Name", "Facial Status", "Enrollment Date", "Last Scan"]],
    body: rows.map((r) => [r.studentId, r.studentName, r.status, r.enrollmentDate, r.lastScan]),
    theme: "striped",
    headStyles: { fillColor: [79, 70, 229], textColor: [255, 255, 255], fontStyle: "bold", fontSize: 9 },
    styles: { fontSize: 8, cellPadding: 3 },
    alternateRowStyles: { fillColor: [245, 245, 255] }
  });

  doc.save(`facial-profiles-${todayLabel()}.pdf`);
}


