import jsPDF from "jspdf";
import autoTable from "jspdf-autotable";
import { repositories } from "@/services/repositories";
import type { RepositoryContext } from "@/services/repositoryUtils";

export type ReportExportScope = { type: "event"; eventId: string } | { type: "organizer"; organizerId: string } | { type: "global" };
export type ReportExportRow = Record<string, string | number | boolean | null | undefined>;
export type ReportExportColumn = { key: string; header: string; width?: number };
export type ReportExportSection = { name: string; rows: ReportExportRow[]; columns?: ReportExportColumn[] };
export type ReportFilterSummary = Record<string, string | number | boolean | null | undefined>;
export type ReportFilterState = ReportFilterSummary & { search?: string; eventId?: string; schoolYear?: string; dateFrom?: string; dateTo?: string };
export type ReportExportRequest = ReportExportOptions;
export type ReportExportOptions = {
  title: string; reportType?: string; rows?: ReportExportRow[]; sections?: ReportExportSection[]; columns?: ReportExportColumn[];
  fileName: string; scope?: ReportExportScope; subtitle?: string; filters?: ReportFilterSummary;
  institution?: { collegeName?: string; schoolYear?: string };
};
export type ExportBranding = { plpLogoUrl: string; collegeName?: string; collegeLogoUrl?: string; systemName: string };

const defaultBranding: ExportBranding = { plpLogoUrl: "/plp-institution-logo.png", systemName: "PLPass" };

async function resolveBranding(scope?: ReportExportScope) {
  let session = await repositories.authentication.getSession();
  if (typeof window !== "undefined" && (import.meta.env.VITE_DATA_SOURCE === "mock" || import.meta.env.MODE === "test")) {
    const stored = window.localStorage.getItem("plpass-development-session");
    if (stored) try { const local = JSON.parse(stored) as { userId: string; role: RepositoryContext["actorRole"] }; if (local.userId && local.role) session = { ...session, userId: local.userId, role: local.role }; } catch { /* keep session */ }
  }
  const context: RepositoryContext = { actorUserId: session.userId, actorRole: session.role };
  let schoolYear: string | undefined;
  try { schoolYear = (await repositories.systemSettings.getSettings(context)).currentSchoolYear; } catch { /* Some student contexts cannot read system settings. */ }
  if (scope?.type === "global" || (!scope && (session.role === "admin" || session.role === "student"))) return { branding: defaultBranding, context, schoolYear };
  let organizerId: string | undefined = scope?.type === "organizer" ? scope.organizerId : undefined;
  if (scope?.type === "event") {
    const event = await repositories.eventManagement.getEventById(scope.eventId, context);
    const organizers = await repositories.userManagement.listOrganizerProfiles({ pageIndex: 0, pageSize: 100 }, context);
    organizerId = organizers.items.find((item) => item.id === event.organizerId)?.id;
  }
  if (!organizerId) organizerId = (await repositories.userManagement.listOrganizerProfiles({ pageIndex: 0, pageSize: 1 }, context)).items[0]?.id;
  if (!organizerId) return { branding: defaultBranding, context, schoolYear };
  const branding = await repositories.userManagement.getOrganizerBranding(organizerId, context);
  return { branding: { ...defaultBranding, collegeName: branding.collegeName, collegeLogoUrl: branding.collegeLogoUrl }, context, schoolYear };
}

async function imageToPngDataUrl(url?: string) {
  if (!url) return undefined;
  try {
    const response = await fetch(url); if (!response.ok) return undefined;
    const blob = await response.blob(); const objectUrl = URL.createObjectURL(blob);
    try { const image = await new Promise<HTMLImageElement>((resolve, reject) => { const element = new Image(); element.onload = () => resolve(element); element.onerror = reject; element.src = objectUrl; }); const canvas = document.createElement("canvas"); canvas.width = 128; canvas.height = 128; canvas.getContext("2d")?.drawImage(image, 0, 0, 128, 128); return canvas.toDataURL("image/png"); } finally { URL.revokeObjectURL(objectUrl); }
  } catch { return undefined; }
}

