import jsPDF from "jspdf";
import autoTable from "jspdf-autotable";
import type { Worksheet } from "exceljs";
import { repositories } from "@/services/repositories";
import type { RepositoryContext } from "@/services/repositoryUtils";
import { DEFAULT_INSTITUTION_NAME } from "@/lib/constants/branding";

export type ReportExportScope = { type: "event"; eventId: string } | { type: "organizer"; organizerId: string } | { type: "department"; departmentId: string } | { type: "global" };
export type ReportExportRow = Record<string, string | number | boolean | null | undefined>;
export type ReportExportColumn = { key: string; header: string; width?: number };
export type ReportExportSection = { name: string; rows: ReportExportRow[]; columns?: ReportExportColumn[]; header?: string; eventTitle?: string; pageBreakBefore?: boolean; xlsxSheet?: string; scoreCards?: ReportScoreCard[]; recommendations?: string[] };
export type ReportFilterSummary = Record<string, string | number | boolean | null | undefined>;
export type ReportFilterState = ReportFilterSummary & { search?: string; eventId?: string; schoolYear?: string; dateFrom?: string; dateTo?: string };

export type ReportSummaryCard = {
  label: string;
  value: string;
  subtitle?: string;
  colorTheme?: "emerald" | "blue" | "amber" | "purple" | "rose";
};

export type ReportScoreCard = {
  group?: string;
  label: string;
  value: number;
  maxValue: number;
  responseCount: number;
};

export function scoreCardColor(value: number, maxValue: number) {
  const percentage = (value / Math.max(maxValue, 1)) * 100;
  if (percentage >= 80) return { accent: [22, 128, 61] as const, text: [21, 128, 61] as const };
  if (percentage >= 60) return { accent: [217, 119, 6] as const, text: [180, 83, 9] as const };
  return { accent: [220, 38, 38] as const, text: [185, 28, 28] as const };
}

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
  scoreCards?: ReportScoreCard[];
  insightsNarrative?: ReportInsightsNarrative;
  charts?: ReportChartItem[];
  /** Render each section title above its table, including when there is only one section. */
  showSectionHeaders?: boolean;
};

export type ExportBranding = {
  plpLogoUrl: string;
  collegeName?: string;
  collegeLogoUrl?: string;
  primaryColor?: string;
  secondaryColor?: string;
  systemName: string;
};

const defaultBranding: ExportBranding = { plpLogoUrl: "/plp-institution-logo.png", systemName: "PLPass" };
const recommendationLabel = "RECOMMENDATION";

function figureCaption(chart: ReportChartItem, index: number) {
  const caption = chart.caption?.replace(/^Figure\s+\d+\s*:\s*/i, "").trim();
  return `Figure ${index + 1}: ${caption || chart.title || "Chart"}`;
}

function chartMatchesSection(chart: ReportChartItem, section: ReportExportSection) {
  const chartTitle = (chart.title ?? "").toLowerCase();
  const sectionName = section.name.toLowerCase();
  if (sectionName === "attendance overview" || sectionName === "attendance summary") return chartTitle.includes("attendance rate trend");
  if (sectionName === "turnout estimate" || sectionName.includes("saved turnout estimate")) return chartTitle.includes("saved turnout estimate");
  if (sectionName === "feedback labels") return chartTitle.includes("feedback labels");
  if (sectionName === "late arrival breakdown") return chartTitle.includes("late arrival breakdown");
  return false;
}

