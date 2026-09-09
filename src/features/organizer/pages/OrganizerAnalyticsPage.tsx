/* eslint-disable @typescript-eslint/no-unused-vars */
import { useMemo, useState } from "react";
import { createPortal } from "react-dom";
import { zodResolver } from "@hookform/resolvers/zod";
import type { ColumnDef } from "@tanstack/react-table";
import {
  AlertTriangle,
  BarChart3,
  CalendarCheck,
  CheckCircle2,
  ChevronDown,
  ChevronLeft,
  ChevronRight,
  ChevronUp,
  ClipboardList,
  Clock3,
  Download,
  FileSpreadsheet,
  FileText,
  Filter,
  LayoutDashboard,
  MessageSquareQuote,
  Plus,
  RotateCcw,
  Search,
  Sparkles,
  Target,
  TrendingUp,
  Users,
  X
} from "lucide-react";
import { Bar, BarChart, CartesianGrid, Cell, Legend, Line, LineChart, Pie, PieChart, ResponsiveContainer, Tooltip, XAxis, YAxis } from "recharts";
import { useForm } from "react-hook-form";
import { NavLink, Navigate, useNavigate, useParams } from "react-router-dom";
import { toast } from "sonner";
import { z } from "zod";
import { RiskSummaryChart } from "@/components/charts/RiskSummaryChart";
import { EmptyState } from "@/components/feedback/EmptyState";
import { ErrorState } from "@/components/feedback/ErrorState";
import { LoadingState } from "@/components/feedback/LoadingState";
import { StatusBadge } from "@/components/feedback/StatusBadge";
import { DatePickerField } from "@/components/forms/DatePickerField";
import { SelectField } from "@/components/forms/SelectField";
import { SubmitButton } from "@/components/forms/SubmitButton";
import { TextAreaField } from "@/components/forms/TextAreaField";
import { TextField } from "@/components/forms/TextField";
import { TimePickerField } from "@/components/forms/TimePickerField";
import { ConfirmModal } from "@/components/modals/ConfirmModal";
import { SearchInput } from "@/components/shared/SearchInput";
import { StatCard } from "@/components/shared/StatCard";
import { PLPassDataGrid } from "@/components/data-display/PLPassDataGrid";
import { FilterBar } from "@/components/tables/FilterBar";
import { Button } from "@/components/ui/button";
import {
  lateReasons
} from "@/features/organizer/data/organizerUiStore";
import { exportTabularReport, type ExportTableRow } from "@/features/organizer/utils/exportUtils";
import { ActiveSessionHeader } from "@/features/attendance/ActiveSessionHeader";
import { LatestTapResultCard } from "@/features/attendance/LatestTapResultCard";
import { LiveAttendanceList } from "@/features/attendance/LiveAttendanceList";
import { ManualLookupPanel } from "@/features/attendance/ManualLookupPanel";
import { QRFallbackPanel } from "@/features/attendance/QRFallbackPanel";
import { SessionSummaryCards } from "@/features/attendance/SessionSummaryCards";
import type { LiveAttendanceRecord } from "@/features/attendance/types";
import { useDevelopmentSession } from "@/hooks/useDevelopmentSession";
import {
  useAcademicCatalog,
  useAttendanceRecords,
  useAttendanceSubmissionMutations,
  useAttendanceSession,
  useAttendanceSessionMutations,
  useAttendanceSessions,
  useCorrectionRequests,
  useEvent,
  useEventParticipants,
  useEvents,
  useMlPredictions,
  useNfcTapAttempts,
  useOrganizerProfiles,
  useReports,
  useStudents,
  useAuditLogMutations,
  useAllEventObjectives,
  useAllEventSummarySnapshots,
  useAllEventFeedback
} from "@/hooks/useRepositoryQueries";
import { useModelInsights, useBatchPrediction } from "@/hooks/useMlApi";
import { APP_ROUTES } from "@/lib/constants/routes";
import { compareDateValues, dateKey, formatDisplayDate, formatDisplayTime, isFutureOrNowDate } from "@/lib/utils/date";
import type { AttendanceSubmissionResult } from "@/services/contracts";
import type { RepositoryContext } from "@/services/repositoryUtils";
import type {
  AttendanceRecord,
  AttendanceSession,
  CorrectionRequest,
  Event,
  EventParticipant,
  MlPrediction,
  Student
} from "@/types/domain";
import type {
  AttendanceStatus,
  CorrectionRequestStatus,
  EventStatus,
  RiskLevel,
  SessionStatus,
  StudentStatus,
  VerificationMethod
} from "@/types/enums";

type OrganizerScope = {
  context: RepositoryContext;
  organizerId?: string;
  organizerName: string;
  isLoading: boolean;
  isError: boolean;
};

type ActiveTab = "prediction" | "attendance" | "sentiment" | "late";

const EMPTY_LATE_REASON_FREQUENCY: Array<{ category: string; share: number }> = [
  { category: "Traffic / Commute", share: 0 },
  { category: "Class / Academic Conflict", share: 0 },
  { category: "Personal / Health", share: 0 },
  { category: "Weather / Force Majeure", share: 0 },
  { category: "Other", share: 0 }
];

const EMPTY_SENTIMENT: Array<{ eventCode: string; positive: number; neutral: number; negative: number; overall: string }> = [
  { eventCode: "N/A", positive: 0, neutral: 0, negative: 0, overall: "Neutral" }
];

const EMPTY_SESSION_SUMMARY: Array<{ eventCode: string; date: string; present: number; late: number; absent: number; totalRegistered: number; attendanceRate: number }> = [
  { eventCode: "N/A", date: "N/A", present: 0, late: 0, absent: 0, totalRegistered: 0, attendanceRate: 0 }
];

const EMPTY_SUMMARY = {
  predictedTurnoutNextEvent: { value: 0 },
  totalRegisteredStudents: 0,
  topLateArrivalReason: { category: "No late arrivals", share: 0 }
};

function useOrganizerScope(): OrganizerScope {
  const { session } = useDevelopmentSession();
  const context = useMemo(
    () => (session ? { actorUserId: session.userId, actorRole: session.role } : undefined),
    [session]
  );
  const organizerQuery = useOrganizerProfiles({ pageSize: 1 }, context);
  return {
    context: context ?? { actorUserId: "", actorRole: "organizer" },
    organizerId: organizerQuery.data?.items[0]?.id,
    organizerName: session?.displayName ?? "Organizer",
    isLoading: organizerQuery.isLoading,
    isError: organizerQuery.isError
  };
}

function formatDate(value: string | undefined) {
  return formatDisplayDate(value, "Not scheduled");
}

function formatTime(value: string | undefined) {
  return formatDisplayTime(value, "Not set");
}

function statusTone(status: AttendanceStatus | SessionStatus | CorrectionRequestStatus | StudentStatus | RiskLevel | EventStatus) {
  if (status === "present" || status === "completed" || status === "approved" || status === "enrolled" || status === "low") {
    return "success" as const;
  }
  if (status === "late" || status === "draft" || status === "pending" || status === "medium") {
    return "warning" as const;
  }
  if (status === "absent" || status === "cancelled" || status === "rejected" || status === "high" || status === "critical") {
    return "danger" as const;
  }
  return "muted" as const;
}