function cleanTitle(value: string) { return value.replace(/\s+(?:XLSX|PDF)$/i, "").trim(); }
export function safeReportFileName(value: string) { return value.toLowerCase().replace(/\.(?:xlsx|pdf)$/i, "").replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "") || "plpass-report"; }
export function reportDateLabel(date = new Date()) { return date.toISOString().slice(0, 10); }
export function createReportFileName(reportType: string, scope = "all-users", extension: "xlsx" | "pdf") { return `${safeReportFileName(`plpass-${reportType}-${scope}`)}-${reportDateLabel()}.${extension}`; }

function displayHeader(key: string) {
  const aliases: Record<string, string> = { label: "Event Code", title: "Event Title", date: "Event Date", predictedAttend: "Predicted Attendance", predictedMiss: "Predicted Absences", fullName: "Full Name", yearSec: "Year and Section", attendanceRate: "Attendance Rate", studentId: "Student ID", studentName: "Student Name", eventCode: "Event Code", eventName: "Event Title", requestType: "Request Type", credentialStatus: "Credential Status", generatedAt: "Generated Date" };
  return aliases[key] ?? key.replace(/([a-z])([A-Z])/g, "$1 $2").replace(/[_-]+/g, " ").replace(/\b\w/g, (letter) => letter.toUpperCase());
}
function sectionsFor(options: ReportExportOptions): ReportExportSection[] { return options.sections?.length ? options.sections : [{ name: "Report", rows: options.rows ?? [], columns: options.columns }]; }
function headersFor(section: ReportExportSection) { return (section.columns?.map((column) => column.header) ?? Array.from(new Set(section.rows.flatMap((row) => Object.keys(row)).map(displayHeader)))).map((header) => header.toUpperCase()); }
function rawKey(section: ReportExportSection, header: string) { return section.columns?.find((column) => column.header.toUpperCase() === header.toUpperCase())?.key ?? Object.keys(section.rows[0] ?? {}).find((key) => displayHeader(key).toUpperCase() === header.toUpperCase()) ?? header; }
function valuesFor(section: ReportExportSection, headers: string[]) { return section.rows.map((row) => headers.map((header) => String(row[rawKey(section, header)] ?? ""))); }
function filterLines(filters: ReportFilterSummary | undefined, count: number) { return [...Object.entries(filters ?? {}).filter(([, value]) => value !== undefined && value !== null && String(value).trim() !== "").map(([key, value]) => `${displayHeader(key)}: ${String(value)}`), `Records Included: ${count}`]; }
function institutionHeader(branding: ExportBranding, institution?: ReportExportOptions["institution"]) { const college = institution?.collegeName || branding.collegeName || "ALL PARTICIPATING COLLEGES"; return ["PAMANTASAN NG LUNGSOD NG PASIG", `COLLEGE OF ${college.replace(/^college of\s+/i, "")}`.toUpperCase(), `SCHOOL YEAR ${institution?.schoolYear || "CURRENT SCHOOL YEAR"}`]; }

