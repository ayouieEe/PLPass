import jsPDF from "jspdf";
import autoTable from "jspdf-autotable";
import type { Worksheet } from "exceljs";
import { repositories } from "@/services/repositories";
import type { RepositoryContext } from "@/services/repositoryUtils";

export type ReportExportScope = { type: "event"; eventId: string } | { type: "organizer"; organizerId: string } | { type: "global" };
export type ReportExportRow = Record<string, string | number | boolean | null | undefined>;
export type ReportExportColumn = { key: string; header: string; width?: number };
export type ReportExportSection = { name: string; rows: ReportExportRow[]; columns?: ReportExportColumn[] };
export type ReportFilterSummary = Record<string, string | number | boolean | null | undefined>;
export type ReportFilterState = ReportFilterSummary & { search?: string; eventId?: string; schoolYear?: string; dateFrom?: string; dateTo?: string };

export type ReportSummaryCard = {
  label: string;
  value: string;
  subtitle?: string;
  colorTheme?: "emerald" | "blue" | "amber" | "purple" | "rose";
};

export type ReportInsightsNarrative = {
  title?: string;
  executiveSummary: string;
  keyFindings: string[];
  recommendations?: string[];
};

export type ReportChartItem = {
  title?: string;
  imageDataUrl: string;
  width?: number; // layout width in mm
  height?: number; // layout height in mm
  caption?: string;
  description?: string;
  recommendations?: string[];
};

export type ReportExportRequest = ReportExportOptions;
export type ReportExportOptions = {
  title: string;
  reportType?: string;
  rows?: ReportExportRow[];
  sections?: ReportExportSection[];
  columns?: ReportExportColumn[];
  fileName: string;
  scope?: ReportExportScope;
  subtitle?: string;
  filters?: ReportFilterSummary;
  institution?: { collegeName?: string; schoolYear?: string };
  summaryCards?: ReportSummaryCard[];
  insightsNarrative?: ReportInsightsNarrative;
  charts?: ReportChartItem[];
};

export type ExportBranding = { plpLogoUrl: string; collegeName?: string; collegeLogoUrl?: string; systemName: string };

const defaultBranding: ExportBranding = { plpLogoUrl: "/plp-institution-logo.png", systemName: "PLPass" };

async function resolveBranding(scope?: ReportExportScope) {
  let session = await repositories.authentication.getSession();
  if (typeof window !== "undefined" && (import.meta.env.VITE_DATA_SOURCE === "mock" || import.meta.env.MODE === "test")) {
    const stored = window.localStorage.getItem("plpass-development-session");
    if (stored) {
      try {
        const local = JSON.parse(stored) as { userId: string; role: RepositoryContext["actorRole"] };
        if (local.userId && local.role) session = { ...session, userId: local.userId, role: local.role };
      } catch {
        /* keep session */
      }
    }
  }
  const context: RepositoryContext = { actorUserId: session.userId, actorRole: session.role };
  let schoolYear: string | undefined;
  try {
    schoolYear = (await repositories.systemSettings.getSettings(context)).currentSchoolYear;
  } catch {
    /* Some student contexts cannot read system settings. */
  }
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
      canvas.width = 128;
      canvas.height = 128;
      canvas.getContext("2d")?.drawImage(image, 0, 0, 128, 128);
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

function cleanBase64(dataUrl?: string): string {
  if (!dataUrl) return "";
  return dataUrl.replace(/^data:[^;]+;base64,/, "").trim();
}

export function getColumnLetter(colIndex: number): string {
  let temp = 0;
  let letter = "";
  let col = colIndex;
  while (col > 0) {
    temp = (col - 1) % 26;
    letter = String.fromCharCode(65 + temp) + letter;
    col = Math.floor((col - 1) / 26);
  }
  return letter || "A";
}

export function safeReportFileName(value: string) {
  return value.toLowerCase().replace(/\.(?:xlsx|pdf)$/i, "").replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "") || "plpass-report";
}

export function reportDateLabel(date = new Date()) {
  return date.toISOString().slice(0, 10);
}

export function createReportFileName(reportType: string, scope = "all-users", extension: "xlsx" | "pdf") {
  return `${safeReportFileName(`plpass-${reportType}-${scope}`)}-${reportDateLabel()}.${extension}`;
}

function displayHeader(key: string) {
  const aliases: Record<string, string> = {
    label: "Event Code",
    title: "Event Title",
    date: "Event Date",
    predictedAttend: "Predicted Attendance",
    predictedMiss: "Predicted Absences",
    fullName: "Full Name",
    yearSec: "Year and Section",
    attendanceRate: "Attendance Rate",
    studentId: "Student ID",
    studentName: "Student Name",
    eventCode: "Event Code",
    eventName: "Event Title",
    requestType: "Request Type",
    credentialStatus: "Credential Status",
    generatedAt: "Generated Date"
  };
  return aliases[key] ?? key.replace(/([a-z])([A-Z])/g, "$1 $2").replace(/[_-]+/g, " ").replace(/\b\w/g, (letter) => letter.toUpperCase());
}

function sectionsFor(options: ReportExportOptions): ReportExportSection[] {
  return options.sections?.length ? options.sections : [{ name: "Report", rows: options.rows ?? [], columns: options.columns }];
}

function headersFor(section: ReportExportSection) {
  return (section.columns?.map((column) => column.header) ?? Array.from(new Set(section.rows.flatMap((row) => Object.keys(row)).map(displayHeader)))).map((header) => header.toUpperCase());
}

function rawKey(section: ReportExportSection, header: string) {
  return section.columns?.find((column) => column.header.toUpperCase() === header.toUpperCase())?.key ?? Object.keys(section.rows[0] ?? {}).find((key) => displayHeader(key).toUpperCase() === header.toUpperCase()) ?? header;
}

function valuesFor(section: ReportExportSection, headers: string[]) {
  return section.rows.map((row) => headers.map((header) => String(row[rawKey(section, header)] ?? "")));
}

