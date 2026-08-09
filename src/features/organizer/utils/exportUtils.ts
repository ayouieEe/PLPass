import jsPDF from "jspdf";
import autoTable from "jspdf-autotable";

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
  const str = String(value ?? "");
  if (str.includes(",") || str.includes('"') || str.includes("\n")) {
    return `"${str.replace(/"/g, '""')}"`;
  }
  return str;
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