export async function exportReportPdf(options: ReportExportOptions) {
  const { branding, schoolYear } = await resolveBranding(options.scope); const sections = sectionsFor(options); const total = sections.reduce((sum, section) => sum + section.rows.length, 0); if (!total) throw new Error("There are no matching records to export.");
  const maxColumns = Math.max(...sections.map((section) => headersFor(section).length), 1); const doc = new jsPDF({ orientation: maxColumns > 7 ? "landscape" : "portrait", unit: "mm", format: "a4" }); const pageWidth = doc.internal.pageSize.getWidth(); const pageHeight = doc.internal.pageSize.getHeight();
  const [plpLogo, customLogo] = await Promise.all([imageToPngDataUrl(branding.plpLogoUrl), imageToPngDataUrl(branding.collegeLogoUrl)]); if (plpLogo) doc.addImage(plpLogo, "PNG", 14, 8, 22, 22); if (customLogo) doc.addImage(customLogo, "PNG", pageWidth - 36, 8, 22, 22);
  const header = institutionHeader(branding, { ...options.institution, schoolYear: options.institution?.schoolYear || schoolYear }); doc.setTextColor(21, 72, 34); doc.setFont("helvetica", "bold"); doc.setFontSize(12); header.forEach((line, index) => doc.text(line, pageWidth / 2, 13 + index * 5, { align: "center" })); if (options.subtitle) { doc.setFont("helvetica", "normal"); doc.setFontSize(8); doc.setTextColor(82, 97, 85); doc.text(options.subtitle, pageWidth / 2, 29, { align: "center" }); }
  doc.setDrawColor(21, 91, 42); doc.setLineWidth(0.4); doc.line(14, 34, pageWidth - 14, 34); doc.setFont("helvetica", "bold"); doc.setFontSize(15); doc.setTextColor(21, 72, 34); doc.text(cleanTitle(options.title), 14, 43); doc.setDrawColor(21, 91, 42); doc.line(14, 47, 66, 47); doc.setFont("helvetica", "normal"); doc.setFontSize(8); doc.setTextColor(82, 97, 85); const lines = filterLines(options.filters, total); lines.forEach((line, index) => doc.text(line, 14, 55 + index * 4)); let cursorY = 60 + lines.length * 4;
  sections.forEach((section) => { if (sections.length > 1) { doc.setFont("helvetica", "bold"); doc.setFontSize(10); doc.setTextColor(21, 72, 34); doc.text(section.name, 14, cursorY); cursorY += 5; } const headers = headersFor(section); autoTable(doc, { startY: cursorY, head: [headers], body: valuesFor(section, headers), theme: "striped", headStyles: { fillColor: [15, 66, 29], textColor: [255, 255, 255], fontStyle: "bold", fontSize: 8 }, alternateRowStyles: { fillColor: [245, 249, 245] }, styles: { fontSize: maxColumns > 7 ? 7 : 8, cellPadding: 2, lineColor: [220, 231, 221], lineWidth: 0.1 }, didDrawPage: (data) => { doc.setDrawColor(63, 116, 68); doc.line(14, pageHeight - 17, pageWidth - 14, pageHeight - 17); doc.setTextColor(107, 114, 128); doc.setFontSize(7); doc.setFont("helvetica", "normal"); doc.text(`${branding.systemName} · Generated ${reportDateLabel()}`, 14, pageHeight - 10); doc.text(`Page ${data.pageNumber}`, pageWidth - 14, pageHeight - 10, { align: "right" }); } }); cursorY = ((doc as jsPDF & { lastAutoTable?: { finalY: number } }).lastAutoTable?.finalY ?? cursorY) + 10; });
  doc.save(`${safeReportFileName(options.fileName)}.pdf`);
}

