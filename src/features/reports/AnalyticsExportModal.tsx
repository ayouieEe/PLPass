import { useState } from "react";
import { createPortal } from "react-dom";
import {
  BarChart3,
  Calendar,
  CheckCircle2,
  Clock,
  Download,
  FileSpreadsheet,
  FileText,
  Filter,
  Layers,
  MessageSquareQuote,
  Sparkles,
  TrendingUp,
  X
} from "lucide-react";

export type ExportFormat = "XLSX" | "PDF" | "CSV";

export type ReportTypeOption = {
  id: string;
  title: string;
  description: string;
  icon: typeof BarChart3;
};

export const REPORT_TYPES: ReportTypeOption[] = [
  {
    id: "attendance-summary",
    title: "Attendance Summary Report",
    description: "Attendance rates, session summaries, present/late/absent distributions.",
    icon: TrendingUp
  },
  {
    id: "turnout-prediction",
    title: "Turnout Prediction Report",
    description: "Machine learning forecasts, expected attendees vs absentees, key determinants.",
    icon: Sparkles
  },
  {
    id: "performance-sentiment",
    title: "Performance & Sentiment Report",
    description: "Objective rating benchmarks, VADER sentiment scores, student comments.",
    icon: MessageSquareQuote
  },
  {
    id: "late-arrivals",
    title: "Late Arrival Patterns Report",
    description: "Frequency breakdown, top late arrival causes, monthly trend breakdown.",
    icon: Clock
  },
  {
    id: "full-package",
    title: "Full Analytics Package",
    description: "Complete dataset bundling all attendance, prediction, sentiment, and late arrival reports.",
    icon: Layers
  }
];

export type AnalyticsExportModalProps = {
  open: boolean;
  onClose: () => void;
  initialReportType?: string;
  initialEventFilter?: string;
  eventOptions: { code: string; title: string }[];
  onExport: (exportPayload: {
    reportTitle: string;
    format: ExportFormat;
    event: string;
    category: string;
    dateRange: string;
    semester: string;
    academicYear: string;
    includeRawLogs: boolean;
    includeComments: boolean;
    includeDeterminants: boolean;
  }) => void;
};