function filterLines(filters: ReportFilterSummary | undefined, count: number) {
  return [
    ...Object.entries(filters ?? {})
      .filter(([, value]) => value !== undefined && value !== null && String(value).trim() !== "")
      .map(([key, value]) => `${displayHeader(key)}: ${String(value)}`),
    `Records Included: ${count}`
  ];
}

function institutionHeader(branding: ExportBranding, institution?: ReportExportOptions["institution"]) {
  const college = institution?.collegeName || branding.collegeName || "ALL PARTICIPATING COLLEGES";
  return ["PAMANTASAN NG LUNGSOD NG PASIG", `COLLEGE OF ${college.replace(/^college of\s+/i, "")}`.toUpperCase(), `SCHOOL YEAR ${institution?.schoolYear || "CURRENT SCHOOL YEAR"}`];
}

/**
 * Safely merges cells only when start and end coordinates differ.
 * Prevents invalid single-cell OpenXML merge references like `<mergeCell ref="A1:A1"/>`.
 */
function safeMerge(ws: Worksheet, startRow: number, startCol: number, endRow: number, endCol: number) {
  if (startRow === endRow && startCol === endCol) return;
  if (endRow < startRow || endCol < startCol) return;
  ws.mergeCells(startRow, startCol, endRow, endCol);
}

