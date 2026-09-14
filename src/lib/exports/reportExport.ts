import jsPDF from "jspdf";
import autoTable from "jspdf-autotable";
import { repositories } from "@/services/repositories";
import type { RepositoryContext } from "@/services/repositoryUtils";

export type ReportExportScope =
  | { type: "event"; eventId: string }
  | { type: "organizer"; organizerId: string }
  | { type: "global" };

export type ReportExportRow = Record<string, string | number | boolean | null | undefined>;

export type ReportExportOptions = {
  title: string;
  rows: ReportExportRow[];
  fileName: string;
  scope?: ReportExportScope;
  subtitle?: string;
};

export type ExportBranding = {
  plpLogoUrl: string;
  collegeName?: string;
  collegeLogoUrl?: string;
  systemName: string;
};

const defaultBranding: ExportBranding = {
  plpLogoUrl: "/plp-logo.svg",
  collegeName: undefined,
  collegeLogoUrl: undefined,
  systemName: "PLPass"
};

async function resolveBranding(scope?: ReportExportScope): Promise<{ branding: ExportBranding; context?: RepositoryContext }> {
  let session = await repositories.authentication.getSession();
  if (typeof window !== "undefined" && (import.meta.env.VITE_DATA_SOURCE === "mock" || import.meta.env.MODE === "test")) {
    const stored = window.localStorage.getItem("plpass-development-session");
    if (stored) {
      try {
        const localSession = JSON.parse(stored) as { userId: string; role: RepositoryContext["actorRole"] };
        if (localSession.userId && localSession.role) session = { ...session, userId: localSession.userId, role: localSession.role };
      } catch { /* Use the repository default when no development session is available. */ }
    }
  }
  const context: RepositoryContext = { actorUserId: session.userId, actorRole: session.role };
  if (scope?.type === "global" || (session.role === "admin" && !scope)) return { branding: defaultBranding, context };

  let organizerId: string | undefined = scope?.type === "organizer" ? scope.organizerId : undefined;
  if (scope?.type === "event") {
    const event = await repositories.eventManagement.getEventById(scope.eventId, context);
    const organizer = await repositories.userManagement.listOrganizerProfiles({ pageIndex: 0, pageSize: 100 }, context);
    organizerId = organizer.items.find((item) => item.id === event.organizerId)?.id;
  }
  if (!organizerId) {
    organizerId = (await repositories.userManagement.listOrganizerProfiles({ pageIndex: 0, pageSize: 1 }, context)).items[0]?.id;
  }
  if (!organizerId) return { branding: defaultBranding, context };
  const organizerBranding = await repositories.userManagement.getOrganizerBranding(organizerId, context);
  return { branding: { ...defaultBranding, collegeName: organizerBranding.collegeName, collegeLogoUrl: organizerBranding.collegeLogoUrl }, context };
}

async function imageToPngDataUrl(url?: string) {
  if (!url) return undefined;
  try {
    const response = await fetch(url);
    if (!response.ok) return undefined;
    const blob = await response.blob();
    const objectUrl = URL.createObjectURL(blob);
    try {
      const image = await new Promise<HTMLImageElement>((resolve, reject) => {
        const element = new Image();
        element.onload = () => resolve(element);
        element.onerror = reject;
        element.src = objectUrl;
      });
      const canvas = document.createElement("canvas");
      const size = 128;
      canvas.width = size;
      canvas.height = size;
      canvas.getContext("2d")?.drawImage(image, 0, 0, size, size);
      return canvas.toDataURL("image/png");
    } finally {
      URL.revokeObjectURL(objectUrl);
    }
  } catch {
    return undefined;
  }
}

function cleanTitle(value: string) {
  return value.replace(/\s+(?:XLSX|PDF)$/i, "").trim();
}

function safeFileName(value: string) {
  return value.toLowerCase().replace(/\.(?:xlsx|pdf)$/i, "").replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "") || "plpass-report";
}