function ChartPanel({
  title,
  description,
  action,
  children
}: {
  title: string;
  description: string;
  action?: React.ReactNode;
  children: React.ReactNode;
}) {
  return (
    <section className="rounded-xl border bg-surface p-5 shadow-sm">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h2 className="text-base font-bold text-foreground">{title}</h2>
          <p className="mt-0.5 text-xs text-muted-foreground">{description}</p>
        </div>
        {action}
      </div>
      <div className="mt-5 h-72 w-full">{children}</div>
    </section>
  );
}

function AnalyticsExportModal({
  isOpen,
  onClose,
  events,
  activeEventFilter,
  onExport
}: {
  isOpen: boolean;
  onClose: () => void;
  events: Array<{ code: string; title: string }>;
  activeEventFilter: string;
  onExport: (reportTitle: string) => void;
}) {
  const [reportType, setReportType] = useState<"master" | "attendance" | "prediction" | "sentiment" | "late">("master");
  const [selectedEvent, setSelectedEvent] = useState(activeEventFilter);
  const [selectedCategory, setSelectedCategory] = useState("all");
  const [selectedRange, setSelectedRange] = useState("all");
  const [exportFormat, setExportFormat] = useState<"xlsx" | "pdf">("xlsx");

  if (!isOpen) return null;

  function handleResetFilters() {
    setSelectedEvent("all");
    setSelectedCategory("all");
    setSelectedRange("all");
  }

  function handleExportSubmit() {
    const reportNames: Record<string, string> = {
      master: "Full Analytics Master Report",
      attendance: "Attendance Summary Report",
      prediction: "Turnout Prediction Report",
      sentiment: "Performance & Sentiment Report",
      late: "Late Arrival Patterns Report"
    };

    const eventLabel = selectedEvent === "all" ? "All Events" : selectedEvent;
    const formatUpper = exportFormat.toUpperCase();
    const title = `${reportNames[reportType]} (${eventLabel}) ${formatUpper}`;

    onExport(title);
    onClose();
  }

  return createPortal(
    <div className="fixed inset-0 z-[9999] flex items-center justify-center bg-slate-900/50 backdrop-blur-sm p-4 animate-in fade-in duration-200">
      <section
        className="w-full max-w-xl overflow-hidden rounded-2xl border border-slate-200/80 bg-white shadow-2xl transition-all"
        role="dialog"
        aria-modal="true"
        aria-labelledby="analytics-export-modal-title"
      >
        {/* Header */}
        <div className="border-b border-slate-100 bg-slate-50/50 px-6 py-4 flex items-center justify-between">
          <div className="flex items-center gap-3">
            <div className="grid h-10 w-10 place-items-center rounded-xl bg-primary/10 border border-primary/20 text-primary shadow-xs">
              <Download className="h-5 w-5" aria-hidden="true" />
            </div>
            <div>
              <h2 id="analytics-export-modal-title" className="text-base font-bold text-slate-900">
                Export Report
              </h2>
              <p className="text-xs text-slate-500 font-medium">Select report type, scope criteria, and download format.</p>
            </div>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="grid h-8 w-8 place-items-center rounded-lg border border-slate-200/60 bg-white text-slate-400 transition hover:bg-slate-100 hover:text-slate-700"
            aria-label="Close export modal"
          >
            <X className="h-4 w-4" aria-hidden="true" />
          </button>
        </div>

        {/* Content */}
        <div className="p-6 space-y-5 max-h-[75vh] overflow-y-auto">
          {/* Step 1: Report Content Selection */}
          <div>
            <span className="text-[11px] font-bold uppercase tracking-wider text-slate-400 block mb-2.5">
              1. Report Content
            </span>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-2.5">
              {[
                {
                  id: "master",
                  title: "Master Analytics",
                  desc: "Complete summary across attendance, turnout predictions, VADER sentiment & late patterns.",
                  icon: BarChart3
                },
                {
                  id: "attendance",
                  title: "Attendance Summary",
                  desc: "Attendance rates per session, present/late/absent breakdowns & turnout rates.",
                  icon: TrendingUp
                },
                {
                  id: "prediction",
                  title: "Turnout Prediction",
                  desc: "Forecasted turnout %, attendee numbers & Random Forest ranked determinants.",
                  icon: Sparkles
                },
                {
                  id: "sentiment",
                  title: "Performance & Sentiment",
                  desc: "Objective goal ratings, VADER sentiment breakdown & student feedback comments.",
                  icon: MessageSquareQuote
                },
                {
                  id: "late",
                  title: "Late Arrival Patterns",
                  desc: "Monthly late counts, top reasons share & category breakdowns.",
                  icon: Clock3
                }
              ].map((item) => {
                const ItemIcon = item.icon;
                const isSelected = reportType === item.id;
                return (
                  <button
                    key={item.id}
                    type="button"
                    onClick={() => setReportType(item.id as typeof reportType)}
                    className={`relative flex flex-col justify-between rounded-xl border p-3.5 text-left transition-all ${
                      isSelected
                        ? "border-primary bg-primary/5 ring-2 ring-primary/20 shadow-xs"
                        : "border-slate-200/80 bg-white hover:border-slate-300 hover:bg-slate-50/50"
                    } ${item.id === "master" ? "sm:col-span-2" : ""}`}
                  >
                    <div className="flex items-center justify-between mb-1.5">
                      <div className={`p-1.5 rounded-lg ${isSelected ? "bg-primary/10 text-primary" : "bg-slate-100 text-slate-500"}`}>
                        <ItemIcon className="h-4 w-4" />
                      </div>
                      {isSelected && (
                        <span className="inline-flex items-center gap-1 rounded-full bg-primary px-2 py-0.5 text-[10px] font-semibold text-white">
                          Selected
                        </span>
                      )}
                    </div>
                    <div>
                      <p className="text-xs font-bold text-slate-900">{item.title}</p>
                      <p className="text-[11px] text-slate-500 mt-0.5 leading-snug">{item.desc}</p>
                    </div>
                  </button>
                );
              })}
            </div>
          </div>

          {/* Step 2: Scope & Filters */}
          <div>
            <div className="flex items-center justify-between mb-2">
              <span className="text-[11px] font-bold uppercase tracking-wider text-slate-400">
                2. Scope & Filters
              </span>
              <button
                type="button"
                onClick={handleResetFilters}
                className="text-xs font-semibold text-slate-500 hover:text-primary transition"
              >
                Reset filters
              </button>
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
              <div>
                <label className="text-[11px] font-semibold text-slate-600 block mb-1">Target Event</label>
                <select
                  value={selectedEvent}
                  onChange={(e) => setSelectedEvent(e.target.value)}
                  className="h-9 w-full rounded-lg border border-slate-200 bg-slate-50/50 px-2.5 text-xs outline-none focus:border-primary focus:bg-white focus:ring-2 focus:ring-primary/20 transition font-medium text-slate-800"
                >
                  <option value="all">All Events</option>
                  {events.map((ev) => (
                    <option key={ev.code} value={ev.code}>
                      {ev.code}
                    </option>
                  ))}
                </select>
              </div>

              <div>
                <label className="text-[11px] font-semibold text-slate-600 block mb-1">Category</label>
                <select
                  value={selectedCategory}
                  onChange={(e) => setSelectedCategory(e.target.value)}
                  className="h-9 w-full rounded-lg border border-slate-200 bg-slate-50/50 px-2.5 text-xs outline-none focus:border-primary focus:bg-white focus:ring-2 focus:ring-primary/20 transition font-medium text-slate-800"
                >
                  <option value="all">All Categories</option>
                  <option value="career">Career Development</option>
                  <option value="skills">Skills Training</option>
                </select>
              </div>

              <div>
                <label className="text-[11px] font-semibold text-slate-600 block mb-1">Time Horizon</label>
                <select
                  value={selectedRange}
                  onChange={(e) => setSelectedRange(e.target.value)}
                  className="h-9 w-full rounded-lg border border-slate-200 bg-slate-50/50 px-2.5 text-xs outline-none focus:border-primary focus:bg-white focus:ring-2 focus:ring-primary/20 transition font-medium text-slate-800"
                >
                  <option value="all">Last 6 Months</option>
                  <option value="quarter">Last Quarter</option>
                  <option value="ay2026">AY 2025-2026</option>
                </select>
              </div>
            </div>
          </div>

          {/* Step 3: Download Format Selection */}
          <div>
            <span className="text-[11px] font-bold uppercase tracking-wider text-slate-400 block mb-2 font-medium">
              3. Download Format
            </span>
            <div className="grid grid-cols-2 gap-3">
              <button
                type="button"
                onClick={() => setExportFormat("xlsx")}
                className={`flex items-center gap-3 rounded-xl border p-3 text-left transition-all ${
                  exportFormat === "xlsx"
                    ? "border-emerald-500 bg-emerald-50/50 text-emerald-900 ring-2 ring-emerald-500/20 font-semibold"
                    : "border-slate-200/80 bg-white text-slate-600 hover:border-slate-300 hover:bg-slate-50/50"
                }`}
              >
                <div className={`p-2 rounded-lg ${exportFormat === "xlsx" ? "bg-emerald-500/10 text-emerald-600" : "bg-slate-100 text-slate-500"}`}>
                  <FileSpreadsheet className="h-4 w-4" />
                </div>
                <div>
                  <p className="text-xs font-bold">Spreadsheet (.XLSX)</p>
                  <p className="text-[10px] text-slate-500 font-normal">Excel & CSV tabular format</p>
                </div>
              </button>

              <button
                type="button"
                onClick={() => setExportFormat("pdf")}
                className={`flex items-center gap-3 rounded-xl border p-3 text-left transition-all ${
                  exportFormat === "pdf"
                    ? "border-emerald-500 bg-emerald-50/50 text-emerald-900 ring-2 ring-emerald-500/20 font-semibold"
                    : "border-slate-200/80 bg-white text-slate-600 hover:border-slate-300 hover:bg-slate-50/50"
                }`}
              >
                <div className={`p-2 rounded-lg ${exportFormat === "pdf" ? "bg-emerald-500/10 text-emerald-600" : "bg-slate-100 text-slate-500"}`}>
                  <FileText className="h-4 w-4" />
                </div>
                <div>
                  <p className="text-xs font-bold">PDF Document (.PDF)</p>
                  <p className="text-[10px] text-slate-500 font-normal">Printable formatted report</p>
                </div>
              </button>
            </div>
          </div>
        </div>

        {/* Footer */}
        <div className="border-t border-slate-100 bg-slate-50/80 px-6 py-4 flex items-center justify-between gap-3">
          <div className="flex items-center gap-2">
            <span className="inline-flex items-center gap-1.5 rounded-full border border-primary/20 bg-primary/10 px-3 py-1 text-xs font-semibold text-primary">
              <CheckCircle2 className="h-3.5 w-3.5" />
              {selectedEvent === "all" ? "All Events Scope" : `Scope: ${selectedEvent}`}
            </span>
          </div>

          <div className="flex items-center gap-2.5">
            <button
              type="button"
              onClick={onClose}
              className="h-9 rounded-xl border border-slate-200 bg-white px-4 text-xs font-semibold text-slate-700 transition hover:bg-slate-100"
            >
              Cancel
            </button>
            <button
              type="button"
              onClick={handleExportSubmit}
              className="inline-flex h-9 items-center justify-center gap-2 rounded-xl bg-primary px-5 text-xs font-bold text-white shadow-md shadow-primary/25 transition hover:bg-primary/90 active:scale-[0.98]"
            >
              <Download className="h-4 w-4" aria-hidden="true" />
              Export {exportFormat.toUpperCase()}
            </button>
          </div>
        </div>
      </section>
    </div>,
    document.body
  );
}