export async function exportReportPdf(options: ReportExportOptions) {
  const { branding, schoolYear } = await resolveBranding(options.scope);
  const sections = sectionsFor(options);
  const total = sections.reduce((sum, section) => sum + section.rows.length, 0);
  if (!total && !options.summaryCards && !options.insightsNarrative) {
    throw new Error("There are no matching records to export.");
  }

  const maxColumns = Math.max(...sections.map((section) => headersFor(section).length), 1);
  const isLandscape = maxColumns > 7 || (options.charts && options.charts.length > 1);
  const doc = new jsPDF({ orientation: isLandscape ? "landscape" : "portrait", unit: "mm", format: "a4" });
  const pageWidth = doc.internal.pageSize.getWidth();
  const pageHeight = doc.internal.pageSize.getHeight();

  // Institution Header logos and text (Preserved exact header format)
  const [plpLogo, customLogo] = await Promise.all([imageToPngDataUrl(branding.plpLogoUrl), imageToPngDataUrl(branding.collegeLogoUrl)]);
  if (plpLogo) doc.addImage(plpLogo, "PNG", 14, 8, 22, 22);
  if (customLogo) doc.addImage(customLogo, "PNG", pageWidth - 36, 8, 22, 22);

  const header = institutionHeader(branding, { ...options.institution, schoolYear: options.institution?.schoolYear || schoolYear });
  doc.setTextColor(21, 72, 34);
  doc.setFont("helvetica", "bold");
  doc.setFontSize(12);
  header.forEach((line, index) => doc.text(line, pageWidth / 2, 13 + index * 5, { align: "center" }));

  if (options.subtitle) {
    doc.setFont("helvetica", "normal");
    doc.setFontSize(8);
    doc.setTextColor(82, 97, 85);
    doc.text(options.subtitle, pageWidth / 2, 29, { align: "center" });
  }

  // Header separator line & Document Title
  doc.setDrawColor(21, 91, 42);
  doc.setLineWidth(0.4);
  doc.line(14, 34, pageWidth - 14, 34);

  doc.setFont("helvetica", "bold");
  doc.setFontSize(15);
  doc.setTextColor(21, 72, 34);
  doc.text(cleanTitle(options.title), 14, 43);

  doc.setDrawColor(21, 91, 42);
  doc.line(14, 47, 66, 47);

  // Filter Summary Box
  doc.setFont("helvetica", "normal");
  doc.setFontSize(8);
  doc.setTextColor(82, 97, 85);
  const lines = filterLines(options.filters, total);
  lines.forEach((line, index) => doc.text(line, 14, 55 + index * 4.5));
  let cursorY = 58 + lines.length * 4.5;

  // 1. Render KPI Summary Metric Cards (If present)
  if (options.summaryCards && options.summaryCards.length > 0) {
    const cards = options.summaryCards;
    const cardGap = 4;
    const count = cards.length;
    const totalAvailWidth = pageWidth - 28;
    const cardWidth = (totalAvailWidth - cardGap * (count - 1)) / count;
    const cardHeight = 20;

    cards.forEach((card, index) => {
      const cardX = 14 + index * (cardWidth + cardGap);

      // Card Background & Border
      doc.setFillColor(245, 249, 245);
      doc.setDrawColor(200, 220, 202);
      doc.roundedRect(cardX, cursorY, cardWidth, cardHeight, 2.5, 2.5, "FD");

      // Left Accent bar
      const accentColors: Record<string, [number, number, number]> = {
        emerald: [22, 163, 74],
        blue: [37, 99, 235],
        amber: [217, 119, 6],
        purple: [147, 51, 234],
        rose: [225, 29, 72]
      };
      const accent = accentColors[card.colorTheme ?? "emerald"] ?? accentColors.emerald;
      doc.setFillColor(accent[0], accent[1], accent[2]);
      doc.rect(cardX, cursorY, 2.5, cardHeight, "F");

      // Card Label
      doc.setFont("helvetica", "bold");
      doc.setFontSize(7);
      doc.setTextColor(accent[0], accent[1], accent[2]);
      doc.text(card.label.toUpperCase(), cardX + 5, cursorY + 5.5);

      // Card Main Value
      doc.setFont("helvetica", "bold");
      doc.setFontSize(11);
      doc.setTextColor(15, 23, 42);
      doc.text(card.value, cardX + 5, cursorY + 11.5);

      // Card Subtitle
      if (card.subtitle) {
        doc.setFont("helvetica", "normal");
        doc.setFontSize(6.5);
        doc.setTextColor(100, 116, 139);
        const maxChars = Math.floor(cardWidth / 2.2);
        const truncatedSub = card.subtitle.length > maxChars ? `${card.subtitle.slice(0, maxChars - 2)}…` : card.subtitle;
        doc.text(truncatedSub, cardX + 5, cursorY + 16.5);
      }
    });

    cursorY += cardHeight + 8;
  }

  // 2. Render Executive Summary & Insights Narrative Section (With exact bounds calculation)
  if (options.insightsNarrative) {
    const narrative = options.insightsNarrative;

    // Safety margin to ensure text NEVER exceeds card right boundary
    const maxTextWidth = pageWidth - 48; // Leaves 10mm padding inside card on left and right

    doc.setFont("helvetica", "normal");
    doc.setFontSize(8.5);

    // Pre-calculate text splits using standard UTF-8 safe bullet characters
    const execLines = doc.splitTextToSize(narrative.executiveSummary, maxTextWidth);
    const findingLines = (narrative.keyFindings ?? []).map((f) => ({
      text: f,
      split: doc.splitTextToSize(`• ${f}`, maxTextWidth - 4)
    }));
    const recLines = (narrative.recommendations ?? []).map((r) => ({
      text: r,
      split: doc.splitTextToSize(`• ${r}`, maxTextWidth - 4)
    }));

    const execHeight = execLines.length * 4.2;
    const findingsHeaderHeight = narrative.keyFindings?.length ? 6 : 0;
    const findingsTextHeight = findingLines.reduce((acc, f) => acc + f.split.length * 4.0, 0);
    const recsHeaderHeight = narrative.recommendations?.length ? 6 : 0;
    const recsTextHeight = recLines.reduce((acc, r) => acc + r.split.length * 4.0, 0);

    const boxInnerPadding = 8;
    const boxHeight = boxInnerPadding + execHeight + (findingsHeaderHeight ? 3 + findingsHeaderHeight + findingsTextHeight : 0) + (recsHeaderHeight ? 3 + recsHeaderHeight + recsTextHeight : 0) + 4;

    // Check page remaining space
    if (cursorY + boxHeight + 15 > pageHeight - 20) {
      doc.addPage();
      cursorY = 20;
    }

    // Section Title
    doc.setFont("helvetica", "bold");
    doc.setFontSize(11);
    doc.setTextColor(21, 72, 34);
    doc.text(narrative.title ?? "EXECUTIVE ANALYTICAL SUMMARY & INSIGHTS", 14, cursorY);
    cursorY += 6;

    // Soft Green Highlight Card Background
    doc.setFillColor(243, 248, 244);
    doc.setDrawColor(180, 215, 185);
    doc.roundedRect(14, cursorY, pageWidth - 28, boxHeight, 3, 3, "FD");

    // Dark Green Left Accent Line
    doc.setFillColor(21, 91, 42);
    doc.rect(14, cursorY, 3.5, boxHeight, "F");

    let innerY = cursorY + 6;

    // Executive Summary Text
    doc.setFont("helvetica", "normal");
    doc.setFontSize(8.5);
    doc.setTextColor(30, 41, 59);
    doc.text(execLines, 21, innerY);
    innerY += execLines.length * 4.2 + 3;

    // Key Analytical Findings Header & Bullets
    if (narrative.keyFindings && narrative.keyFindings.length > 0) {
      doc.setFont("helvetica", "bold");
      doc.setFontSize(8.5);
      doc.setTextColor(21, 72, 34);
      doc.text("Key Analytical Findings:", 21, innerY);
      innerY += 5;

      doc.setFont("helvetica", "normal");
      doc.setFontSize(8);
      doc.setTextColor(51, 65, 85);

      findingLines.forEach((f) => {
        doc.text(f.split, 23, innerY);
        innerY += f.split.length * 4.0;
      });
      innerY += 3;
    }

    // Strategic Recommendations Header & Bullets
    if (narrative.recommendations && narrative.recommendations.length > 0) {
      doc.setFont("helvetica", "bold");
      doc.setFontSize(8.5);
      doc.setTextColor(15, 118, 110);
      doc.text("Strategic Recommendations:", 21, innerY);
      innerY += 5;

      doc.setFont("helvetica", "normal");
      doc.setFontSize(8);
      doc.setTextColor(30, 41, 59);

      recLines.forEach((r) => {
        doc.text(r.split, 23, innerY);
        innerY += r.split.length * 4.0;
      });
    }

    cursorY += boxHeight + 8;
  }

  // 3. Render Charts (If present)
  if (options.charts && options.charts.length > 0) {
    for (const chart of options.charts) {
      const chartMmHeight = chart.height ?? (isLandscape ? 65 : 75);
      const chartMmWidth = chart.width ?? (isLandscape ? 150 : 170);

      if (cursorY + chartMmHeight + 10 > pageHeight - 20) {
        doc.addPage();
        cursorY = 20;
      }

      if (chart.title) {
        doc.setFont("helvetica", "bold");
        doc.setFontSize(10);
        doc.setTextColor(21, 72, 34);
        doc.text(chart.title, 14, cursorY);
        cursorY += 5;
      }

      const chartX = 14 + (pageWidth - 28 - chartMmWidth) / 2;
      doc.addImage(chart.imageDataUrl, "PNG", chartX, cursorY, chartMmWidth, chartMmHeight);
      cursorY += chartMmHeight + 2;

      if (chart.caption) {
        doc.setFont("helvetica", "italic");
        doc.setFontSize(7.5);
        doc.setTextColor(100, 116, 139);
        doc.text(chart.caption, pageWidth / 2, cursorY, { align: "center" });
        cursorY += 6;
      } else {
        cursorY += 2;
      }

      // Render Description & Recommendations Highlight Box (if present)
      if (chart.description || (chart.recommendations && chart.recommendations.length > 0)) {
        const boxWidth = pageWidth - 28;
        const maxTextWidth = boxWidth - 14;

        const descLines = chart.description ? doc.splitTextToSize(chart.description, maxTextWidth) : [];
        const recLines = (chart.recommendations ?? []).map((r) => ({
          text: r,
          split: doc.splitTextToSize(`• ${r}`, maxTextWidth - 4)
        }));

        const descHeight = descLines.length > 0 ? 5 + descLines.length * 3.8 : 0;
        const recsHeaderHeight = recLines.length > 0 ? 5 : 0;
        const recsTextHeight = recLines.reduce((acc, r) => acc + r.split.length * 3.8, 0);

        const calloutHeight = 6 + descHeight + (descHeight && recsHeaderHeight ? 2 : 0) + recsHeaderHeight + recsTextHeight + 4;

        if (cursorY + calloutHeight + 10 > pageHeight - 20) {
          doc.addPage();
          cursorY = 20;
        }

        // Highlight Callout Card Background
        doc.setFillColor(243, 248, 244);
        doc.setDrawColor(180, 215, 185);
        doc.roundedRect(14, cursorY, boxWidth, calloutHeight, 2.5, 2.5, "FD");

        // Dark Emerald Left Accent Bar
        doc.setFillColor(21, 128, 61);
        doc.rect(14, cursorY, 3, calloutHeight, "F");

        let boxY = cursorY + 5;

        if (descLines.length > 0) {
          doc.setFont("helvetica", "bold");
          doc.setFontSize(8);
          doc.setTextColor(21, 72, 34);
          doc.text("Chart Analytical Summary:", 20, boxY);
          boxY += 4.5;

          doc.setFont("helvetica", "normal");
          doc.setFontSize(7.5);
          doc.setTextColor(30, 41, 59);
          doc.text(descLines, 20, boxY);
          boxY += descLines.length * 3.8 + 2;
        }

        if (recLines.length > 0) {
          doc.setFont("helvetica", "bold");
          doc.setFontSize(8);
          doc.setTextColor(21, 72, 34);
          doc.text("Actionable Recommendations:", 20, boxY);
          boxY += 4.5;

          doc.setFont("helvetica", "normal");
          doc.setFontSize(7.5);
          doc.setTextColor(30, 41, 59);

          recLines.forEach((r) => {
            doc.text(r.split, 22, boxY);
            boxY += r.split.length * 3.8;
          });
        }

        cursorY += calloutHeight + 6;
      } else {
        cursorY += 4;
      }
    }
  }

  // 4. Render Data Tables
  sections.forEach((section) => {
    if (cursorY + 30 > pageHeight - 20) {
      doc.addPage();
      cursorY = 20;
    }

    if (sections.length > 1 || options.charts?.length || options.insightsNarrative) {
      doc.setFont("helvetica", "bold");
      doc.setFontSize(10);
      doc.setTextColor(21, 72, 34);
      doc.text(section.name, 14, cursorY);
      cursorY += 5;
    }

    const headers = headersFor(section);
    autoTable(doc, {
      startY: cursorY,
      head: [headers],
      body: valuesFor(section, headers),
      theme: "striped",
      headStyles: { fillColor: [15, 66, 29], textColor: [255, 255, 255], fontStyle: "bold", fontSize: 8, font: "helvetica" },
      alternateRowStyles: { fillColor: [245, 249, 245] },
      styles: { font: "helvetica", fontSize: maxColumns > 7 ? 7 : 8, cellPadding: 2, lineColor: [220, 231, 221], lineWidth: 0.1 },
      didDrawPage: (data) => {
        doc.setDrawColor(63, 116, 68);
        doc.line(14, pageHeight - 17, pageWidth - 14, pageHeight - 17);
        doc.setTextColor(107, 114, 128);
        doc.setFontSize(7);
        doc.setFont("helvetica", "normal");
        doc.text(`${branding.systemName} · Generated ${reportDateLabel()}`, 14, pageHeight - 10);
        doc.text(`Page ${data.pageNumber}`, pageWidth - 14, pageHeight - 10, { align: "right" });
      }
    });
    cursorY = ((doc as jsPDF & { lastAutoTable?: { finalY: number } }).lastAutoTable?.finalY ?? cursorY) + 10;
  });

  doc.save(`${safeReportFileName(options.fileName)}.pdf`);
}