function headersFor(rows: ReportExportRow[]) {
  return Array.from(new Set(rows.flatMap((row) => Object.keys(row))));
}

function valuesFor(rows: ReportExportRow[], headers: string[]) {
  return rows.map((row) => headers.map((header) => String(row[header] ?? "")));
}

export async function exportReportPdf(options: ReportExportOptions) {
  const { branding } = await resolveBranding(options.scope);
  const [plpLogo, collegeLogo] = await Promise.all([imageToPngDataUrl(branding.plpLogoUrl), imageToPngDataUrl(branding.collegeLogoUrl)]);
  const headers = headersFor(options.rows);
  const landscape = headers.length > 7;
  const doc = new jsPDF({ orientation: landscape ? "landscape" : "portrait", unit: "mm", format: "a4" });
  const pageWidth = doc.internal.pageSize.getWidth();
  const pageHeight = doc.internal.pageSize.getHeight();
  const reportTitle = cleanTitle(options.title);
  if (plpLogo) doc.addImage(plpLogo, "PNG", 16, 10, 22, 22);
  if (collegeLogo) doc.addImage(collegeLogo, "PNG", pageWidth - 38, 10, 22, 22);
  doc.setTextColor(21, 72, 34);
  doc.setFontSize(13);
  doc.setFont("helvetica", "bold");
  doc.text(branding.collegeName || "Pamantasan ng Lungsod ng Pasig", pageWidth / 2, 15, { align: "center" });
  doc.setFontSize(9);
  doc.setFont("helvetica", "normal");
  doc.text(branding.systemName, pageWidth / 2, 21, { align: "center" });
  doc.setTextColor(82, 97, 85);
  doc.setFontSize(8);
  doc.text(`Generated: ${new Date().toLocaleString("en-PH")} · ${options.rows.length} record(s)`, pageWidth / 2, 27, { align: "center" });
  doc.setDrawColor(63, 116, 68);
  doc.line(14, 34, pageWidth - 14, 34);
  doc.setTextColor(26, 55, 31);
  doc.setFontSize(16);
  doc.setFont("helvetica", "bold");
  doc.text(reportTitle, 14, 44);
  if (options.subtitle) {
    doc.setFont("helvetica", "normal");
    doc.setFontSize(8);
    doc.setTextColor(107, 114, 128);
    doc.text(options.subtitle, pageWidth - 14, 44, { align: "right" });
  }
  autoTable(doc, {
    startY: 51,
    head: [headers],
    body: valuesFor(options.rows, headers),
    theme: "striped",
    headStyles: { fillColor: [15, 66, 29], textColor: [255, 255, 255], fontStyle: "bold", fontSize: 8 },
    alternateRowStyles: { fillColor: [245, 249, 245] },
    styles: { fontSize: landscape ? 7 : 8, cellPadding: 2, lineColor: [220, 231, 221], lineWidth: 0.1 },
    didDrawPage: (data) => {
      doc.setDrawColor(63, 116, 68);
      doc.line(14, pageHeight - 17, pageWidth - 14, pageHeight - 17);
      doc.setTextColor(107, 114, 128);
      doc.setFontSize(7);
      doc.setFont("helvetica", "normal");
      doc.text(`${branding.systemName} · Electronically generated`, 14, pageHeight - 10);
      doc.text(`Page ${data.pageNumber}`, pageWidth - 14, pageHeight - 10, { align: "right" });
    }
  });
  doc.save(`${safeFileName(options.fileName)}.pdf`);
}