function hexRgb(value: string | undefined, fallback: [number, number, number]): [number, number, number] {
  const normalized = value?.trim().replace(/^#/, "");
  if (!normalized || !/^[0-9a-f]{6}$/i.test(normalized)) return fallback;
  return [Number.parseInt(normalized.slice(0, 2), 16), Number.parseInt(normalized.slice(2, 4), 16), Number.parseInt(normalized.slice(4, 6), 16)];
}

function argb(value: string | undefined, fallback: string) {
  const normalized = value?.trim().replace(/^#/, "");
  return normalized && /^[0-9a-f]{6}$/i.test(normalized) ? `FF${normalized.toUpperCase()}` : fallback;
}

export async function resolveBranding(scope?: ReportExportScope) {
  let session = await repositories.authentication.getSession();
  if (typeof window !== "undefined" && import.meta.env.MODE === "test") {
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
  // A global report still has an owner-specific presentation for organizers.
  // Only university-admin and student global exports use the institution
  // default; otherwise department branding would silently disappear from
  // organizer-wide exports.
  if ((scope?.type === "global" && (session.role === "admin" || session.role === "student")) || (!scope && (session.role === "admin" || session.role === "student"))) {
    return { branding: defaultBranding, context, schoolYear };
  }
  if (scope?.type === "department") {
    return { branding: await departmentExportBranding(scope.departmentId, context), context, schoolYear };
  }
  if (session.role === "department_admin" && (!scope || scope.type === "global")) {
    const admins = await repositories.userManagement.listAdminProfiles({ pageIndex: 0, pageSize: 100 }, context);
    const ownProfile = admins.items.find((profile) => profile.userId === session.userId);
    if (ownProfile) return { branding: await departmentExportBranding(ownProfile.departmentId, { ...context, departmentId: ownProfile.departmentId }), context, schoolYear };
  }
  let organizerId: string | undefined = scope?.type === "organizer" ? scope.organizerId : undefined;
  if (scope?.type === "event") {
    // The event already carries its owning organizer. Avoid a paginated profile
    // lookup here: it can omit the owner and silently fall back to default
    // institution branding in otherwise valid event exports.
    const event = await repositories.eventManagement.getEventById(scope.eventId, context);
    organizerId = event.organizerId;
  }
  if (!organizerId && session.role !== "department_admin") {
    const organizers = await repositories.userManagement.listOrganizerProfiles({ pageIndex: 0, pageSize: 100 }, context);
    organizerId = session.role === "organizer"
      ? organizers.items.find((item) => item.userId === session.userId)?.id
      : organizers.items[0]?.id;
  }
  if (!organizerId) return { branding: defaultBranding, context, schoolYear };
  const branding = await repositories.userManagement.getOrganizerBranding(organizerId, context);
  return {
    branding: {
      ...defaultBranding,
      collegeName: branding.collegeName,
      collegeLogoUrl: branding.collegeLogoUrl,
      primaryColor: branding.primaryColor,
      secondaryColor: branding.secondaryColor
    },
    context,
    schoolYear
  };
}

async function departmentExportBranding(departmentId: string, context: RepositoryContext): Promise<ExportBranding> {
  const branding = await repositories.userManagement.getDepartmentBranding(departmentId, context);
  return {
    ...defaultBranding,
    collegeName: branding.displayName,
    collegeLogoUrl: branding.logoUrl,
    primaryColor: branding.primaryColor,
    secondaryColor: branding.secondaryColor
  };
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
      // Render from the source resolution and trim transparent margins so the
      // institution and department logos have the same visual footprint.
      const source = document.createElement("canvas");
      source.width = image.naturalWidth || image.width;
      source.height = image.naturalHeight || image.height;
      const sourceContext = source.getContext("2d", { willReadFrequently: true });
      if (!sourceContext) return undefined;
      sourceContext.drawImage(image, 0, 0, source.width, source.height);
      const pixels = sourceContext.getImageData(0, 0, source.width, source.height).data;
      let left = source.width;
      let top = source.height;
      let right = -1;
      let bottom = -1;
      for (let y = 0; y < source.height; y++) {
        for (let x = 0; x < source.width; x++) {
          if (pixels[(y * source.width + x) * 4 + 3] > 8) {
            left = Math.min(left, x);
            top = Math.min(top, y);
            right = Math.max(right, x);
            bottom = Math.max(bottom, y);
          }
        }
      }
      if (right < left || bottom < top) return undefined;
      const padding = Math.max(2, Math.round(Math.max(right - left + 1, bottom - top + 1) * 0.04));
      left = Math.max(0, left - padding);
      top = Math.max(0, top - padding);
      right = Math.min(source.width - 1, right + padding);
      bottom = Math.min(source.height - 1, bottom + padding);

      const canvas = document.createElement("canvas");
      canvas.width = 512;
      canvas.height = 512;
      const context = canvas.getContext("2d");
      if (!context) return undefined;
      context.imageSmoothingEnabled = true;
      context.imageSmoothingQuality = "high";
      const cropWidth = right - left + 1;
      const cropHeight = bottom - top + 1;
      const scale = Math.min(480 / cropWidth, 480 / cropHeight);
      const drawWidth = cropWidth * scale;
      const drawHeight = cropHeight * scale;
      context.drawImage(source, left, top, cropWidth, cropHeight, (512 - drawWidth) / 2, (512 - drawHeight) / 2, drawWidth, drawHeight);
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
    `Report rows shown: ${count}`
  ];
}

function stripDepartmentSuffix(value: string) {
  return value.replace(/\s+department\s*$/i, "").trim();
}

export function institutionHeader(branding: ExportBranding, institution?: ReportExportOptions["institution"], actorRole?: RepositoryContext["actorRole"]) {
  // Saved department branding is authoritative for scoped exports. The
  // optional institution value is a report hint and must not overwrite a
  // department's configured presentation name.
  const college = stripDepartmentSuffix(branding.collegeName || institution?.collegeName || "");
  const lines = ["PAMANTASAN NG LUNGSOD NG PASIG"];
  if (actorRole !== "admin" && college && college.toLowerCase() !== DEFAULT_INSTITUTION_NAME.toLowerCase()) {
    lines.push(`COLLEGE OF ${college.replace(/^college of\s+/i, "")}`.toUpperCase());
  }
  lines.push(`SCHOOL YEAR ${institution?.schoolYear || "CURRENT SCHOOL YEAR"}`);
  return lines;
}

export function fitPdfChartSize(requestedWidth: number, requestedHeight: number, maxWidth: number, maxHeight: number) {
  const scale = Math.min(1, maxWidth / Math.max(requestedWidth, 1), maxHeight / Math.max(requestedHeight, 1));
  return { width: requestedWidth * scale, height: requestedHeight * scale };
}

function drawPdfFooter(doc: jsPDF, branding: ExportBranding, generatedAt: string) {
  const pageWidth = doc.internal.pageSize.getWidth();
  const pageHeight = doc.internal.pageSize.getHeight();
  for (let pageNumber = 1; pageNumber <= doc.getNumberOfPages(); pageNumber++) {
    doc.setPage(pageNumber);
    doc.setDrawColor(63, 116, 68);
    doc.line(14, pageHeight - 17, pageWidth - 14, pageHeight - 17);
    doc.setTextColor(107, 114, 128);
    doc.setFontSize(7);
    doc.setFont("helvetica", "normal");
    doc.text(`${branding.systemName} · Generated ${generatedAt}`, 14, pageHeight - 10);
    doc.text(`Page ${pageNumber} of ${doc.getNumberOfPages()}`, pageWidth - 14, pageHeight - 10, { align: "right" });
  }
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
  const { branding, schoolYear, context } = await resolveBranding(options.scope);
  const generatedAt = new Date();
  const generatedAtLabel = generatedAt.toLocaleString();
  const primary = hexRgb(branding.primaryColor, [21, 72, 34]);
  const primaryLine = hexRgb(branding.primaryColor, [21, 91, 42]);
  const secondary = hexRgb(branding.secondaryColor, [245, 249, 245]);
  const sections = sectionsFor(options);
  const total = sections.reduce((sum, section) => sum + section.rows.length, 0);
  if (!total && !options.summaryCards && !options.insightsNarrative) {
    throw new Error("There are no matching records to export.");
  }

  const maxColumns = Math.max(...sections.map((section) => headersFor(section).length), 1);
  // ponytail: reports use landscape consistently because attendee and outcome
  // tables otherwise clip readable column labels. Portrait would need a
  // separate responsive report design before it can safely return.
  const isLandscape = true;
  const doc = new jsPDF({ orientation: isLandscape ? "landscape" : "portrait", unit: "mm", format: "a4" });
  const pageWidth = doc.internal.pageSize.getWidth();
  const pageHeight = doc.internal.pageSize.getHeight();

  // Institution Header logos and text (Preserved exact header format)
  const [plpLogo, customLogo] = await Promise.all([imageToPngDataUrl(branding.plpLogoUrl), imageToPngDataUrl(branding.collegeLogoUrl)]);
  if (plpLogo) doc.addImage(plpLogo, "PNG", 14, 8, 22, 22);
  if (customLogo) doc.addImage(customLogo, "PNG", pageWidth - 36, 8, 22, 22);

  const header = institutionHeader(branding, { ...options.institution, schoolYear: options.institution?.schoolYear || schoolYear }, context.actorRole);
  doc.setTextColor(...primary);
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
  doc.setDrawColor(...primaryLine);
  doc.setLineWidth(0.4);
  doc.line(14, 34, pageWidth - 14, 34);

  doc.setFont("helvetica", "bold");
  doc.setFontSize(15);
  doc.setTextColor(...primary);
  doc.text(cleanTitle(options.title), 14, 43);

  doc.setDrawColor(...primaryLine);
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
    const cardHeight = 26;

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
        const subtitleLines = doc.splitTextToSize(card.subtitle, cardWidth - 9).slice(0, 2);
        doc.text(subtitleLines, cardX + 5, cursorY + 17);
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

    // Key Findings Header & Bullets
    if (narrative.keyFindings && narrative.keyFindings.length > 0) {
      doc.setFont("helvetica", "bold");
      doc.setFontSize(8.5);
      doc.setTextColor(21, 72, 34);
      doc.text("Key Findings:", 21, innerY);
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

    // Recommendation Header & Bullets
    if (narrative.recommendations && narrative.recommendations.length > 0) {
      doc.setFont("helvetica", "bold");
      doc.setFontSize(8.5);
      doc.setTextColor(15, 118, 110);
      doc.text(`${recommendationLabel}:`, 21, innerY);
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

  const renderScoreCards = (cards: ReportScoreCard[], heading?: string) => {
    if (cursorY + 18 > pageHeight - 20) {
      doc.addPage();
      cursorY = 20;
    }
    if (heading) {
      doc.setFont("helvetica", "bold");
      doc.setFontSize(11);
      doc.setTextColor(21, 72, 34);
      doc.text(heading, 14, cursorY);
      cursorY += 6;
    }

    let previousGroup: string | undefined;
    cards.forEach((card) => {
      const cardWidth = pageWidth - 28;
      const groupChanged = card.group && card.group !== previousGroup;
      const groupHeight = groupChanged ? 7 : 0;
      doc.setFont("helvetica", "bold");
      doc.setFontSize(8.5);
      // Keep the question safely clear of the score at the right edge.
      const titleLines = doc.splitTextToSize(card.label, cardWidth - 72);
      const barY = 6 + titleLines.length * 3.8;
      const detailY = barY + 8;
      const cardHeight = Math.max(21, detailY + 5);
      if (cursorY + groupHeight + cardHeight > pageHeight - 20) {
        doc.addPage();
        cursorY = 20;
      }
      if (groupChanged) {
        doc.setFont("helvetica", "bold");
        doc.setFontSize(8.5);
        doc.setTextColor(82, 97, 85);
        doc.text(`EVENT: ${card.group}`, 14, cursorY + 3.5);
        cursorY += groupHeight;
        previousGroup = card.group;
      }
      const percentage = Math.max(0, Math.min(100, (card.value / Math.max(card.maxValue, 1)) * 100));
      const tone = scoreCardColor(card.value, card.maxValue);
      doc.setFillColor(255, 255, 255);
      doc.setDrawColor(218, 229, 218);
      doc.roundedRect(14, cursorY, cardWidth, cardHeight, 3, 3, "FD");
      doc.setFillColor(tone.accent[0], tone.accent[1], tone.accent[2]);
      doc.roundedRect(14, cursorY, 2.5, cardHeight, 2, 2, "F");
      doc.setFont("helvetica", "bold");
      doc.setFontSize(8.5);
      doc.setTextColor(15, 23, 42);
      doc.text(titleLines, 20, cursorY + 6.5);
      doc.setFontSize(14);
      doc.setTextColor(tone.text[0], tone.text[1], tone.text[2]);
      doc.text(`${percentage.toFixed(1)}%`, pageWidth - 20, cursorY + 6.5, { align: "right" });
      const barX = 20;
      const barWidth = cardWidth - 12;
      doc.setFillColor(226, 232, 240);
      doc.roundedRect(barX, cursorY + barY, barWidth, 4, 2, 2, "F");
      doc.setFillColor(tone.accent[0], tone.accent[1], tone.accent[2]);
      doc.roundedRect(barX, cursorY + barY, barWidth * (percentage / 100), 4, 2, 2, "F");
      doc.setFont("helvetica", "normal");
      doc.setFontSize(8);
      doc.setTextColor(82, 97, 85);
      doc.text(`${card.value.toFixed(1)} out of ${card.maxValue} from ${card.responseCount} response${card.responseCount === 1 ? "" : "s"}`, 20, cursorY + detailY);
      cursorY += cardHeight + 3;
    });
    cursorY += 3;
  };

  const renderRecommendations = (recommendations: string[]) => {
    const lines = recommendations.flatMap((recommendation) => doc.splitTextToSize(`• ${recommendation}`, pageWidth - 48));
    const boxHeight = 12 + lines.length * 4;
    if (cursorY + boxHeight > pageHeight - 20) {
      doc.addPage();
      cursorY = 20;
    }
    doc.setFont("helvetica", "bold");
    doc.setFontSize(9);
    doc.setTextColor(21, 72, 34);
    doc.text(recommendationLabel, 14, cursorY);
    cursorY += 5;
    doc.setFillColor(243, 248, 244);
    doc.setDrawColor(180, 215, 185);
    doc.roundedRect(14, cursorY, pageWidth - 28, boxHeight, 2.5, 2.5, "FD");
    doc.setFillColor(21, 91, 42);
    doc.rect(14, cursorY, 3, boxHeight, "F");
    doc.setFont("helvetica", "normal");
    doc.setFontSize(8);
    doc.setTextColor(30, 41, 59);
    doc.text(lines, 21, cursorY + 6);
    cursorY += boxHeight + 6;
  };

  if (options.scoreCards && options.scoreCards.length > 0) renderScoreCards(options.scoreCards, "POST-EVENT OBJECTIVE RESULTS");

  const renderChart = (chart: ReportChartItem, chartIndex: number) => {
      const requestedChartHeight = chart.height ?? (isLandscape ? 65 : 75);
      const requestedChartWidth = chart.width ?? (isLandscape ? 150 : 170);
      // Chart generators provide pixel dimensions, while jsPDF positions in
      // millimetres. Keep the requested aspect ratio inside the printable area
      // so wide charts cannot push callouts or tables off the page.
      const chartSize = fitPdfChartSize(requestedChartWidth, requestedChartHeight, pageWidth - 28, isLandscape ? 95 : 105);
      const chartMmWidth = chartSize.width;
      const chartMmHeight = chartSize.height;

      if (cursorY + chartMmHeight + 10 > pageHeight - 20) {
        doc.addPage();
        cursorY = 20;
      }

      // The section heading identifies both the chart and its related table.
      // The chart image keeps its own short internal label.

      const chartX = 14 + (pageWidth - 28 - chartMmWidth) / 2;
      doc.addImage(chart.imageDataUrl, "PNG", chartX, cursorY, chartMmWidth, chartMmHeight);
      cursorY += chartMmHeight + 5;

      {
        doc.setFont("helvetica", "italic");
        doc.setFontSize(7.5);
        doc.setTextColor(100, 116, 139);
        const captionLines = doc.splitTextToSize(figureCaption(chart, chartIndex), pageWidth - 28);
        doc.text(captionLines, pageWidth / 2, cursorY, { align: "center" });
        cursorY += captionLines.length * 3.8 + 5;
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
          doc.text(`${recommendationLabel}:`, 20, boxY);
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
  };

  // Keep each chart with the table it explains. A caller without a named
  // analytics section still keeps its charts before the first table.
  const renderedChartIndexes = new Set<number>();
  sections.forEach((section, sectionIndex) => {
    const matchingChartIndex = options.charts?.findIndex((chart, chartIndex) => !renderedChartIndexes.has(chartIndex) && chartMatchesSection(chart, section)) ?? -1;
    const chartIndexes = matchingChartIndex >= 0
      ? [matchingChartIndex]
      : sectionIndex === 0
        ? (options.charts ?? []).map((_, chartIndex) => chartIndex).filter((chartIndex) => !renderedChartIndexes.has(chartIndex))
        : [];
    if (section.pageBreakBefore) {
      doc.addPage();
      cursorY = 20;
    }
    // A heading without its chart is harder to scan than starting the next
    // section on a fresh page. This reserve also covers the caption/callout.
    const minimumSectionHeight = (section.scoreCards?.length ? 50 : 30) + chartIndexes.length * 105;
    if (cursorY + minimumSectionHeight > pageHeight - 20) {
      doc.addPage();
      cursorY = 20;
    }

    if (section.eventTitle) {
      doc.setFont("helvetica", "bold");
      doc.setFontSize(12);
      doc.setTextColor(21, 72, 34);
      doc.text(section.eventTitle, 14, cursorY);
      cursorY += 7;
    }

    if (options.showSectionHeaders || sections.length > 1 || options.charts?.length || options.insightsNarrative) {
      doc.setFont("helvetica", "bold");
      doc.setFontSize(10);
      doc.setTextColor(21, 72, 34);
      const sectionHeaderLines = (section.eventTitle ? section.name : section.header ?? section.name).split("\n");
      doc.text(sectionHeaderLines, 14, cursorY);
      cursorY += sectionHeaderLines.length * 5;
    }

    chartIndexes.forEach((chartIndex) => {
      const chart = options.charts?.[chartIndex];
      if (!chart) return;
      renderChart(chart, chartIndex);
      renderedChartIndexes.add(chartIndex);
    });

    if (section.scoreCards?.length) renderScoreCards(section.scoreCards);

    const headers = headersFor(section);
    const tableBody = valuesFor(section, headers);
    // Keep compact breakdown tables, such as late-arrival reasons, on one
    // page. Detailed attendance logs still paginate normally.
    const keepTableTogether = tableBody.length <= 8;
    autoTable(doc, {
      startY: cursorY,
      head: [headers],
      body: tableBody,
      pageBreak: keepTableTogether ? "avoid" : "auto",
      rowPageBreak: "avoid",
      theme: "striped",
      headStyles: { fillColor: primary, textColor: [255, 255, 255], fontStyle: "bold", fontSize: 8, font: "helvetica" },
      alternateRowStyles: { fillColor: secondary },
      styles: { font: "helvetica", fontSize: maxColumns > 7 ? 7 : 8, cellPadding: 2, lineColor: primaryLine, lineWidth: 0.1 },
    });
    cursorY = ((doc as jsPDF & { lastAutoTable?: { finalY: number } }).lastAutoTable?.finalY ?? cursorY) + 10;
    if (section.recommendations?.length) renderRecommendations(section.recommendations);
  });

  drawPdfFooter(doc, branding, generatedAtLabel);
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
  const { branding, schoolYear, context } = await resolveBranding(options.scope);
  const generatedAt = new Date();
  const generatedAtLabel = generatedAt.toLocaleString();
  const primaryArgb = argb(branding.primaryColor, "FF0F421D");
  const secondaryArgb = argb(branding.secondaryColor, "FFE8F1E6");
  const sections = sectionsFor(options);
  const worksheetGroups = sections.reduce<Array<{ name: string; sections: ReportExportSection[] }>>((groups, section) => {
    const name = section.xlsxSheet ?? section.name;
    const existing = groups.find((group) => group.name === name);
    if (existing) existing.sections.push(section);
    else groups.push({ name, sections: [section] });
    return groups;
  }, []);
  const total = sections.reduce((sum, section) => sum + section.rows.length, 0);
  if (!total && !options.summaryCards && !options.insightsNarrative) {
    throw new Error("There are no matching records to export.");
  }

  const [plpLogo, customLogo] = await Promise.all([imageToPngDataUrl(branding.plpLogoUrl), imageToPngDataUrl(branding.collegeLogoUrl)]);
  const { Workbook } = await import("exceljs");
  const workbook = new Workbook();
  const sheetNames = new Set<string>();

  const header = institutionHeader(branding, { ...options.institution, schoolYear: options.institution?.schoolYear || schoolYear }, context.actorRole);
  const filterEntries = Object.entries(options.filters ?? {})
    .filter(([, value]) => value !== undefined && value !== null && String(value).trim() !== "")
    .map(([key, value]) => `${displayHeader(key)}: ${String(value)}`);

  function renderHeaderBanner(ws: Worksheet, maxCols: number, sub: string, mainTitle: string) {
    for (let row = 1; row <= 5; row++) safeMerge(ws, row, 1, row, maxCols);
    header.forEach((line, rowIndex) => {
      const cell = ws.getCell(rowIndex + 1, 1);
      cell.value = line;
      cell.alignment = { horizontal: "center", vertical: "middle" };
      cell.font = { bold: true, size: rowIndex === 0 ? 14 : 10, color: { argb: primaryArgb } };
    });
    ws.getRow(1).height = 24;
    ws.getRow(2).height = 19;
    ws.getRow(3).height = 17;
    ws.getRow(4).height = 17;
    ws.getCell(4, 1).value = sub;
    ws.getCell(4, 1).font = { italic: true, size: 9, color: { argb: "FF526155" } };

    ws.getCell(5, 1).value = mainTitle.toUpperCase();
    ws.getCell(5, 1).font = { bold: true, size: 13, color: { argb: primaryArgb } };
    ws.getCell(5, 1).alignment = { horizontal: "left", vertical: "middle", wrapText: mainTitle.includes("\n") };
    ws.getRow(5).height = mainTitle.includes("\n") ? 52 : 24;

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

  function renderInsightsNarrative(ws: Worksheet, startRow: number, maxCols: number) {
    if (!options.insightsNarrative) return startRow;
    let curRow = startRow + 1;
    const narrative = options.insightsNarrative;
    safeMerge(ws, curRow, 1, curRow, maxCols);
    ws.getCell(curRow, 1).value = narrative.title ?? "EXECUTIVE ANALYTICAL INSIGHTS";
    ws.getCell(curRow, 1).font = { bold: true, size: 10.5, color: { argb: primaryArgb } };
    ws.getRow(curRow).height = 22;
    curRow++;

    const insightHeaders = ["Analysis Topic", "Executive Overview", "Key Findings", recommendationLabel];
    insightHeaders.slice(0, maxCols).forEach((headerText, index) => {
      const cell = ws.getCell(curRow, index + 1);
      cell.value = headerText;
      cell.font = { bold: true, size: 9, color: { argb: "FFFFFFFF" } };
      cell.fill = { type: "pattern", pattern: "solid", fgColor: { argb: primaryArgb } };
      cell.alignment = { horizontal: "center", vertical: "middle" };
    });
    ws.getRow(curRow).height = 24;
    curRow++;

    const summaryData = [
      options.title,
      narrative.executiveSummary,
      (narrative.keyFindings ?? []).map((finding) => `• ${finding}`).join("\n"),
      (narrative.recommendations ?? []).map((recommendation) => `• ${recommendation}`).join("\n")
    ];
    summaryData.slice(0, maxCols).forEach((value, index) => {
      const cell = ws.getCell(curRow, index + 1);
      cell.value = value;
      cell.font = { size: 9, color: { argb: "FF1E293B" } };
      cell.fill = { type: "pattern", pattern: "solid", fgColor: { argb: "FFF8FAF8" } };
      cell.alignment = { horizontal: "left", vertical: "top", wrapText: true };
      cell.border = {
        top: { style: "thin", color: { argb: "FFE2E8F0" } }, left: { style: "thin", color: { argb: "FFE2E8F0" } },
        bottom: { style: "thin", color: { argb: "FFE2E8F0" } }, right: { style: "thin", color: { argb: "FFE2E8F0" } }
      };
    });
    ws.getRow(curRow).height = 84;
    return curRow + 2;
  }

  const isMultiTab = worksheetGroups.length > 1;

  if (isMultiTab) {
    // 1. Overview Tab
    const overviewWs = workbook.addWorksheet(safeSheetName("Overview", 0, sheetNames));
    overviewWs.views = [{ state: "frozen", ySplit: 6, showGridLines: true }];

    const overviewMaxCols = 5;
    renderHeaderBanner(overviewWs, overviewMaxCols, options.subtitle ?? "Executive Dashboard & Report Index", cleanTitle(options.title));

    const generatedLine = `Date Generated: ${generatedAtLabel}  ·  Total Data Tabs: ${worksheetGroups.length}  ·  Total Records: ${total}`;

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
      titleCell.font = { bold: true, size: 10, color: { argb: primaryArgb } };
      overviewWs.getRow(curRow).height = 20;
      curRow++;

      options.summaryCards.forEach((card, idx) => {
        const colIdx = idx + 1;
        if (colIdx <= overviewMaxCols) {
          const hCell = overviewWs.getCell(curRow, colIdx);
          hCell.value = card.label.toUpperCase();
          hCell.font = { bold: true, size: 8.5, color: { argb: "FFFFFFFF" } };
          hCell.fill = { type: "pattern", pattern: "solid", fgColor: { argb: primaryArgb } };
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
          vCell.fill = { type: "pattern", pattern: "solid", fgColor: { argb: secondaryArgb } };
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

    if (options.scoreCards && options.scoreCards.length > 0) {
      curRow++;
      safeMerge(overviewWs, curRow, 1, curRow, overviewMaxCols);
      overviewWs.getCell(curRow, 1).value = "POST-EVENT OBJECTIVE RESULTS";
      overviewWs.getCell(curRow, 1).font = { bold: true, size: 10, color: { argb: primaryArgb } };
      overviewWs.getRow(curRow).height = 20;
      curRow++;

      ["Event", "Objective", "Average rating", "Share of 9", "Responses"].forEach((headerText, index) => {
        const cell = overviewWs.getCell(curRow, index + 1);
        cell.value = headerText;
        cell.font = { bold: true, size: 9, color: { argb: "FFFFFFFF" } };
        cell.fill = { type: "pattern", pattern: "solid", fgColor: { argb: primaryArgb } };
        cell.alignment = { horizontal: "center", vertical: "middle" };
      });
      overviewWs.getRow(curRow).height = 22;
      curRow++;

      options.scoreCards.forEach((card) => {
        const values = [card.group ?? "Selected event", card.label, `${card.value.toFixed(1)} / ${card.maxValue}`, `${((card.value / Math.max(card.maxValue, 1)) * 100).toFixed(1)}%`, card.responseCount];
        values.forEach((value, index) => {
          const cell = overviewWs.getCell(curRow, index + 1);
          cell.value = value;
          cell.font = { size: 9, color: { argb: "FF1E293B" } };
          cell.fill = { type: "pattern", pattern: "solid", fgColor: { argb: "FFF8FAF8" } };
          cell.alignment = { horizontal: index >= 2 ? "center" : "left", vertical: "middle", wrapText: true };
          cell.border = {
            top: { style: "thin", color: { argb: "FFE2E8F0" } },
            left: { style: "thin", color: { argb: "FFE2E8F0" } },
            bottom: { style: "thin", color: { argb: "FFE2E8F0" } },
            right: { style: "thin", color: { argb: "FFE2E8F0" } }
          };
        });
        overviewWs.getRow(curRow).height = 30;
        curRow++;
      });
      curRow++;
    }

    curRow = renderInsightsNarrative(overviewWs, curRow, overviewMaxCols);

    // Render Charts on Overview Tab
    if (options.charts && options.charts.length > 0) {
      curRow++;
      safeMerge(overviewWs, curRow, 1, curRow, overviewMaxCols);
      overviewWs.getCell(curRow, 1).value = "VISUAL ANALYTICAL CHARTS";
      overviewWs.getCell(curRow, 1).font = { bold: true, size: 10.5, color: { argb: primaryArgb } };
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

        safeMerge(overviewWs, curRow, 1, curRow, overviewMaxCols);
        const capCell = overviewWs.getCell(curRow, 1);
        capCell.value = figureCaption(chart, idx);
        capCell.font = { italic: true, size: 8.5, color: { argb: "FF64748B" } };
        overviewWs.getRow(curRow).height = 18;
        curRow += 2;

        if (chart.description || (chart.recommendations && chart.recommendations.length > 0)) {
          safeMerge(overviewWs, curRow, 1, curRow, overviewMaxCols);
          const calloutCell = overviewWs.getCell(curRow, 1);

          let calloutText = "";
          if (chart.description) calloutText += `CHART INSIGHT & ANALYSIS:\n${chart.description}`;
          if (chart.recommendations && chart.recommendations.length > 0) {
            if (calloutText) calloutText += "\n\n";
            calloutText += `${recommendationLabel}:\n${chart.recommendations.map((r) => `• ${r}`).join("\n")}`;
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

    worksheetGroups.forEach((group, groupIdx) => {
      const rowIdx = curRow;
      const rowVals = [`Tab ${groupIdx + 1}`, group.name, group.sections.map((section) => section.name).join(", "), `${group.sections.reduce((sum, section) => sum + section.rows.length, 0)} record(s)`, "Ready"];
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
    overviewWs.pageSetup = { orientation: "landscape", fitToWidth: 1, fitToHeight: 0, paperSize: 9 };
    overviewWs.headerFooter.oddFooter = `&L${branding.systemName} · Generated ${generatedAtLabel}&RPage &P of &N`;
  }

  // Render one worksheet for each requested group. Ordinary reports still have
  // one section per worksheet; Event Summary groups its related sections by event.
  worksheetGroups.forEach((group, groupIdx) => {
    const firstSection = group.sections[0];
    const wsName = isMultiTab || firstSection.xlsxSheet
      ? safeSheetName(group.name, groupIdx + 1, sheetNames)
      : safeSheetName(cleanTitle(options.title), 0, sheetNames);
    const worksheet = workbook.addWorksheet(wsName);
    const maxWidthCols = Math.max(...group.sections.map((section) => headersFor(section).length), 5);
    const sectionHeader = firstSection.header ?? firstSection.eventTitle ?? group.name;

    worksheet.views = [{ state: "frozen", ySplit: 6, showGridLines: true }];
    renderHeaderBanner(worksheet, maxWidthCols, options.subtitle ?? `Event report: ${sectionHeader}`, `${cleanTitle(options.title)} — ${sectionHeader}`);

    safeMerge(worksheet, 6, 1, 6, maxWidthCols);
    worksheet.getCell(6, 1).value = `Records: ${group.sections.reduce((sum, section) => sum + section.rows.length, 0)}  ·  Generated: ${generatedAtLabel}`;
    worksheet.getCell(6, 1).font = { size: 9, color: { argb: "FF526155" } };
    worksheet.getRow(6).height = 18;

    let curRow = 8;
    const matchingChart = options.charts?.find((chart) => chartMatchesSection(chart, firstSection));
    if (matchingChart) {
      safeMerge(worksheet, curRow, 1, curRow, maxWidthCols);
      const titleCell = worksheet.getCell(curRow, 1);
      titleCell.value = matchingChart.title || "Visual Chart";
      titleCell.font = { bold: true, size: 9.5, color: { argb: "FF15803D" } };
      worksheet.getRow(curRow).height = 20;
      const cleanImage = cleanBase64(matchingChart.imageDataUrl);
      if (cleanImage) {
        try {
          const imageId = workbook.addImage({ base64: cleanImage, extension: "png" });
          worksheet.addImage(imageId, { tl: { col: 0.1, row: curRow }, ext: { width: 440, height: 210 } });
        } catch {
          /* ignore chart render errors */
        }
      }
      curRow += 12;
      safeMerge(worksheet, curRow, 1, curRow, maxWidthCols);
      worksheet.getCell(curRow, 1).value = figureCaption(matchingChart, options.charts?.indexOf(matchingChart) ?? 0);
      worksheet.getCell(curRow, 1).font = { italic: true, size: 8.5, color: { argb: "FF64748B" } };
      worksheet.getRow(curRow).height = 18;
      curRow += 2;
      if (matchingChart.description || matchingChart.recommendations?.length) {
        safeMerge(worksheet, curRow, 1, curRow, maxWidthCols);
        const insightCell = worksheet.getCell(curRow, 1);
        insightCell.value = [
          matchingChart.description ? `CHART INSIGHT & ANALYSIS:\n${matchingChart.description}` : "",
          matchingChart.recommendations?.length ? `${recommendationLabel}:\n${matchingChart.recommendations.map((recommendation) => `• ${recommendation}`).join("\n")}` : ""
        ].filter(Boolean).join("\n\n");
        insightCell.font = { size: 8.5, color: { argb: "FF1E293B" } };
        insightCell.fill = { type: "pattern", pattern: "solid", fgColor: { argb: "FFF0FDF4" } };
        insightCell.alignment = { horizontal: "left", vertical: "top", wrapText: true };
        worksheet.getRow(curRow).height = 54;
        curRow += 2;
      }
    }
    if (!isMultiTab && options.summaryCards && options.summaryCards.length > 0) {
      safeMerge(worksheet, curRow, 1, curRow, maxWidthCols);
      worksheet.getCell(curRow, 1).value = "KEY PERFORMANCE SUMMARY";
      worksheet.getCell(curRow, 1).font = { bold: true, size: 10, color: { argb: primaryArgb } };
      worksheet.getRow(curRow).height = 20;
      curRow++;
      options.summaryCards.forEach((card, idx) => {
        const colIdx = idx + 1;
        if (colIdx <= maxWidthCols) {
          const headerCell = worksheet.getCell(curRow, colIdx);
          headerCell.value = card.label.toUpperCase();
          headerCell.font = { bold: true, size: 8.5, color: { argb: "FFFFFFFF" } };
          headerCell.fill = { type: "pattern", pattern: "solid", fgColor: { argb: primaryArgb } };
          headerCell.alignment = { horizontal: "center", vertical: "middle" };
        }
      });
      worksheet.getRow(curRow).height = 22;
      curRow++;
      options.summaryCards.forEach((card, idx) => {
        const colIdx = idx + 1;
        if (colIdx <= maxWidthCols) {
          const valueCell = worksheet.getCell(curRow, colIdx);
          valueCell.value = `${card.value}${card.subtitle ? `\n${card.subtitle}` : ""}`;
          valueCell.font = { bold: true, size: 11, color: { argb: "FF0F172A" } };
          valueCell.fill = { type: "pattern", pattern: "solid", fgColor: { argb: secondaryArgb } };
          valueCell.alignment = { horizontal: "center", vertical: "middle", wrapText: true };
        }
      });
      worksheet.getRow(curRow).height = 36;
      curRow += 2;
    }
    curRow = renderInsightsNarrative(worksheet, curRow, maxWidthCols);

    group.sections.forEach((section, sectionIdx) => {
      const headers = headersFor(section);
      const values = valuesFor(section, headers);
      if (group.sections.length > 1) {
        safeMerge(worksheet, curRow, 1, curRow, maxWidthCols);
        const titleCell = worksheet.getCell(curRow, 1);
        titleCell.value = section.name.toUpperCase();
        titleCell.font = { bold: true, size: 10, color: { argb: primaryArgb } };
        titleCell.fill = { type: "pattern", pattern: "solid", fgColor: { argb: "FFF0F7F0" } };
        curRow += 2;
      }

      const tableHeaderRowIdx = curRow;
      headers.forEach((headerText, colIdx) => {
        const cell = worksheet.getCell(tableHeaderRowIdx, colIdx + 1);
        cell.value = headerText;
        cell.font = { bold: true, color: { argb: "FFFFFFFF" }, size: 9 };
        cell.fill = { type: "pattern", pattern: "solid", fgColor: { argb: primaryArgb } };
        cell.alignment = { horizontal: "center", vertical: "middle", wrapText: true };
        cell.border = {
          top: { style: "thin", color: { argb: "FF0F421D" } }, left: { style: "thin", color: { argb: "FF0F421D" } },
          bottom: { style: "medium", color: { argb: "FF0F421D" } }, right: { style: "thin", color: { argb: "FF0F421D" } }
        };
      });
      worksheet.getRow(tableHeaderRowIdx).height = 25;
      curRow++;

      values.forEach((rowValues, rowIndex) => {
        rowValues.forEach((value, colIdx) => {
          const cell = worksheet.getCell(curRow, colIdx + 1);
          cell.value = value;
          cell.font = { size: 9, color: { argb: "FF1E293B" } };
          cell.alignment = { horizontal: !isNaN(Number(value)) && value.trim() !== "" ? "right" : "left", vertical: "middle", wrapText: true };
          cell.border = {
            top: { style: "thin", color: { argb: "FFE2E8F0" } }, left: { style: "thin", color: { argb: "FFE2E8F0" } },
            bottom: { style: "thin", color: { argb: "FFE2E8F0" } }, right: { style: "thin", color: { argb: "FFE2E8F0" } }
          };
          if (rowIndex % 2 === 1) cell.fill = { type: "pattern", pattern: "solid", fgColor: { argb: "FFF8FAF8" } };
        });
        worksheet.getRow(curRow).height = 20;
        curRow++;
      });

      if (group.sections.length === 1 && headers.length > 0 && values.length > 0) {
        worksheet.autoFilter = { from: { row: tableHeaderRowIdx, column: 1 }, to: { row: tableHeaderRowIdx + values.length, column: headers.length } };
      }
      if (section.recommendations?.length) {
        safeMerge(worksheet, curRow, 1, curRow, maxWidthCols);
        const recommendationCell = worksheet.getCell(curRow, 1);
        recommendationCell.value = `${recommendationLabel}\n${section.recommendations.map((recommendation) => `• ${recommendation}`).join("\n")}`;
        recommendationCell.font = { size: 9, color: { argb: "FF1E293B" } };
        recommendationCell.fill = { type: "pattern", pattern: "solid", fgColor: { argb: "FFF0FDF4" } };
        recommendationCell.alignment = { horizontal: "left", vertical: "top", wrapText: true };
        worksheet.getRow(curRow).height = Math.max(36, 18 + section.recommendations.length * 15);
        curRow++;
      }
      if (sectionIdx < group.sections.length - 1) curRow += 2;
    });

    for (let colIdx = 1; colIdx <= maxWidthCols; colIdx++) {
      const maxLen = group.sections.reduce((longest, section) => {
        const headers = headersFor(section);
        const headerLength = headers[colIdx - 1]?.length ?? 0;
        const valueLength = valuesFor(section, headers).reduce((max, row) => Math.max(max, String(row[colIdx - 1] ?? "").length), 0);
        return Math.max(longest, headerLength, valueLength);
      }, 12);
      worksheet.getColumn(colIdx).width = Math.min(Math.max(maxLen + 4, 15), 45);
    }
    worksheet.pageSetup = { orientation: "landscape", fitToWidth: 1, fitToHeight: 0, paperSize: 9, horizontalDpi: 300, verticalDpi: 300 };
    worksheet.headerFooter.oddFooter = `&L${branding.systemName} · Generated ${generatedAtLabel}&RPage &P of &N`;
  });

  const buffer = await workbook.xlsx.writeBuffer();
  const blob = new Blob([new Uint8Array(buffer)], { type: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet" });
  const url = URL.createObjectURL(blob);
  const anchor = document.createElement("a");
  anchor.href = url;
  anchor.download = `${safeReportFileName(options.fileName)}.xlsx`;
  document.body.appendChild(anchor);
  anchor.click();
  document.body.removeChild(anchor);
  // Keep the object URL alive long enough for the browser to begin the
  // download. Revoking it synchronously can intermittently produce an empty
  // file in Chromium-based browsers.
  window.setTimeout(() => URL.revokeObjectURL(url), 1500);
}