export function OrganizerAnalyticsPage() {
  const [activeTab, setActiveTab] = useState<ActiveTab>("prediction");
  const [eventFilter, setEventFilter] = useState("all");
  const [predictionPage, setPredictionPage] = useState(0);
  const [isExportModalOpen, setIsExportModalOpen] = useState(false);
  const [selectedPdpFeature, setSelectedPdpFeature] = useState<string>("");
  const scope = useOrganizerScope();
  const auditLogMutations = useAuditLogMutations(scope.context);
  const eventsQuery = useEvents({ pageSize: 200 }, scope.context);
  const sessionsQuery = useAttendanceSessions({ pageSize: 500 }, scope.context);
  const attendanceRecordsQuery = useAttendanceRecords({ pageSize: 1000 }, scope.context);
  const studentsQuery = useStudents({ pageSize: 1000 }, scope.context);
  const objectivesQuery = useAllEventObjectives({ pageIndex: 0, pageSize: 1000 }, scope.context);
  const summariesQuery = useAllEventSummarySnapshots({ pageIndex: 0, pageSize: 200 }, scope.context);
  const feedbackQuery = useAllEventFeedback({ pageIndex: 0, pageSize: 1000 }, scope.context);
  const eventData = useMemo(
    () =>
      (eventsQuery.data?.items ?? []).map((event) => ({
        id: event.id,
        code: event.code,
        title: event.title,
        category: event.category,
        venue: event.venue,
        date: dateKey(event.startsAt),
        startsAt: event.startsAt,
        time: `${new Date(event.startsAt).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" })} - ${new Date(event.endsAt).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" })}`,
        predictedTurnout: event.predictedTurnout ?? 0
      })),
    [eventsQuery.data?.items]
  );
  const sessionSummaryData = useMemo(
    () => {
      const eventById = new Map((eventsQuery.data?.items ?? []).map((event) => [event.id, event]));
      return (sessionsQuery.data?.items ?? []).filter((session) => session.type === "event" && session.status === "completed" && session.eventId).map((session) => {
        const event = eventById.get(session.eventId ?? "");
        const records = (attendanceRecordsQuery.data?.items ?? []).filter((record) => record.sessionId === session.id);
        const present = records.filter((record) => record.status === "present").length;
        const late = records.filter((record) => record.status === "late").length;
        const absent = records.filter((record) => record.status === "absent").length;
        const totalRegistered = records.length;
        return { eventCode: event?.code ?? session.title, date: dateKey(session.startsAt), present, late, absent, totalRegistered, attendanceRate: totalRegistered ? Math.round(((present + late) / totalRegistered) * 100) : 0 };
      });
    },
    [attendanceRecordsQuery.data?.items, eventsQuery.data?.items, sessionsQuery.data?.items]
  );
  const sentimentData = useMemo<Array<{ eventCode: string; overall: string; positive: number; neutral: number; negative: number }>>(() => [], []);
  const eventLookup = useMemo(() => new Map(eventData.map((event) => [event.code, event])), [eventData]);

  const trendData = useMemo(() => {
    const sourceRows = sessionSummaryData;
    const rows = eventFilter === "all" ? sourceRows : sourceRows.filter((row: { eventCode: string; date: string; present: number; late: number; absent: number; totalRegistered: number; attendanceRate: number }) => row.eventCode === eventFilter);

    return rows.map((row: { eventCode: string; date: string; present: number; late: number; absent: number; attendanceRate: number }) => ({
      label: row.eventCode,
      attendanceRate: row.attendanceRate,
      date: row.date,
      present: row.present,
      late: row.late,
      absent: row.absent
    }));
  }, [eventFilter, sessionSummaryData]);

  const predictionOverviewData = useMemo(() => {
    const filteredEvents = eventFilter === "all" ? eventData : eventData.filter((event) => event.code === eventFilter);
    return filteredEvents.map((event) => ({
      label: event.code,
      title: event.title,
      predictedAttend: event.predictedTurnout,
      predictedMiss: 100 - event.predictedTurnout
    }));
  }, [eventData, eventFilter]);

  const totalPredictionPages = Math.ceil(predictionOverviewData.length / 20);
  const paginatedPredictionData = useMemo(() => {
    return predictionOverviewData.slice(predictionPage * 20, (predictionPage + 1) * 20);
  }, [predictionOverviewData, predictionPage]);

  const sentimentOverview = useMemo(() => {
    const sourceSummaries = summariesQuery.data?.items ?? [];
    const filteredSummaries = eventFilter === "all" ? sourceSummaries : sourceSummaries.filter((row) => row.eventId === eventLookup.get(eventFilter)?.id);
    
    if (filteredSummaries.length === 0) {
      return [
        { name: "Positive", value: 0 },
        { name: "Neutral", value: 0 },
        { name: "Negative", value: 0 }
      ];
    }
    
    const totals = filteredSummaries.reduce(
      (acc, row) => ({
        positive: acc.positive + (row.positivePercentage || 0),
        neutral: acc.neutral + (row.neutralPercentage || 0),
        negative: acc.negative + (row.negativePercentage || 0)
      }),
      { positive: 0, neutral: 0, negative: 0 }
    );
    const count = filteredSummaries.length || 1;

    return [
      { name: "Positive", value: Math.round(totals.positive / count) },
      { name: "Neutral", value: Math.round(totals.neutral / count) },
      { name: "Negative", value: Math.round(totals.negative / count) }
    ];
  }, [eventFilter, eventLookup, summariesQuery.data?.items]);

  const filteredLateReasons = useMemo(() => {
    const eventByCode = new Map(eventData.map((event) => [event.code, event]));
    const sessionIds = new Set((sessionsQuery.data?.items ?? []).filter((session) => eventFilter === "all" || eventByCode.get(eventFilter)?.code === eventFilter && session.eventId === (eventsQuery.data?.items ?? []).find((event) => event.code === eventFilter)?.id).map((session) => session.id));
    const lateRows = (attendanceRecordsQuery.data?.items ?? []).filter((row) => sessionIds.has(row.sessionId) && row.status === "late");
    if (!lateRows.length) return [];
    return lateReasons.map((reason: string) => {
      const count = lateRows.filter((row) => row.lateReason === reason || row.lateReasonCategory === reason).length;
      return {
        category: reason,
        count: count,
        share: Math.round((count / lateRows.length) * 100)
      };
    });
  }, [attendanceRecordsQuery.data?.items, eventData, eventFilter, eventsQuery.data?.items, sessionsQuery.data?.items]);

  const customLateReasons = useMemo(() => {
    const eventByCode = new Map(eventData.map((event) => [event.code, event]));
    const sessionIds = new Set((sessionsQuery.data?.items ?? []).filter((session) => eventFilter === "all" || eventByCode.get(eventFilter)?.code === eventFilter && session.eventId === (eventsQuery.data?.items ?? []).find((event) => event.code === eventFilter)?.id).map((session) => session.id));
    const lateRows = (attendanceRecordsQuery.data?.items ?? []).filter((row) => sessionIds.has(row.sessionId) && row.status === "late");
    
    return lateRows
      .filter((row) => row.lateReason && row.lateReason !== row.lateReasonCategory && !(lateReasons as string[]).includes(row.lateReason))
      .map((row) => ({
        text: row.lateReason as string,
        category: row.lateReasonCategory || "Other",
        date: row.recordedAt
      }))
      .sort((a, b) => new Date(b.date).getTime() - new Date(a.date).getTime())
      .slice(0, 10); // Show top 10 most recent
  }, [attendanceRecordsQuery.data?.items, eventData, eventFilter, eventsQuery.data?.items, sessionsQuery.data?.items]);

  const nextEvent = eventData.filter((event) => new Date(event.startsAt) >= new Date()).sort((first, second) => first.startsAt.localeCompare(second.startsAt))[0];
  const targetEventId = eventFilter === "all" ? nextEvent?.id : eventLookup.get(eventFilter)?.id;
  
  const studentIds = useMemo(() => studentsQuery.data?.items.map(s => s.id) ?? [], [studentsQuery.data]);
  const registeredStudents = studentIds.length || 1;

  const { data: insightsData } = useModelInsights();
  const { data: batchData, isFetching: isPredicting } = useBatchPrediction(targetEventId ?? "", studentIds);

  const selectedPrediction = useMemo(() => {
    if (batchData && studentIds.length > 0) {
      return Math.round((batchData.aggregate_expected_turnout / studentIds.length) * 100);
    }
    // Fallback if not loaded
    return eventFilter === "all" ? nextEvent?.predictedTurnout ?? 0 : eventLookup.get(eventFilter)?.predictedTurnout ?? 0;
  }, [batchData, studentIds, eventFilter, nextEvent, eventLookup]);

  const topLateReason = useMemo(() => {
    const reasons = filteredLateReasons;
    return reasons.length > 0
      ? reasons.reduce((max: { category: string; count: number; share: number }, r: { category: string; count: number; share: number }) => (r.share > max.share ? r : max))
      : { category: "No late records", count: 0, share: 0 };
  }, [filteredLateReasons]);

  const activePdpFeature = useMemo(() => {
    const features = insightsData?.partial_dependence ? Object.keys(insightsData.partial_dependence) : [];
    if (features.length === 0) {
      const mockIds = ["rolling_participation_rate", "previous_event_participation", "time_of_day", "event_category", "venue_accessibility"];
      return selectedPdpFeature || mockIds[0];
    }
    return selectedPdpFeature && features.includes(selectedPdpFeature) ? selectedPdpFeature : features[0];
  }, [insightsData, selectedPdpFeature]);

  const pdpData = useMemo(() => {
    const pd = insightsData?.partial_dependence;
    if (!pd || !pd[activePdpFeature]) {
      if (!activePdpFeature) return null;
      return Array.from({ length: 6 }).map((_, i) => ({
        value: i * 20,
        probability: Math.round(50 + Math.sin(i) * 30 + (i * 2))
      }));
    }
    const data = pd[activePdpFeature] as { grid_values?: number[]; average?: number[] };
    const { grid_values, average } = data;
    if (!grid_values || !average) return null;
    return grid_values.map((val: number, i: number) => ({
      value: typeof val === "number" ? (val % 1 === 0 ? val : Number(val.toFixed(2))) : val,
      probability: Math.round(average[i] * 100)
    }));
  }, [insightsData, activePdpFeature]);

  const predictionFactors = useMemo(() => {
    const baseFactors = [
      { id: "rolling_participation_rate", name: "Attendance history", strength: 92, detail: "Strongest signal in repeat turnout patterns", type: "inherent", insight: "Students with high past participation are very likely to attend. Ensure reminders are sent to those with dropping rates." },
      { id: "previous_event_participation", name: "Previous event participation", strength: 81, detail: "Students who joined earlier sessions return more often", type: "inherent", insight: "Leverage momentum by scheduling related events closely." },
      { id: "time_of_day", name: "Time of day", strength: 74, detail: "Specific time blocks show stronger attendance", type: "actionable", insight: "Avoid late afternoon slots; morning sessions (9AM-11AM) maximize probability." },
      { id: "event_category", name: "Event category", strength: 69, detail: "Skills training shows stronger attendance than general seminars", type: "actionable", insight: "Consider framing generic seminars as skill-building workshops." },
      { id: "venue_accessibility", name: "Venue accessibility", strength: 64, detail: "Convenient locations improve attendance confidence", type: "actionable", insight: "Book centralized venues for events targeting broad audiences." }
    ];
    
    if (insightsData?.feature_importance && insightsData.feature_importance.length > 0) {
      const maxImp = Math.max(0.0001, ...insightsData.feature_importance.map(f => f.importance_mean));
      return insightsData.feature_importance.slice(0, 5).map(f => {
        const formattedName = f.feature.split('_').map(w => w.charAt(0).toUpperCase() + w.slice(1)).join(' ');
        const actionableFeatures = ['time', 'category', 'venue', 'duration', 'day'];
        const isActionable = actionableFeatures.some(key => f.feature.toLowerCase().includes(key));
        return {
          id: f.feature,
          name: formattedName,
          strength: Math.min(100, Math.max(1, Math.round((f.importance_mean / maxImp) * 100))),
          detail: `Relative importance derived from Random Forest permutation.`,
          type: isActionable ? "actionable" : "inherent",
          insight: isActionable ? `Adjust this factor to directly influence predicted attendance.` : `Use this audience insight to target your communications.`
        };
      });
    }

    if (eventFilter === "all") return baseFactors;
    const event = eventLookup.get(eventFilter);
    return event ? baseFactors.map(f => ({ ...f, detail: `Based on ${event.code} data: ${f.detail.split(": ")[1] || f.detail}` })) : baseFactors;
  }, [eventFilter, eventLookup, insightsData]);

  function handleExportReport(label: string) {
    let rows: ExportTableRow[];
    if (/prediction/i.test(label)) rows = predictionOverviewData.map((row) => ({ ...row }));
    else if (/sentiment/i.test(label)) rows = sentimentData.map((row) => ({ ...row }));
    else if (/late/i.test(label)) rows = filteredLateReasons.map((row) => ({ ...row }));
    else rows = trendData.map((row) => ({ ...row }));
    exportTabularReport(label, rows);
    toast.success(`${label} downloaded.`);
    
    void auditLogMutations.logActionMutation.mutateAsync({
      action: "Exported Analytics",
      targetType: "export_action",
      metadata: { label }
    });
  }

  const objectivePerformance = useMemo(() => {
    const sourceObjectives = objectivesQuery.data?.items ?? [];
    const filteredObjectives = eventFilter === "all" ? sourceObjectives : sourceObjectives.filter(obj => obj.eventId === eventLookup.get(eventFilter)?.id);
    
    const grouped = new Map<string, { totalScore: number, count: number }>();
    filteredObjectives.forEach(obj => {
      if (obj.averageRating != null && obj.averageRating > 0) {
        const existing = grouped.get(obj.text) || { totalScore: 0, count: 0 };
        grouped.set(obj.text, { totalScore: existing.totalScore + obj.averageRating, count: existing.count + 1 });
      }
    });
    
    if (grouped.size === 0) return [];
    
    return Array.from(grouped.entries()).map(([label, data]) => ({
      label,
      score: Number((data.totalScore / data.count).toFixed(1)),
      responses: data.count
    })).sort((a, b) => b.score - a.score);
  }, [eventFilter, eventLookup, objectivesQuery.data?.items]);

  const studentComments = useMemo(() => {
    const sourceFeedback = feedbackQuery.data?.items ?? [];
    const filteredFeedback = eventFilter === "all" ? sourceFeedback : sourceFeedback.filter(fb => fb.eventId === eventLookup.get(eventFilter)?.id);
    
    return filteredFeedback
      .filter(fb => fb.comment && fb.comment.trim().length > 0)
      .map(fb => ({
        sentiment: fb.sentimentLabel || "Neutral",
        comment: fb.comment || ""
      }))
      .slice(0, 10);
  }, [eventFilter, eventLookup, feedbackQuery.data?.items]);

  const lateArrivalTrend = useMemo(() => {
    const baseTrend = [
      { month: "Jan", count: 18 },
      { month: "Feb", count: 24 },
      { month: "Mar", count: 21 },
      { month: "Apr", count: 29 }
    ];
    if (eventFilter === "all") return baseTrend;
    return baseTrend.map(t => ({ ...t, count: Math.round(t.count * 0.5) }));
  }, [eventFilter]);

  const overallAttendanceRate = useMemo(() => {
    return Math.round(trendData.reduce((acc: number, row: { attendanceRate?: number }) => acc + (row.attendanceRate ?? 0), 0) / Math.max(trendData.length, 1));
  }, [trendData]);

  const positiveSentimentShare = useMemo(() => {
    const posObj = sentimentOverview.find(s => s.name === "Positive");
    return posObj ? posObj.value : 0;
  }, [sentimentOverview]);

  const tabs: Array<{ id: ActiveTab; label: string; icon: typeof BarChart3 }> = [
    { id: "prediction", label: "Turnout Forecast", icon: Sparkles },
    { id: "attendance", label: "Attendance Trends", icon: TrendingUp },
    { id: "sentiment", label: "Feedback & Sentiment", icon: MessageSquareQuote },
    { id: "late", label: "Late Arrival Patterns", icon: Clock3 }
  ];

  return (
    <div className="space-y-6 pb-12">
      <div className="flex flex-col gap-1">
        <h1 className="text-2xl font-bold tracking-tight text-foreground">Analytics Insights</h1>
        <p className="text-sm text-muted-foreground">Monitor attendance trends, turnout forecasts, and feedback sentiment across events.</p>
      </div>
      
      {/* Header with Export Action */}
      

      <div className="rounded-lg border bg-surface p-4 shadow-sm">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div className="flex items-center gap-2">
            <Button
              type="button"
              variant="outline"
              size="sm"
              className="h-8"
              onClick={() => {
                void eventsQuery.refetch();
                toast.success("Analytics refreshed");
              }}
            >
              <RotateCcw className="mr-2 h-3.5 w-3.5" />
              Refresh
            </Button>
            <button
              type="button"
              onClick={() => setIsExportModalOpen(true)}
              className="inline-flex h-8 items-center gap-1.5 rounded-md border border-emerald-700 bg-emerald-700 px-3 text-xs font-semibold text-white transition hover:border-emerald-800 hover:bg-emerald-800"
            >
              <Download className="h-3.5 w-3.5" aria-hidden="true" />
              Export
            </button>
          </div>
        </div>
      </div>

      {/* Analytics Summary KPI Bar */}
      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
        <article className="rounded-xl border border-slate-200/80 bg-white p-4 shadow-xs transition hover:shadow-md">
          <div className="flex items-center justify-between">
            <p className="text-xs font-semibold text-slate-500 uppercase tracking-wider">Overall Attendance</p>
            <div className="p-2 rounded-lg bg-blue-50 text-blue-600">
              <TrendingUp className="h-4 w-4" />
            </div>
          </div>
          <p className="mt-2 text-2xl font-bold text-slate-900">{overallAttendanceRate}%</p>
          <p className="mt-1 text-[11px] text-slate-500 font-medium">Average across filtered sessions</p>
        </article>

        <article className="rounded-xl border border-slate-200/80 bg-white p-4 shadow-xs transition hover:shadow-md">
          <div className="flex items-center justify-between">
            <p className="text-xs font-semibold text-slate-500 uppercase tracking-wider">Turnout Forecast</p>
            <div className="p-2 rounded-lg bg-emerald-50 text-emerald-600">
              {isPredicting ? <span className="animate-spin h-4 w-4 block rounded-full border-2 border-emerald-600 border-t-transparent" /> : <Sparkles className="h-4 w-4" />}
            </div>
          </div>
          <p className="mt-2 text-2xl font-bold text-slate-900">{selectedPrediction}%</p>
          <p className="mt-1 text-[11px] text-slate-500 font-medium">{isPredicting ? "Calculating via Random Forest..." : "Predicted turnout for selected event"}</p>
        </article>

        <article className="rounded-xl border border-slate-200/80 bg-white p-4 shadow-xs transition hover:shadow-md">
          <div className="flex items-center justify-between">
            <p className="text-xs font-semibold text-slate-500 uppercase tracking-wider">Positive Sentiment</p>
            <div className="p-2 rounded-lg bg-amber-50 text-amber-600">
              <MessageSquareQuote className="h-4 w-4" />
            </div>
          </div>
          <p className="mt-2 text-2xl font-bold text-slate-900">{positiveSentimentShare}%</p>
          <p className="mt-1 text-[11px] text-slate-500 font-medium">Favorable student feedback</p>
        </article>

        <article className="rounded-xl border border-slate-200/80 bg-white p-4 shadow-xs transition hover:shadow-md">
          <div className="flex items-center justify-between">
            <p className="text-xs font-semibold text-slate-500 uppercase tracking-wider">Top Late Cause</p>
            <div className="p-2 rounded-lg bg-purple-50 text-purple-600">
              <Clock3 className="h-4 w-4" />
            </div>
          </div>
          <p className="mt-2 text-base font-bold text-slate-900 truncate">{topLateReason.category}</p>
          <p className="mt-1 text-[11px] text-slate-500 font-medium">{topLateReason.share}% of total late arrivals</p>
        </article>
      </div>

      {/* Global Filter Bar & Navigation Tabs Row */}
      <div className="sticky top-0 z-20 rounded-2xl border border-slate-200/80 bg-white/95 p-3 shadow-md backdrop-blur-md space-y-3">
        {/* Navigation Tabs */}
        <div className="flex items-center justify-between gap-3 flex-wrap">
          <nav className="flex items-center gap-1.5 overflow-x-auto pb-1 sm:pb-0 scrollbar-none" aria-label="Analytics Navigation Tabs">
            {tabs.map((tab) => {
              const TabIcon = tab.icon;
              const isActive = activeTab === tab.id;
              return (
                <button
                  key={tab.id}
                  type="button"
                  onClick={() => setActiveTab(tab.id)}
                  className={`inline-flex items-center gap-2 rounded-xl px-3.5 py-2 text-xs font-bold transition-all whitespace-nowrap ${
                    isActive
                      ? "bg-primary text-white shadow-md shadow-primary/20"
                      : "bg-slate-100/70 text-slate-600 hover:bg-slate-200/70 hover:text-slate-900"
                  }`}
                >
                  <TabIcon className="h-3.5 w-3.5" />
                  {tab.label}
                </button>
              );
            })}
          </nav>

          {/* Quick Event Filter Dropdown */}
          <div className="flex items-center gap-2">
            <span className="text-xs font-semibold text-slate-500 flex items-center gap-1">
              <Filter className="h-3.5 w-3.5 text-primary" />
              Event:
            </span>
            <select
              className="h-8 rounded-lg border border-slate-200 bg-slate-50/80 px-2.5 text-xs font-semibold text-slate-800 outline-none focus:border-primary focus:bg-white focus:ring-2 focus:ring-primary/20 transition"
              value={eventFilter}
              onChange={(event) => {
                setEventFilter(event.target.value);
                setPredictionPage(0);
              }}
            >
              <option value="all">All events</option>
              {eventData.map((event) => (
                <option key={event.code} value={event.code}>
                  {event.code} - {event.title}
                </option>
              ))}
            </select>
            {eventFilter !== "all" && (
              <button
                type="button"
                onClick={() => {
                  setEventFilter("all");
                  setPredictionPage(0);
                }}
                className="grid h-8 w-8 place-items-center rounded-lg border border-slate-200 bg-white text-slate-500 hover:text-primary transition"
                title="Reset event filter"
              >
                <RotateCcw className="h-3.5 w-3.5" />
              </button>
            )}
          </div>
        </div>
      </div>

      {/* Tab 1: TURNOUT FORECAST TAB */}
      {activeTab === "prediction" && (
        <section className="space-y-4">


          <div className="grid gap-6 xl:grid-cols-[1.25fr_0.75fr]">
            {/* Left Column: Ranked Factors */}
            <div className="space-y-4">
              <div className="flex items-center gap-2 px-1 mb-2">
                <Target className="h-5 w-5 text-primary" />
                <div>
                  <h3 className="text-base font-bold text-foreground">Ranked Attendance Factors</h3>
                  <p className="text-[11px] text-muted-foreground">The most influential drivers for this event's turnout, ranked by permutation importance.</p>
                </div>
              </div>

              <div className="space-y-3">
                {predictionFactors.map((factor) => {
                  const isActive = activePdpFeature === factor.id;
                  const isActionable = factor.type === "actionable";
                  return (
                    <div 
                      key={factor.id} 
                      className={`overflow-hidden rounded-xl border transition-all duration-300 ${isActive ? 'bg-primary/5 border-primary/30 shadow-sm' : 'bg-surface hover:border-primary/20 hover:bg-slate-50'}`}
                    >
                      <button 
                        type="button"
                        onClick={() => setSelectedPdpFeature(factor.id)}
                        className="flex w-full items-center justify-between p-4 text-left"
                      >
                        <div className="flex-1 pr-4">
                          <div className="flex flex-wrap items-center gap-2 mb-1">
                            <h4 className="text-sm font-bold text-foreground">{factor.name}</h4>
                            <span className={`px-2 py-0.5 rounded-full text-[9px] font-bold uppercase tracking-wider ${isActionable ? 'bg-blue-100 text-blue-700 border-blue-200 border' : 'bg-slate-100 text-slate-600 border-slate-200 border'}`}>
                              {isActionable ? 'Actionable Control' : 'Audience Insight'}
                            </span>
                          </div>
                          <p className="text-xs text-muted-foreground line-clamp-1">{factor.detail}</p>
                        </div>
                        <div className="flex items-center gap-4 shrink-0">
                          <div className="text-right hidden sm:block">
                            <span className="text-xs font-bold text-primary">{factor.strength}% Impact</span>
                            <div className="mt-1.5 h-1.5 w-24 overflow-hidden rounded-full bg-muted">
                              <div className="h-full rounded-full bg-primary" style={{ width: `${factor.strength}%` }} />
                            </div>
                          </div>
                          {isActive ? <ChevronUp className="h-5 w-5 text-primary" /> : <ChevronDown className="h-5 w-5 text-slate-400" />}
                        </div>
                      </button>

                      {/* Expandable PDP Section */}
                      {isActive && pdpData && (
                        <div className="border-t border-primary/10 bg-white/50 p-4 animate-in fade-in slide-in-from-top-2 duration-300">
                          <div className="mb-4 rounded-lg bg-blue-50/80 border border-blue-100 p-3">
                            <h5 className="text-[10px] font-bold uppercase tracking-wider text-blue-800 mb-1">AI Recommendation</h5>
                            <p className="text-xs font-medium text-blue-900 leading-relaxed">{factor.insight}</p>
                          </div>
                          
                          <div className="h-48 w-full mt-2">
                            <ResponsiveContainer width="100%" height="100%">
                              <LineChart data={pdpData} margin={{ top: 8, right: 12, left: -20, bottom: 0 }}>
                                <CartesianGrid strokeDasharray="3 3" vertical={false} opacity={0.5} />
                                <XAxis dataKey="value" fontSize={11} tickLine={false} axisLine={false} />
                                <YAxis unit="%" domain={[0, 100]} fontSize={11} tickLine={false} axisLine={false} />
                                <Tooltip formatter={(value: number) => [`${value}%`, "Predicted Probability"]} labelFormatter={(label) => `Factor Value: ${label}`} />
                                <Line type="monotone" dataKey="probability" stroke="#3b82f6" strokeWidth={3} dot={{ r: 4, strokeWidth: 2, fill: "#fff" }} activeDot={{ r: 6, fill: "#3b82f6" }} />
                              </LineChart>
                            </ResponsiveContainer>
                          </div>
                          <p className="text-center text-[10px] text-muted-foreground mt-2">Partial Dependence Plot indicating marginal effect on attendance probability.</p>
                        </div>
                      )}
                    </div>
                  );
                })}
              </div>
            </div>

            {/* Right Column: Prediction Overview Context */}
            <div className="space-y-4">
              <ChartPanel title="Prediction Overview" description="Predicted turnout vs expected absence.">
                <div className="flex h-full min-h-0 flex-col">
                  <div className="min-h-0 flex-1">
                    <ResponsiveContainer width="100%" height="100%">
                      <BarChart data={paginatedPredictionData} margin={{ top: 8, right: 12, left: -10, bottom: 4 }}>
                        <CartesianGrid strokeDasharray="3 3" vertical={false} />
                        <XAxis dataKey="label" fontSize={11} tickLine={false} axisLine={false} />
                        <YAxis unit="%" domain={[0, 100]} fontSize={11} tickLine={false} axisLine={false} />
                        <Tooltip formatter={(value: number) => `${value}%`} />
                        <Legend iconType="circle" wrapperStyle={{ fontSize: '11px' }} />
                        <Bar dataKey="predictedAttend" name="Predicted to attend" stackId="prediction" fill="#16a34a" radius={[3, 3, 0, 0]} />
                        <Bar dataKey="predictedMiss" name="Predicted to miss" stackId="prediction" fill="#dc2626" radius={[3, 3, 0, 0]} />
                      </BarChart>
                    </ResponsiveContainer>
                  </div>
                  {totalPredictionPages > 1 && (
                    <div className="mt-3 flex items-center justify-between border-t border-slate-100 pt-3">
                      <p className="text-[10px] text-muted-foreground">
                        Showing {predictionPage * 20 + 1} to {Math.min((predictionPage + 1) * 20, predictionOverviewData.length)} of {predictionOverviewData.length} events
                      </p>
                      <div className="flex items-center gap-1">
                        <Button type="button" variant="outline" size="sm" className="h-6 w-6 p-0" onClick={() => setPredictionPage(p => Math.max(0, p - 1))} disabled={predictionPage === 0}>
                          <ChevronLeft className="h-3.5 w-3.5" />
                        </Button>
                        <Button type="button" variant="outline" size="sm" className="h-6 w-6 p-0" onClick={() => setPredictionPage(p => Math.min(totalPredictionPages - 1, p + 1))} disabled={predictionPage >= totalPredictionPages - 1}>
                          <ChevronRight className="h-3.5 w-3.5" />
                        </Button>
                      </div>
                    </div>
                  )}
                </div>
              </ChartPanel>
            </div>
          </div>
        </section>
      )}

      {/* Tab 2: ATTENDANCE ANALYTICS TAB */}
      {activeTab === "attendance" && (
        <section className="space-y-4 pt-2">


          <div className="grid gap-6 xl:grid-cols-[1.1fr_0.9fr]">
            <ChartPanel title="Attendance Trends" description="Attendance rate per session across recorded events.">
              <ResponsiveContainer width="100%" height="100%">
                <LineChart data={trendData} margin={{ top: 8, right: 14, left: -10, bottom: 4 }}>
                  <CartesianGrid strokeDasharray="3 3" vertical={false} />
                  <XAxis dataKey="label" fontSize={12} tickLine={false} axisLine={false} />
                  <YAxis unit="%" domain={[0, 100]} fontSize={12} tickLine={false} axisLine={false} />
                  <Tooltip formatter={(value: number) => [`${value}%`, "Attendance rate"]} labelFormatter={(label, payload) => `${label} - ${payload?.[0]?.payload?.date ?? ""}`} />
                  <Line type="monotone" dataKey="attendanceRate" name="Attendance rate" stroke="#2563eb" strokeWidth={3} dot={{ r: 4, strokeWidth: 2 }} activeDot={{ r: 6 }} />
                </LineChart>
              </ResponsiveContainer>
            </ChartPanel>

            <div className="space-y-4">
              <div className="grid gap-3 sm:grid-cols-2">
                <article className="rounded-xl border bg-surface p-4 shadow-xs">
                  <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wider">Total Present</p>
                  <p className="mt-1 text-2xl font-bold text-foreground">{trendData.reduce((acc: number, row: { present?: number }) => acc + (row.present ?? 0), 0).toLocaleString()}</p>
                </article>
                <article className="rounded-xl border bg-surface p-4 shadow-xs">
                  <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wider">Total Late</p>
                  <p className="mt-1 text-2xl font-bold text-foreground">{trendData.reduce((acc: number, row: { late?: number }) => acc + (row.late ?? 0), 0).toLocaleString()}</p>
                </article>
              </div>

              <article className="rounded-xl border bg-surface p-4 shadow-xs">
                <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wider">Attendance Summary</p>
                <div className="mt-3 space-y-2.5">
                  <div className="flex items-center justify-between text-xs">
                    <span className="font-medium text-muted-foreground">Total Absent</span>
                    <span className="font-bold text-foreground">{trendData.reduce((acc: number, row: { absent?: number }) => acc + (row.absent ?? 0), 0).toLocaleString()}</span>
                  </div>
                  <div className="flex items-center justify-between text-xs">
                    <span className="font-medium text-muted-foreground">Overall Attendance Rate</span>
                    <span className="font-bold text-foreground">{overallAttendanceRate}%</span>
                  </div>
                </div>
              </article>
            </div>
          </div>
        </section>
      )}

      {/* Tab 3: FEEDBACK & SENTIMENT TAB */}
      {activeTab === "sentiment" && (
        <section className="space-y-4 pt-2">


          <div className="grid gap-6 xl:grid-cols-2">
            <ChartPanel title="Objective Performance" description="Average rating score and response volume per goal.">
              <div className="space-y-3">
                {objectivePerformance.map((objective) => (
                  <div key={objective.label} className="rounded-lg border bg-background p-3">
                    <div className="flex items-center justify-between gap-3">
                      <p className="text-xs font-semibold text-foreground">{objective.label}</p>
                      <span className="text-xs font-bold text-primary">{objective.score.toFixed(1)}/5</span>
                    </div>
                    <div className="mt-1.5 h-1.5 overflow-hidden rounded-full bg-muted">
                      <div className="h-full rounded-full bg-primary" style={{ width: `${(objective.score / 5) * 100}%` }} />
                    </div>
                    <p className="mt-1 text-[11px] text-muted-foreground">{objective.responses} responses</p>
                  </div>
                ))}
              </div>
            </ChartPanel>

            <ChartPanel title="Feedback Sentiment" description="Positive, neutral, and negative sentiment distribution.">
              <ResponsiveContainer width="100%" height="100%">
                <PieChart>
                  <Pie
                    data={sentimentOverview}
                    dataKey="value"
                    nameKey="name"
                    innerRadius={62}
                    outerRadius={92}
                    paddingAngle={3}
                    label={({ name, value }) => `${name} ${value}%`}
                  >
                    {sentimentOverview.map((entry) => (
                      <Cell key={entry.name} fill={entry.name === "Positive" ? "#16a34a" : entry.name === "Neutral" ? "#f59e0b" : "#dc2626"} />
                    ))}
                  </Pie>
                  <Legend iconType="circle" />
                  <Tooltip formatter={(value: number) => `${value}%`} />
                </PieChart>
              </ResponsiveContainer>
            </ChartPanel>
          </div>

          <section className="rounded-xl border bg-surface p-4 shadow-xs">
            <div className="flex items-center gap-2 mb-3">
              <MessageSquareQuote className="h-4 w-4 text-primary" />
              <h3 className="text-sm font-bold text-foreground">Representative Student Comments</h3>
            </div>
            <div className="grid gap-4 md:grid-cols-3">
              {studentComments.map((item) => (
                <article key={item.comment} className="rounded-lg border bg-background p-3.5">
                  <p className="text-xs font-bold text-foreground">{item.sentiment}</p>
                  <p className="mt-1 text-xs text-muted-foreground italic">“{item.comment}”</p>
                </article>
              ))}
            </div>
          </section>
        </section>
      )}

      {/* Tab 4: LATE ARRIVAL PATTERNS TAB */}
      {activeTab === "late" && (
        <section className="space-y-4 pt-2">


          <div className="grid gap-6 xl:grid-cols-[1.15fr_0.85fr]">
            <ChartPanel title="Late Reasons Breakdown" description="Distribution of reasons for late arrivals.">
              <ResponsiveContainer width="100%" height="100%">
                <BarChart data={filteredLateReasons} margin={{ top: 8, right: 12, left: -10, bottom: 20 }}>
                  <CartesianGrid strokeDasharray="3 3" vertical={false} />
                  <XAxis 
                    dataKey="category" 
                    fontSize={11} 
                    tickLine={false} 
                    axisLine={false}
                    angle={-45}
                    textAnchor="end"
                    height={60}
                  />
                  <YAxis fontSize={12} tickLine={false} axisLine={false} />
                  <Tooltip cursor={{ fill: "var(--color-surface-muted)", opacity: 0.4 }} />
                  <Bar dataKey="count" name="Late arrivals" fill="#f59e0b" radius={[6, 6, 0, 0]} />
                </BarChart>
              </ResponsiveContainer>
            </ChartPanel>

            <div className="space-y-4">
              <article className="rounded-xl border bg-surface p-4 shadow-xs">
                <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wider">Top Late Reason</p>
                <p className="mt-1.5 text-xl font-bold text-foreground">{topLateReason.category}</p>
                <p className="mt-1 text-xs text-muted-foreground">{topLateReason.share}% of total late arrivals.</p>
              </article>
              <article className="rounded-xl border bg-surface p-4 shadow-xs">
                <h3 className="text-xs font-semibold text-muted-foreground uppercase tracking-wider mb-3">Late-arrival categories</h3>
                <div className="space-y-2.5">
                  {filteredLateReasons.length === 0 ? (
                    <p className="rounded-lg border bg-background p-3 text-xs text-muted-foreground">
                      No late-arrival records available yet.
                    </p>
                  ) : (
                    filteredLateReasons.map((reason: { category: string; share: number }) => (
                      <div key={reason.category} className="rounded-lg border bg-background p-3">
                        <div className="flex items-center justify-between gap-3 text-xs font-semibold">
                          <p className="text-foreground">{reason.category}</p>
                          <span className="text-foreground">{reason.share}%</span>
                        </div>
                        <div className="mt-1.5 h-1.5 overflow-hidden rounded-full bg-muted">
                          <div className="h-full rounded-full bg-amber-500" style={{ width: `${reason.share}%` }} />
                        </div>
                      </div>
                    ))
                  )}
                </div>
              </article>
              {customLateReasons.length > 0 && (
                <article className="rounded-xl border bg-surface p-4 shadow-xs">
                  <h3 className="text-xs font-semibold text-muted-foreground uppercase tracking-wider mb-3">Recent Custom Reasons</h3>
                  <div className="space-y-2 max-h-[300px] overflow-y-auto plpass-modern-scrollbar pr-1">
                    {customLateReasons.map((reason, index) => (
                      <div key={index} className="rounded-lg border bg-background p-3">
                        <div className="flex justify-between items-start gap-2 mb-1">
                          <span className="text-[10px] font-semibold text-muted-foreground uppercase tracking-wide px-2 py-0.5 rounded-full bg-surface-muted/50 border">
                            {reason.category}
                          </span>
                          <span className="text-[10px] text-muted-foreground">
                            {new Date(reason.date).toLocaleDateString(undefined, { month: 'short', day: 'numeric' })}
                          </span>
                        </div>
                        <p className="text-sm text-foreground mt-1.5">{reason.text}</p>
                      </div>
                    ))}
                  </div>
                </article>
              )}
            </div>
          </div>
        </section>
      )}

      {/* Unified Export Modal Portal */}
      <AnalyticsExportModal
        isOpen={isExportModalOpen}
        onClose={() => setIsExportModalOpen(false)}
        events={eventData}
        activeEventFilter={eventFilter}
        onExport={handleExportReport}
      />
    </div>
  );
}