export async function exportReportXlsx(options: ReportExportOptions) {
  const { branding, schoolYear } = await resolveBranding(options.scope);
  const sections = sectionsFor(options);
  const total = sections.reduce((sum, section) => sum + section.rows.length, 0);
  if (!total) throw new Error("There are no matching records to export.");
  const [plpLogo, customLogo] = await Promise.all([imageToPngDataUrl(branding.plpLogoUrl), imageToPngDataUrl(branding.collegeLogoUrl)]);
  const { Workbook } = await import("exceljs");
  const workbook = new Workbook();
  const header = institutionHeader(branding, { ...options.institution, schoolYear: options.institution?.schoolYear || schoolYear });
  const filterEntries = Object.entries(options.filters ?? {}).filter(([, value]) => value !== undefined && value !== null && String(value).trim() !== "").map(([key, value]) => `${displayHeader(key)}: ${String(value)}`);
  const generatedLine = `Date Generated: ${new Date().toLocaleString()}  ·  Total Records: ${total}`;

  sections.forEach((section, index) => {
    const worksheet = workbook.addWorksheet((section.name || `Report ${index + 1}`).slice(0, 31));
    worksheet.views = [{ state: "frozen", ySplit: 8 + filterEntries.length, zoomScale: 95, showGridLines: false }];
    const headers = headersFor(section);
    const values = valuesFor(section, headers);
    const width = Math.max(headers.length, 4);
    const tableHeader = 8 + filterEntries.length;

    for (let row = 1; row <= 5; row++) worksheet.mergeCells(row, 1, row, width);
    header.forEach((line, rowIndex) => {
      const cell = worksheet.getCell(rowIndex + 1, 1);
      cell.value = line;
      cell.alignment = { horizontal: "center", vertical: "middle" };
      cell.font = { bold: true, size: rowIndex === 0 ? 15 : 11, color: { argb: "FF0F421D" } };
    });
    worksheet.getRow(1).height = 25;
    worksheet.getRow(2).height = 20;
    worksheet.getRow(3).height = 18;
    worksheet.getRow(4).height = 18;
    worksheet.getCell(4, 1).value = options.subtitle ?? "";
    worksheet.getCell(4, 1).font = { italic: true, size: 9, color: { argb: "FF526155" } };
    worksheet.getCell(4, 1).alignment = { horizontal: "center", vertical: "middle" };
    worksheet.getCell(5, 1).value = cleanTitle(options.title).toUpperCase();
    worksheet.getCell(5, 1).font = { bold: true, size: 14, color: { argb: "FF1A371F" } };
    worksheet.getCell(5, 1).alignment = { horizontal: "left", vertical: "middle" };
    worksheet.getRow(5).height = 26;

    worksheet.mergeCells(6, 1, 6, width);
    worksheet.getCell(6, 1).value = generatedLine;
    worksheet.getCell(6, 1).font = { size: 9, color: { argb: "FF526155" } };
    worksheet.getCell(6, 1).alignment = { horizontal: "center", vertical: "middle" };
    worksheet.getRow(6).height = 19;
    filterEntries.forEach((line, rowIndex) => {
      const row = 7 + rowIndex;
      worksheet.mergeCells(row, 1, row, width);
      worksheet.getCell(row, 1).value = line;
      worksheet.getCell(row, 1).font = { size: 9, color: { argb: "FF526155" } };
      worksheet.getCell(row, 1).alignment = { horizontal: "left", vertical: "middle" };
      worksheet.getRow(row).height = 18;
    });

    const contentWidths = headers.map((header, columnIndex) => Math.max(header.length, ...values.map((row) => String(row[columnIndex] ?? "").length)));
    worksheet.columns = headers.map((name, columnIndex) => ({ key: name, width: Math.min(Math.max(contentWidths[columnIndex] + 2, 13), 34) }));
    headers.forEach((name, columnIndex) => worksheet.getCell(tableHeader, columnIndex + 1).value = name);
    values.forEach((row) => worksheet.addRow(row));
    worksheet.autoFilter = { from: { row: tableHeader, column: 1 }, to: { row: tableHeader + section.rows.length, column: headers.length } };
    const headerRow = worksheet.getRow(tableHeader);
    headerRow.height = 27;
    headerRow.font = { bold: true, color: { argb: "FFFFFFFF" } };
    headerRow.fill = { type: "pattern", pattern: "solid", fgColor: { argb: "FF0F421D" } };
    headerRow.alignment = { horizontal: "center", vertical: "middle", wrapText: true };
    worksheet.eachRow((row, rowNumber) => {
      if (rowNumber < tableHeader) return;
      row.height = rowNumber === tableHeader ? 27 : 21;
      row.eachCell((cell) => {
        cell.alignment = { vertical: "middle", wrapText: true };
        cell.border = { top: { style: "thin", color: { argb: "FFDCE7DD" } }, left: { style: "thin", color: { argb: "FFDCE7DD" } }, bottom: { style: "thin", color: { argb: "FFDCE7DD" } }, right: { style: "thin", color: { argb: "FFDCE7DD" } } };
        if (rowNumber > tableHeader && (rowNumber - tableHeader) % 2 === 0) cell.fill = { type: "pattern", pattern: "solid", fgColor: { argb: "FFF4F8F4" } };
      });
    });
    worksheet.pageSetup = { orientation: headers.length > 7 ? "landscape" : "portrait", fitToWidth: 1, fitToHeight: 0, paperSize: 9, horizontalDpi: 300, verticalDpi: 300 };
    worksheet.pageSetup.printTitlesRow = `${tableHeader}:${tableHeader}`;
    worksheet.headerFooter.oddFooter = `&L${branding.systemName} · Generated ${reportDateLabel()}&RPage &P of &N`;
    if (plpLogo) worksheet.addImage(workbook.addImage({ base64: plpLogo, extension: "png" }), { tl: { col: 0, row: 0 }, ext: { width: 58, height: 58 } });
    if (customLogo) worksheet.addImage(workbook.addImage({ base64: customLogo, extension: "png" }), { tl: { col: Math.max(width - 1, 3), row: 0 }, ext: { width: 58, height: 58 } });
  });
  const buffer = await workbook.xlsx.writeBuffer();
  const blob = new Blob([buffer], { type: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet" });
  const url = URL.createObjectURL(blob);
  const anchor = document.createElement("a");
  anchor.href = url;
  anchor.download = `${safeReportFileName(options.fileName)}.xlsx`;
  anchor.click();
  URL.revokeObjectURL(url);
}