function safeSheetName(name: string, index = 0, existingNames: Set<string> = new Set()): string {
  const clean = name.replace(/[\\/?*:[\]]/g, " ").trim().slice(0, 28) || `Sheet ${index + 1}`;
  let finalName = clean;
  let counter = 1;
  while (existingNames.has(finalName.toLowerCase())) {
    finalName = `${clean.slice(0, 24)} (${counter})`;
    counter++;
  }
  existingNames.add(finalName.toLowerCase());
  return finalName;
}

/**
 * Clean, native Excel spreadsheet exporter.
 * Multi-tab support: creates an Overview tab for multi-section reports alongside
 * dedicated data section worksheets, with clean grid structure, freeze panes,
 * and auto-fit column widths.
 */
export async function exportReportXlsx(options: ReportExportOptions) {
  const { branding, schoolYear } = await resolveBranding(options.scope);
  const sections = sectionsFor(options);
  const total = sections.reduce((sum, section) => sum + section.rows.length, 0);
  if (!total && !options.summaryCards && !options.insightsNarrative) {
    throw new Error("There are no matching records to export.");
  }

  const [plpLogo, customLogo] = await Promise.all([imageToPngDataUrl(branding.plpLogoUrl), imageToPngDataUrl(branding.collegeLogoUrl)]);
  const { Workbook } = await import("exceljs");
  const workbook = new Workbook();
  const sheetNames = new Set<string>();

  const header = institutionHeader(branding, { ...options.institution, schoolYear: options.institution?.schoolYear || schoolYear });
  const filterEntries = Object.entries(options.filters ?? {})
    .filter(([, value]) => value !== undefined && value !== null && String(value).trim() !== "")
    .map(([key, value]) => `${displayHeader(key)}: ${String(value)}`);

  function renderHeaderBanner(ws: Worksheet, maxCols: number, sub: string, mainTitle: string) {
    for (let row = 1; row <= 5; row++) safeMerge(ws, row, 1, row, maxCols);
    header.forEach((line, rowIndex) => {
      const cell = ws.getCell(rowIndex + 1, 1);
      cell.value = line;
      cell.alignment = { horizontal: "center", vertical: "middle" };
      cell.font = { bold: true, size: rowIndex === 0 ? 14 : 10, color: { argb: "FF0F421D" } };
    });
    ws.getRow(1).height = 24;
    ws.getRow(2).height = 19;
    ws.getRow(3).height = 17;
    ws.getRow(4).height = 17;
    ws.getCell(4, 1).value = sub;
    ws.getCell(4, 1).font = { italic: true, size: 9, color: { argb: "FF526155" } };

    ws.getCell(5, 1).value = mainTitle.toUpperCase();
    ws.getCell(5, 1).font = { bold: true, size: 13, color: { argb: "FF1A371F" } };
    ws.getCell(5, 1).alignment = { horizontal: "left", vertical: "middle" };
    ws.getRow(5).height = 24;

    if (plpLogo) {
      try {
        const cleanPlp = cleanBase64(plpLogo);
        if (cleanPlp) {
          const logoId = workbook.addImage({ base64: cleanPlp, extension: "png" });
          ws.addImage(logoId, { tl: { col: 0.1, row: 0.1 }, ext: { width: 48, height: 48 } });
        }
      } catch {
        /* ignore logo rendering errors */
      }
    }
    if (customLogo) {
      try {
        const cleanCustom = cleanBase64(customLogo);
        if (cleanCustom) {
          const logoId = workbook.addImage({ base64: cleanCustom, extension: "png" });
          ws.addImage(logoId, { tl: { col: Math.max(maxCols - 1, 1) + 0.1, row: 0.1 }, ext: { width: 48, height: 48 } });
        }
      } catch {
        /* ignore logo rendering errors */
      }
    }
  }

  const isMultiTab = sections.length > 1 || (Boolean(options.summaryCards || options.insightsNarrative) && sections.length > 1);

  if (isMultiTab) {
    // 1. Overview Tab
    const overviewWs = workbook.addWorksheet(safeSheetName("Overview", 0, sheetNames));
    overviewWs.views = [{ state: "frozen", ySplit: 6, showGridLines: true }];

    const overviewMaxCols = 5;
    renderHeaderBanner(overviewWs, overviewMaxCols, options.subtitle ?? "Executive Dashboard & Report Index", cleanTitle(options.title));

    const generatedLine = `Date Generated: ${new Date().toLocaleString()}  ·  Total Data Tabs: ${sections.length}  ·  Total Records: ${total}`;

    safeMerge(overviewWs, 6, 1, 6, overviewMaxCols);
    overviewWs.getCell(6, 1).value = generatedLine;
    overviewWs.getCell(6, 1).font = { size: 9, color: { argb: "FF526155" } };
    overviewWs.getRow(6).height = 18;

    filterEntries.forEach((line, rowIndex) => {
      const row = 7 + rowIndex;
      safeMerge(overviewWs, row, 1, row, overviewMaxCols);
      overviewWs.getCell(row, 1).value = line;
      overviewWs.getCell(row, 1).font = { size: 9, color: { argb: "FF526155" } };
      overviewWs.getRow(row).height = 17;
    });

    let curRow = 7 + filterEntries.length + 1;

    // KPI Summary
    if (options.summaryCards && options.summaryCards.length > 0) {
      curRow++;
      safeMerge(overviewWs, curRow, 1, curRow, overviewMaxCols);
      const titleCell = overviewWs.getCell(curRow, 1);
      titleCell.value = "KEY PERFORMANCE SUMMARY";
      titleCell.font = { bold: true, size: 10, color: { argb: "FF0F421D" } };
      overviewWs.getRow(curRow).height = 20;
      curRow++;

      options.summaryCards.forEach((card, idx) => {
        const colIdx = idx + 1;
        if (colIdx <= overviewMaxCols) {
          const hCell = overviewWs.getCell(curRow, colIdx);
          hCell.value = card.label.toUpperCase();
          hCell.font = { bold: true, size: 8.5, color: { argb: "FFFFFFFF" } };
          hCell.fill = { type: "pattern", pattern: "solid", fgColor: { argb: "FF0F421D" } };
          hCell.alignment = { horizontal: "center", vertical: "middle" };
        }
      });
      overviewWs.getRow(curRow).height = 22;
      curRow++;

      options.summaryCards.forEach((card, idx) => {
        const colIdx = idx + 1;
        if (colIdx <= overviewMaxCols) {
          const vCell = overviewWs.getCell(curRow, colIdx);
          vCell.value = `${card.value}${card.subtitle ? `\n${card.subtitle}` : ""}`;
          vCell.font = { bold: true, size: 11, color: { argb: "FF0F172A" } };
          vCell.fill = { type: "pattern", pattern: "solid", fgColor: { argb: "FFF0FDF4" } };
          vCell.alignment = { horizontal: "center", vertical: "middle", wrapText: true };
          vCell.border = {
            top: { style: "thin", color: { argb: "FFBBF7D0" } },
            left: { style: "thin", color: { argb: "FFBBF7D0" } },
            bottom: { style: "thin", color: { argb: "FFBBF7D0" } },
            right: { style: "thin", color: { argb: "FFBBF7D0" } }
          };
        }
      });
      overviewWs.getRow(curRow).height = 36;
      curRow += 2;
    }

    // Insights Narrative
    if (options.insightsNarrative) {
      curRow++;
      safeMerge(overviewWs, curRow, 1, curRow, overviewMaxCols);
      overviewWs.getCell(curRow, 1).value = options.insightsNarrative.title ?? "EXECUTIVE ANALYTICAL INSIGHTS";
      overviewWs.getCell(curRow, 1).font = { bold: true, size: 10.5, color: { argb: "FF0F421D" } };
      overviewWs.getRow(curRow).height = 22;
      curRow++;

      const insightHeaders = ["Analysis Topic", "Executive Overview", "Key Findings", "Strategic Recommendations"];
      insightHeaders.slice(0, overviewMaxCols).forEach((hText, idx) => {
        const cell = overviewWs.getCell(curRow, idx + 1);
        cell.value = hText;
        cell.font = { bold: true, size: 9, color: { argb: "FFFFFFFF" } };
        cell.fill = { type: "pattern", pattern: "solid", fgColor: { argb: "FF15803D" } };
        cell.alignment = { horizontal: "center", vertical: "middle" };
      });
      overviewWs.getRow(curRow).height = 24;
      curRow++;

      const summaryData = [
        options.title,
        options.insightsNarrative.executiveSummary,
        (options.insightsNarrative.keyFindings ?? []).map((f) => `• ${f}`).join("\n"),
        (options.insightsNarrative.recommendations ?? []).map((r) => `• ${r}`).join("\n")
      ];

      summaryData.slice(0, overviewMaxCols).forEach((val, idx) => {
        const cell = overviewWs.getCell(curRow, idx + 1);
        cell.value = val;
        cell.font = { size: 9, color: { argb: "FF1E293B" } };
        cell.fill = { type: "pattern", pattern: "solid", fgColor: { argb: "FFF8FAF8" } };
        cell.alignment = { horizontal: "left", vertical: "top", wrapText: true };
        cell.border = {
          top: { style: "thin", color: { argb: "FFE2E8F0" } },
          left: { style: "thin", color: { argb: "FFE2E8F0" } },
          bottom: { style: "thin", color: { argb: "FFE2E8F0" } },
          right: { style: "thin", color: { argb: "FFE2E8F0" } }
        };
      });
      overviewWs.getRow(curRow).height = 84;
      curRow += 2;
    }

    // Render Charts on Overview Tab
    if (options.charts && options.charts.length > 0) {
      curRow++;
      safeMerge(overviewWs, curRow, 1, curRow, overviewMaxCols);
      overviewWs.getCell(curRow, 1).value = "VISUAL ANALYTICAL CHARTS";
      overviewWs.getCell(curRow, 1).font = { bold: true, size: 10.5, color: { argb: "FF0F421D" } };
      overviewWs.getRow(curRow).height = 22;
      curRow++;

      options.charts.forEach((chart, idx) => {
        const chartRow = curRow;
        safeMerge(overviewWs, chartRow, 1, chartRow, overviewMaxCols);
        const titleCell = overviewWs.getCell(chartRow, 1);
        titleCell.value = chart.title || `Visual Chart ${idx + 1}`;
        titleCell.font = { bold: true, size: 9.5, color: { argb: "FF15803D" } };
        overviewWs.getRow(chartRow).height = 20;

        const cleanImg = cleanBase64(chart.imageDataUrl);
        if (cleanImg) {
          try {
            const imgId = workbook.addImage({ base64: cleanImg, extension: "png" });
            overviewWs.addImage(imgId, {
              tl: { col: 0.1, row: chartRow },
              ext: { width: 440, height: 210 }
            });
          } catch {
            /* ignore chart render error */
          }
        }

        curRow += 12;

        if (chart.caption) {
          safeMerge(overviewWs, curRow, 1, curRow, overviewMaxCols);
          const capCell = overviewWs.getCell(curRow, 1);
          capCell.value = chart.caption;
          capCell.font = { italic: true, size: 8.5, color: { argb: "FF64748B" } };
          overviewWs.getRow(curRow).height = 18;
          curRow++;
        }

        if (chart.description || (chart.recommendations && chart.recommendations.length > 0)) {
          safeMerge(overviewWs, curRow, 1, curRow, overviewMaxCols);
          const calloutCell = overviewWs.getCell(curRow, 1);

          let calloutText = "";
          if (chart.description) calloutText += `CHART INSIGHT & ANALYSIS:\n${chart.description}`;
          if (chart.recommendations && chart.recommendations.length > 0) {
            if (calloutText) calloutText += "\n\n";
            calloutText += `STRATEGIC RECOMMENDATIONS:\n${chart.recommendations.map((r) => `• ${r}`).join("\n")}`;
          }

          calloutCell.value = calloutText;
          calloutCell.font = { size: 8.5, color: { argb: "FF1E293B" } };
          calloutCell.fill = { type: "pattern", pattern: "solid", fgColor: { argb: "FFF0FDF4" } };
          calloutCell.alignment = { horizontal: "left", vertical: "top", wrapText: true };
          calloutCell.border = {
            top: { style: "thin", color: { argb: "FFBBF7D0" } },
            left: { style: "thin", color: { argb: "FFBBF7D0" } },
            bottom: { style: "thin", color: { argb: "FFBBF7D0" } },
            right: { style: "thin", color: { argb: "FFBBF7D0" } }
          };

          const lineCount = calloutText.split("\n").length;
          overviewWs.getRow(curRow).height = Math.max(36, Math.min(lineCount * 15 + 10, 120));
          curRow++;
        }

        curRow++;
      });
    }

    // Index Table of Sections
    curRow++;
    safeMerge(overviewWs, curRow, 1, curRow, overviewMaxCols);
    overviewWs.getCell(curRow, 1).value = "REPORT WORKSHEETS INDEX";
    overviewWs.getCell(curRow, 1).font = { bold: true, size: 10.5, color: { argb: "FF0F421D" } };
    overviewWs.getRow(curRow).height = 22;
    curRow++;

    const indexHeaders = ["Tab #", "Worksheet Name", "Section Category", "Included Records", "Status"];
    indexHeaders.forEach((hText, idx) => {
      const cell = overviewWs.getCell(curRow, idx + 1);
      cell.value = hText;
      cell.font = { bold: true, color: { argb: "FFFFFFFF" }, size: 9 };
      cell.fill = { type: "pattern", pattern: "solid", fgColor: { argb: "FF0F421D" } };
      cell.alignment = { horizontal: "center", vertical: "middle" };
    });
    overviewWs.getRow(curRow).height = 24;
    curRow++;

    sections.forEach((sec, sIdx) => {
      const rowIdx = curRow;
      const rowVals = [`Tab ${sIdx + 1}`, sec.name, "Analytics Data", `${sec.rows.length} record(s)`, "Ready"];
      rowVals.forEach((val, colIdx) => {
        const cell = overviewWs.getCell(rowIdx, colIdx + 1);
        cell.value = val;
        cell.font = { size: 9, color: { argb: "FF1E293B" } };
        cell.alignment = { horizontal: colIdx === 0 || colIdx === 3 ? "center" : "left", vertical: "middle" };
        cell.border = {
          top: { style: "thin", color: { argb: "FFE2E8F0" } },
          left: { style: "thin", color: { argb: "FFE2E8F0" } },
          bottom: { style: "thin", color: { argb: "FFE2E8F0" } },
          right: { style: "thin", color: { argb: "FFE2E8F0" } }
        };
      });
      overviewWs.getRow(rowIdx).height = 20;
      curRow++;
    });

    for (let c = 1; c <= overviewMaxCols; c++) {
      overviewWs.getColumn(c).width = 24;
    }
    overviewWs.pageSetup = { orientation: "portrait", fitToWidth: 1, fitToHeight: 0, paperSize: 9 };
    overviewWs.headerFooter.oddFooter = `&L${branding.systemName} · Generated ${reportDateLabel()}&RPage &P of &N`;
  }

  // Render individual data tabs (or single tab if only 1 section)
  sections.forEach((section, sIdx) => {
    const wsName = isMultiTab ? safeSheetName(section.name, sIdx + 1, sheetNames) : safeSheetName(cleanTitle(options.title), 0, sheetNames);
    const worksheet = workbook.addWorksheet(wsName);

    const headers = headersFor(section);
    const values = valuesFor(section, headers);
    const maxWidthCols = Math.max(headers.length, 5);

    worksheet.views = [{ state: "frozen", ySplit: 6, showGridLines: true }];

    renderHeaderBanner(worksheet, maxWidthCols, options.subtitle ?? `Section ${sIdx + 1}: ${section.name}`, `${cleanTitle(options.title)} — ${section.name}`);

    safeMerge(worksheet, 6, 1, 6, maxWidthCols);
    worksheet.getCell(6, 1).value = `Section Records: ${section.rows.length}  ·  Generated: ${new Date().toLocaleDateString()}`;
    worksheet.getCell(6, 1).font = { size: 9, color: { argb: "FF526155" } };
    worksheet.getRow(6).height = 18;

    let curRow = 8;

    // Matching chart for this section
    const matchingChart = options.charts?.find((c) => {
      const titleLower = (c.title ?? "").toLowerCase();
      const secLower = section.name.toLowerCase();
      if (secLower.includes("attendance") && titleLower.includes("attendance")) return true;
      if (secLower.includes("prediction") && (titleLower.includes("predict") || titleLower.includes("turnout"))) return true;
      if (secLower.includes("sentiment") && (titleLower.includes("sentiment") || titleLower.includes("feedback"))) return true;
      if (secLower.includes("late") && (titleLower.includes("late") || titleLower.includes("tardiness") || titleLower.includes("cause"))) return true;
      return false;
    });

    if (matchingChart) {
      const chartRow = curRow;
      safeMerge(worksheet, chartRow, 1, chartRow, maxWidthCols);
      const titleCell = worksheet.getCell(chartRow, 1);
      titleCell.value = matchingChart.title || `Visual Chart`;
      titleCell.font = { bold: true, size: 9.5, color: { argb: "FF15803D" } };
      worksheet.getRow(chartRow).height = 20;

      const cleanImg = cleanBase64(matchingChart.imageDataUrl);
      if (cleanImg) {
        try {
          const imgId = workbook.addImage({ base64: cleanImg, extension: "png" });
          worksheet.addImage(imgId, {
            tl: { col: 0.1, row: chartRow },
            ext: { width: 440, height: 210 }
          });
        } catch {
          /* ignore chart render error */
        }
      }

      curRow += 12;

      if (matchingChart.caption) {
        safeMerge(worksheet, curRow, 1, curRow, maxWidthCols);
        const capCell = worksheet.getCell(curRow, 1);
        capCell.value = matchingChart.caption;
        capCell.font = { italic: true, size: 8.5, color: { argb: "FF64748B" } };
        worksheet.getRow(curRow).height = 18;
        curRow++;
      }

      if (matchingChart.description || (matchingChart.recommendations && matchingChart.recommendations.length > 0)) {
        safeMerge(worksheet, curRow, 1, curRow, maxWidthCols);
        const calloutCell = worksheet.getCell(curRow, 1);

        let calloutText = "";
        if (matchingChart.description) calloutText += `CHART INSIGHT & ANALYSIS:\n${matchingChart.description}`;
        if (matchingChart.recommendations && matchingChart.recommendations.length > 0) {
          if (calloutText) calloutText += "\n\n";
          calloutText += `STRATEGIC RECOMMENDATIONS:\n${matchingChart.recommendations.map((r) => `• ${r}`).join("\n")}`;
        }

        calloutCell.value = calloutText;
        calloutCell.font = { size: 8.5, color: { argb: "FF1E293B" } };
        calloutCell.fill = { type: "pattern", pattern: "solid", fgColor: { argb: "FFF0FDF4" } };
        calloutCell.alignment = { horizontal: "left", vertical: "top", wrapText: true };
        calloutCell.border = {
          top: { style: "thin", color: { argb: "FFBBF7D0" } },
          left: { style: "thin", color: { argb: "FFBBF7D0" } },
          bottom: { style: "thin", color: { argb: "FFBBF7D0" } },
          right: { style: "thin", color: { argb: "FFBBF7D0" } }
        };

        const lineCount = calloutText.split("\n").length;
        worksheet.getRow(curRow).height = Math.max(36, Math.min(lineCount * 15 + 10, 120));
        curRow++;
      }

      curRow++;
    }

    // Single tab only: include summary cards / insights if not rendered on an overview tab
    if (!isMultiTab && options.summaryCards && options.summaryCards.length > 0) {
      safeMerge(worksheet, curRow, 1, curRow, maxWidthCols);
      worksheet.getCell(curRow, 1).value = "KEY PERFORMANCE SUMMARY";
      worksheet.getCell(curRow, 1).font = { bold: true, size: 10, color: { argb: "FF0F421D" } };
      worksheet.getRow(curRow).height = 20;
      curRow++;

      options.summaryCards.forEach((card, idx) => {
        const colIdx = idx + 1;
        if (colIdx <= maxWidthCols) {
          const hCell = worksheet.getCell(curRow, colIdx);
          hCell.value = card.label.toUpperCase();
          hCell.font = { bold: true, size: 8.5, color: { argb: "FFFFFFFF" } };
          hCell.fill = { type: "pattern", pattern: "solid", fgColor: { argb: "FF0F421D" } };
          hCell.alignment = { horizontal: "center", vertical: "middle" };
        }
      });
      worksheet.getRow(curRow).height = 22;
      curRow++;

      options.summaryCards.forEach((card, idx) => {
        const colIdx = idx + 1;
        if (colIdx <= maxWidthCols) {
          const vCell = worksheet.getCell(curRow, colIdx);
          vCell.value = `${card.value}${card.subtitle ? `\n${card.subtitle}` : ""}`;
          vCell.font = { bold: true, size: 11, color: { argb: "FF0F172A" } };
          vCell.fill = { type: "pattern", pattern: "solid", fgColor: { argb: "FFF0FDF4" } };
          vCell.alignment = { horizontal: "center", vertical: "middle", wrapText: true };
          vCell.border = {
            top: { style: "thin", color: { argb: "FFBBF7D0" } },
            left: { style: "thin", color: { argb: "FFBBF7D0" } },
            bottom: { style: "thin", color: { argb: "FFBBF7D0" } },
            right: { style: "thin", color: { argb: "FFBBF7D0" } }
          };
        }
      });
      worksheet.getRow(curRow).height = 36;
      curRow += 2;
    }

    const tableHeaderRowIdx = curRow;

    // Table Headers
    headers.forEach((headerText, colIdx) => {
      const cell = worksheet.getCell(tableHeaderRowIdx, colIdx + 1);
      cell.value = headerText;
      cell.font = { bold: true, color: { argb: "FFFFFFFF" }, size: 9 };
      cell.fill = { type: "pattern", pattern: "solid", fgColor: { argb: "FF0F421D" } };
      cell.alignment = { horizontal: "center", vertical: "middle", wrapText: true };
      cell.border = {
        top: { style: "thin", color: { argb: "FF0F421D" } },
        left: { style: "thin", color: { argb: "FF0F421D" } },
        bottom: { style: "medium", color: { argb: "FF0F421D" } },
        right: { style: "thin", color: { argb: "FF0F421D" } }
      };
    });
    worksheet.getRow(tableHeaderRowIdx).height = 25;
    curRow++;

    // Data Rows
    values.forEach((rowValues, rIdx) => {
      const dataRowIdx = curRow;
      rowValues.forEach((val, colIdx) => {
        const cell = worksheet.getCell(dataRowIdx, colIdx + 1);
        cell.value = val;
        cell.font = { size: 9, color: { argb: "FF1E293B" } };

        const isNumeric = !isNaN(Number(val)) && val.trim() !== "";
        cell.alignment = { horizontal: isNumeric ? "right" : "left", vertical: "middle" };

        cell.border = {
          top: { style: "thin", color: { argb: "FFE2E8F0" } },
          left: { style: "thin", color: { argb: "FFE2E8F0" } },
          bottom: { style: "thin", color: { argb: "FFE2E8F0" } },
          right: { style: "thin", color: { argb: "FFE2E8F0" } }
        };
        if (rIdx % 2 === 1) {
          cell.fill = { type: "pattern", pattern: "solid", fgColor: { argb: "FFF8FAF8" } };
        }
      });
      worksheet.getRow(dataRowIdx).height = 20;
      curRow++;
    });

    if (headers.length > 0 && values.length > 0) {
      worksheet.autoFilter = {
        from: { row: tableHeaderRowIdx, column: 1 },
        to: { row: tableHeaderRowIdx + values.length, column: headers.length }
      };
    }

    // Auto-fit Column Widths
    for (let colIdx = 1; colIdx <= maxWidthCols; colIdx++) {
      let maxLen = 12;
      if (headers[colIdx - 1]) maxLen = Math.max(maxLen, headers[colIdx - 1].length);
      values.forEach((r) => {
        if (r[colIdx - 1]) maxLen = Math.max(maxLen, String(r[colIdx - 1]).length);
      });
      worksheet.getColumn(colIdx).width = Math.min(Math.max(maxLen + 4, 15), 45);
    }

    worksheet.pageSetup = { orientation: "portrait", fitToWidth: 1, fitToHeight: 0, paperSize: 9, horizontalDpi: 300, verticalDpi: 300 };
    worksheet.headerFooter.oddFooter = `&L${branding.systemName} · Generated ${reportDateLabel()}&RPage &P of &N`;
  });

  const buffer = await workbook.xlsx.writeBuffer();
  const blob = new Blob([new Uint8Array(buffer)], { type: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet" });

  const clickAnchor = (url: string) => {
    const anchor = document.createElement("a");
    anchor.href = url;
    anchor.download = `${safeReportFileName(options.fileName)}.xlsx`;
    document.body.appendChild(anchor);
    anchor.click();
    document.body.removeChild(anchor);
  };

  if (typeof URL !== "undefined" && typeof URL.createObjectURL === "function") {
    const url = URL.createObjectURL(blob);
    clickAnchor(url);
    window.setTimeout(() => {
      if (typeof URL !== "undefined" && typeof URL.revokeObjectURL === "function") {
        URL.revokeObjectURL(url);
      }
    }, 1500);
    return;
  }

  const reader = new FileReader();
  reader.onload = () => {
    clickAnchor(String(reader.result ?? ""));
  };
  reader.readAsDataURL(blob);
}