export async function exportReportXlsx(options: ReportExportOptions) {
  const { branding } = await resolveBranding(options.scope);
  const [plpLogo, collegeLogo] = await Promise.all([imageToPngDataUrl(branding.plpLogoUrl), imageToPngDataUrl(branding.collegeLogoUrl)]);
  const { Workbook } = await import("exceljs");
  const workbook = new Workbook();
  const worksheet = workbook.addWorksheet("Report");
  const headers = headersFor(options.rows);
  const headerRow = 8;
  worksheet.mergeCells(1, 1, 1, Math.max(headers.length, 4));
  worksheet.getCell(1, 1).value = branding.collegeName || "Pamantasan ng Lungsod ng Pasig";
  worksheet.getCell(1, 1).font = { bold: true, size: 16, color: { argb: "FF0F421D" } };
  worksheet.mergeCells(2, 1, 2, Math.max(headers.length, 4));
  worksheet.getCell(2, 1).value = branding.systemName;
  worksheet.getCell(2, 1).font = { size: 11, color: { argb: "FF3F7444" } };
  worksheet.mergeCells(3, 1, 3, Math.max(headers.length, 4));
  worksheet.getCell(3, 1).value = `Generated: ${new Date().toLocaleString("en-PH")} · ${options.rows.length} record(s)`;
  worksheet.getCell(3, 1).font = { size: 9, color: { argb: "FF6B7280" } };
  worksheet.mergeCells(5, 1, 5, Math.max(headers.length, 4));
  worksheet.getCell(5, 1).value = cleanTitle(options.title);
  worksheet.getCell(5, 1).font = { bold: true, size: 14, color: { argb: "FF1A371F" } };
  if (options.subtitle) worksheet.getCell(6, 1).value = options.subtitle;
  if (plpLogo) worksheet.addImage(workbook.addImage({ base64: plpLogo, extension: "png" }), { tl: { col: 0, row: 0 }, ext: { width: 58, height: 58 } });
  if (collegeLogo) worksheet.addImage(workbook.addImage({ base64: collegeLogo, extension: "png" }), { tl: { col: Math.max(headers.length - 1, 3), row: 0 }, ext: { width: 58, height: 58 } });
  worksheet.columns = headers.map((header) => ({ key: header, width: Math.min(Math.max(header.length + 2, 14), 36) }));
  while (worksheet.rowCount < headerRow) worksheet.addRow([]);
  // Keep the report table below the branded header block.
  headers.forEach((header, index) => { worksheet.getCell(headerRow, index + 1).value = header; });
  options.rows.forEach((row) => worksheet.addRow(headers.map((header) => row[header] ?? "")));
  worksheet.views = [{ state: "frozen", ySplit: headerRow }];
  if (headers.length) worksheet.autoFilter = { from: { row: headerRow, column: 1 }, to: { row: headerRow + Math.max(options.rows.length, 1), column: headers.length } };
  const tableHeader = worksheet.getRow(headerRow);
  tableHeader.height = 24;
  tableHeader.font = { bold: true, color: { argb: "FFFFFFFF" } };
  tableHeader.fill = { type: "pattern", pattern: "solid", fgColor: { argb: "FF0F421D" } };
  tableHeader.alignment = { vertical: "middle", wrapText: true };
  worksheet.eachRow((row, rowNumber) => {
    if (rowNumber < headerRow) return;
    row.eachCell((cell) => {
      cell.border = { top: { style: "thin", color: { argb: "FFDCE7DD" } }, left: { style: "thin", color: { argb: "FFDCE7DD" } }, bottom: { style: "thin", color: { argb: "FFDCE7DD" } }, right: { style: "thin", color: { argb: "FFDCE7DD" } } };
      cell.alignment = { vertical: "middle", wrapText: true };
      if (rowNumber > headerRow && rowNumber % 2 === 1) cell.fill = { type: "pattern", pattern: "solid", fgColor: { argb: "FFF5F9F5" } };
    });
  });
  const buffer = await workbook.xlsx.writeBuffer();
  const safeName = safeFileName(options.fileName);
  const blob = new Blob([buffer], { type: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet" });
  const url = URL.createObjectURL(blob);
  const anchor = document.createElement("a");
  anchor.href = url;
  anchor.download = `${safeName}.xlsx`;
  anchor.click();
  URL.revokeObjectURL(url);
}