export function AnalyticsExportModal({
  open,
  onClose,
  initialReportType = "attendance-summary",
  initialEventFilter = "all",
  eventOptions,
  onExport
}: AnalyticsExportModalProps) {
  const [selectedReportId, setSelectedReportId] = useState(initialReportType);
  const [format, setFormat] = useState<ExportFormat>("XLSX");
  const [eventFilter, setEventFilter] = useState(initialEventFilter);
  const [categoryFilter, setCategoryFilter] = useState("all");
  const [dateRangeFilter, setDateRangeFilter] = useState("last-6-months");
  const [semesterFilter, setSemesterFilter] = useState("all");
  const [academicYearFilter, setAcademicYearFilter] = useState("2026");

  const [includeRawLogs, setIncludeRawLogs] = useState(true);
  const [includeComments, setIncludeComments] = useState(true);
  const [includeDeterminants, setIncludeDeterminants] = useState(true);

  if (!open) {
    return null;
  }

  const selectedReport = REPORT_TYPES.find((r) => r.id === selectedReportId) ?? REPORT_TYPES[0];

  function handleFormSubmit(e: React.FormEvent) {
    e.preventDefault();
    onExport({
      reportTitle: selectedReport.title,
      format,
      event: eventFilter,
      category: categoryFilter,
      dateRange: dateRangeFilter,
      semester: semesterFilter,
      academicYear: academicYearFilter,
      includeRawLogs,
      includeComments,
      includeDeterminants
    });
    onClose();
  }

  return createPortal(
    <div className="fixed inset-0 z-[9999] flex items-center justify-center bg-gray-900/50 p-4 backdrop-blur-xs sm:p-6">
      <section
        className="max-h-[92vh] w-full max-w-4xl overflow-hidden rounded-2xl border bg-background shadow-2xl transition-all"
        role="dialog"
        aria-modal="true"
        aria-labelledby="export-modal-title"
      >
        {/* Header */}
        <div className="border-b bg-surface px-6 py-4">
          <div className="flex items-start justify-between gap-4">
            <div>
              <div className="flex items-center gap-2">
                <span className="grid h-8 w-8 place-items-center rounded-lg border border-primary/20 bg-primary/10 text-primary">
                  <Download className="h-4 w-4" />
                </span>
                <h2 id="export-modal-title" className="text-xl font-bold tracking-tight text-foreground">
                  Export Analytics Reports
                </h2>
              </div>
              <p className="mt-1 text-sm text-muted-foreground">
                Select report type, export format, and filter scope before generating your download.
              </p>
            </div>
            <button
              type="button"
              onClick={onClose}
              className="grid h-8 w-8 place-items-center rounded-lg border bg-background text-muted-foreground transition hover:bg-muted hover:text-foreground"
              aria-label="Close export modal"
            >
              <X className="h-4 w-4" aria-hidden="true" />
            </button>
          </div>
        </div>

        {/* Content Body */}
        <form onSubmit={handleFormSubmit} className="max-h-[calc(92vh-130px)] overflow-y-auto p-6 space-y-6">
          {/* Section 1: Report Type Selection */}
          <div className="space-y-3">
            <label className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">
              1. Select Report Type
            </label>
            <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
              {REPORT_TYPES.map((report) => {
                const Icon = report.icon;
                const isSelected = selectedReportId === report.id;
                return (
                  <button
                    key={report.id}
                    type="button"
                    onClick={() => setSelectedReportId(report.id)}
                    className={`group relative flex flex-col justify-between rounded-xl border p-4 text-left transition-all ${
                      isSelected
                        ? "border-primary bg-primary/5 ring-2 ring-primary/20 shadow-sm"
                        : "bg-surface hover:border-primary/40 hover:bg-muted/50"
                    }`}
                  >
                    <div>
                      <div className="flex items-center justify-between gap-2">
                        <span
                          className={`grid h-8 w-8 place-items-center rounded-lg border ${
                            isSelected ? "border-primary/30 bg-primary text-primary-foreground" : "bg-muted text-muted-foreground"
                          }`}
                        >
                          <Icon className="h-4 w-4" />
                        </span>
                        {isSelected ? <CheckCircle2 className="h-4 w-4 text-primary" /> : null}
                      </div>
                      <p className="mt-3 font-semibold text-sm text-foreground">{report.title}</p>
                      <p className="mt-1 line-clamp-2 text-xs text-muted-foreground">{report.description}</p>
                    </div>
                  </button>
                );
              })}
            </div>
          </div>

          {/* Section 2: Format Selection */}
          <div className="space-y-3">
            <label className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">
              2. Select Export Format
            </label>
            <div className="flex flex-wrap gap-3">
              {(["XLSX", "PDF", "CSV"] as ExportFormat[]).map((fmt) => {
                const isSelected = format === fmt;
                const Icon = fmt === "XLSX" ? FileSpreadsheet : fmt === "PDF" ? FileText : FileText;
                return (
                  <button
                    key={fmt}
                    type="button"
                    onClick={() => setFormat(fmt)}
                    className={`inline-flex items-center gap-2.5 rounded-lg border px-4 py-2.5 text-sm font-semibold transition-all ${
                      isSelected
                        ? "border-primary bg-primary text-primary-foreground shadow-sm"
                        : "bg-surface text-foreground hover:bg-muted hover:border-muted-foreground/30"
                    }`}
                  >
                    <Icon className="h-4 w-4" />
                    <span>{fmt} Format</span>
                    {fmt === "XLSX" ? <span className="text-[10px] font-normal opacity-80">(Spreadsheet)</span> : null}
                    {fmt === "PDF" ? <span className="text-[10px] font-normal opacity-80">(Document)</span> : null}
                    {fmt === "CSV" ? <span className="text-[10px] font-normal opacity-80">(Raw Data)</span> : null}
                  </button>
                );
              })}
            </div>
          </div>

          {/* Section 3: Data Scope Filters */}
          <div className="space-y-3 rounded-xl border bg-surface p-4">
            <div className="flex items-center justify-between">
              <label className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">
                3. Filter Data Scope
              </label>
              <span className="inline-flex items-center gap-1 text-xs text-primary font-medium">
                <Filter className="h-3 w-3" /> Filters applied to report
              </span>
            </div>
            <div className="grid gap-4 sm:grid-cols-2 md:grid-cols-3">
              <label className="space-y-1 text-xs font-medium text-muted-foreground">
                <span className="text-foreground">Event Scope</span>
                <select
                  value={eventFilter}
                  onChange={(e) => setEventFilter(e.target.value)}
                  className="h-9 w-full rounded-lg border bg-background px-3 text-xs text-foreground outline-none focus:border-primary focus:ring-2 focus:ring-primary/20"
                >
                  <option value="all">All Events</option>
                  {eventOptions.map((evt) => (
                    <option key={evt.code} value={evt.code}>
                      {evt.code} - {evt.title}
                    </option>
                  ))}
                </select>
              </label>

              <label className="space-y-1 text-xs font-medium text-muted-foreground">
                <span className="text-foreground">Category</span>
                <select
                  value={categoryFilter}
                  onChange={(e) => setCategoryFilter(e.target.value)}
                  className="h-9 w-full rounded-lg border bg-background px-3 text-xs text-foreground outline-none focus:border-primary focus:ring-2 focus:ring-primary/20"
                >
                  <option value="all">All Categories</option>
                  <option value="career-development">Career Development</option>
                  <option value="skills-training">Skills Training</option>
                  <option value="general-seminar">General Seminars</option>
                </select>
              </label>

              <label className="space-y-1 text-xs font-medium text-muted-foreground">
                <span className="text-foreground">Date Range</span>
                <select
                  value={dateRangeFilter}
                  onChange={(e) => setDateRangeFilter(e.target.value)}
                  className="h-9 w-full rounded-lg border bg-background px-3 text-xs text-foreground outline-none focus:border-primary focus:ring-2 focus:ring-primary/20"
                >
                  <option value="last-30-days">Last 30 Days</option>
                  <option value="last-quarter">Last Quarter</option>
                  <option value="last-6-months">Last 6 Months</option>
                  <option value="all-time">All Time</option>
                </select>
              </label>

              <label className="space-y-1 text-xs font-medium text-muted-foreground">
                <span className="text-foreground">Semester</span>
                <select
                  value={semesterFilter}
                  onChange={(e) => setSemesterFilter(e.target.value)}
                  className="h-9 w-full rounded-lg border bg-background px-3 text-xs text-foreground outline-none focus:border-primary focus:ring-2 focus:ring-primary/20"
                >
                  <option value="all">All Semesters</option>
                  <option value="first">1st Semester</option>
                  <option value="second">2nd Semester</option>
                </select>
              </label>

              <label className="space-y-1 text-xs font-medium text-muted-foreground">
                <span className="text-foreground">Academic Year</span>
                <select
                  value={academicYearFilter}
                  onChange={(e) => setAcademicYearFilter(e.target.value)}
                  className="h-9 w-full rounded-lg border bg-background px-3 text-xs text-foreground outline-none focus:border-primary focus:ring-2 focus:ring-primary/20"
                >
                  <option value="2026">AY 2025 - 2026</option>
                  <option value="2025">AY 2024 - 2025</option>
                </select>
              </label>
            </div>
          </div>

          {/* Section 4: Report Options */}
          <div className="space-y-3">
            <label className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">
              4. Additional Report Content Options
            </label>
            <div className="grid gap-3 sm:grid-cols-3">
              <label className="flex items-center gap-2.5 rounded-lg border bg-surface p-3 text-xs font-medium text-foreground cursor-pointer hover:bg-muted/50">
                <input
                  type="checkbox"
                  checked={includeRawLogs}
                  onChange={(e) => setIncludeRawLogs(e.target.checked)}
                  className="h-4 w-4 rounded border-muted-foreground text-primary focus:ring-primary"
                />
                <span>Include raw attendance logs</span>
              </label>

              <label className="flex items-center gap-2.5 rounded-lg border bg-surface p-3 text-xs font-medium text-foreground cursor-pointer hover:bg-muted/50">
                <input
                  type="checkbox"
                  checked={includeComments}
                  onChange={(e) => setIncludeComments(e.target.checked)}
                  className="h-4 w-4 rounded border-muted-foreground text-primary focus:ring-primary"
                />
                <span>Include feedback comments</span>
              </label>

              <label className="flex items-center gap-2.5 rounded-lg border bg-surface p-3 text-xs font-medium text-foreground cursor-pointer hover:bg-muted/50">
                <input
                  type="checkbox"
                  checked={includeDeterminants}
                  onChange={(e) => setIncludeDeterminants(e.target.checked)}
                  className="h-4 w-4 rounded border-muted-foreground text-primary focus:ring-primary"
                />
                <span>Include AI determinants</span>
              </label>
            </div>
          </div>

          {/* Live Preview Summary Box */}
          <div className="rounded-xl border border-primary/20 bg-primary/5 p-4">
            <p className="text-xs font-semibold text-primary">Export Configuration Summary</p>
            <p className="mt-1 text-xs text-foreground">
              Ready to generate <strong className="font-semibold text-primary">{selectedReport.title}</strong> in{" "}
              <strong className="font-semibold">{format}</strong> format for{" "}
              <strong className="font-semibold">
                {eventFilter === "all" ? "All Events" : eventOptions.find((e) => e.code === eventFilter)?.code || eventFilter}
              </strong>{" "}
              ({semesterFilter === "all" ? "All Semesters" : `${semesterFilter} Semester`}, AY {academicYearFilter}).
            </p>
          </div>

          {/* Footer Actions */}
          <div className="flex flex-wrap items-center justify-end gap-3 border-t pt-4">
            <button
              type="button"
              onClick={onClose}
              className="h-10 rounded-lg border bg-background px-4 text-sm font-semibold text-foreground transition hover:bg-muted"
            >
              Cancel
            </button>
            <button
              type="submit"
              className="inline-flex h-10 items-center gap-2 rounded-lg border border-primary bg-primary px-5 text-sm font-semibold text-primary-foreground shadow-md transition hover:bg-primary/90"
            >
              <Download className="h-4 w-4" />
              <span>Export {format} Report</span>
            </button>
          </div>
        </form>
      </section>
    </div>,
    document.body
  );
}
