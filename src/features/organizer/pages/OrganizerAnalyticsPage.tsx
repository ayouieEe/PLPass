/* eslint-disable @typescript-eslint/no-unused-vars */
import { useEffect, useMemo, useState } from "react";
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
import { PageHeader } from "@/components/shared/PageHeader";
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
import { exportReportPdf, exportReportXlsx, type ReportExportSection, type ReportSummaryCard, type ReportInsightsNarrative, type ReportChartItem } from "@/lib/exports/reportExport";
import { generateBarChartPng, generateDonutChartPng, generateLineChartPng } from "@/lib/exports/chartGenerator";
import { ActiveSessionHeader } from "@/features/attendance/ActiveSessionHeader";
import { LatestTapResultCard } from "@/features/attendance/LatestTapResultCard";
import { LiveAttendanceList } from "@/features/attendance/LiveAttendanceList";
import { ManualLookupPanel } from "@/features/attendance/ManualLookupPanel";
import { QRFallbackPanel } from "@/features/attendance/QRFallbackPanel";
import { SessionSummaryCards } from "@/features/attendance/SessionSummaryCards";
import type { LiveAttendanceRecord } from "@/features/attendance/types";
import { useDevelopmentSession } from "@/hooks/useDevelopmentSession";
import { useAttendanceSummaries } from "@/features/organizer/hooks/useEventAttendance";
import { summarizeUniqueAttendance } from "@/features/organizer/utils/attendanceSummary";
import {
  useAcademicCatalog,
  useAttendanceRecords,
  useAttendanceSubmissionMutations,
  useAttendanceSession,
  useAttendanceSessionMutations,
  useAttendanceSessions,
  useCorrectionRequests,
  useEvent,
  useEvents,
  useMlPredictions,
  useNfcTapAttempts,
  useOrganizerProfiles,
  useAuditLogMutations,
  useAllEventObjectives,
  useAllEventSummarySnapshots,
  useAllEventFeedback
} from "@/hooks/useRepositoryQueries";
import { useModelInsights } from "@/hooks/useMlApi";
import { useAutomaticForecasts } from "@/features/organizer/hooks/useAutomaticForecasts";
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

function useOrganizerScope(): OrganizerScope {
  const { session } = useDevelopmentSession();
  const context = useMemo(
    () => (session ? { actorUserId: session.userId, actorRole: session.role, departmentId: session.departmentId } : undefined),
    [session]
  );
  const organizerQuery = useOrganizerProfiles({ pageSize: 1 }, context);
  const isAdmin = session?.role === "admin";
  return {
    context: context ?? { actorUserId: "", actorRole: "organizer" },
    organizerId: organizerQuery.data?.items[0]?.id ?? (isAdmin ? "admin-global" : undefined),
    organizerName: session?.displayName ?? "Organizer",
    isLoading: organizerQuery.isLoading,
    isError: !isAdmin && organizerQuery.isError
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

function shortenLabel(text: string | undefined, maxLength: number = 12): string {
  if (!text) return "";
  if (text.length <= maxLength) return text;
  return `${text.slice(0, maxLength - 1)}…`;
}

function ChartPanel({
  title,
  description,
  action,
  empty,
  emptyMessage = "No feedback data yet",
  children
}: {
  title: string;
  description: string;
  action?: React.ReactNode;
  empty?: boolean;
  emptyMessage?: string;
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
      <div className={`mt-5 h-72 w-full ${empty ? "flex items-center justify-center" : ""}`}>
        {empty ? (
          <EmptyState
            title="No feedback data yet"
            description={emptyMessage}
            icon={MessageSquareQuote}
          />
        ) : (
          children
        )}
      </div>
    </section>
  );
}

function AnalyticsExportModal({
  isOpen,
  onClose,
  onExport
}: {
  isOpen: boolean;
  onClose: () => void;
  onExport: (request: { reportType: "master" | "attendance" | "prediction" | "sentiment" | "late"; format: "xlsx" | "pdf" }) => void;
}) {
  const [reportType, setReportType] = useState<"master" | "attendance" | "prediction" | "sentiment" | "late">("master");
  const [exportFormat, setExportFormat] = useState<"xlsx" | "pdf">("xlsx");

  if (!isOpen) return null;

  function handleExportSubmit() {
    onExport({ reportType, format: exportFormat });
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
              <p className="text-xs text-slate-500 font-medium">Select a report type and format. Export uses the current page filters.</p>
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

          {/* Step 2: Download Format Selection */}
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
                  <p className="text-[10px] text-slate-500 font-normal">Excel workbook format</p>
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
              "Current page-filtered results"
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
  const [dateRangePreset, setDateRangePreset] = useState<"all" | "7d" | "30d" | "this_month" | "90d" | "custom">("all");
  const [startDate, setStartDate] = useState("");
  const [endDate, setEndDate] = useState("");
  const [predictionPage, setPredictionPage] = useState(0);
  const [attendancePage, setAttendancePage] = useState(0);
  const [latePage, setLatePage] = useState(0);
  const [isExportModalOpen, setIsExportModalOpen] = useState(false);
  const [selectedPdpFeature, setSelectedPdpFeature] = useState<string>("");
  const handleStartDateChange = (nextStartDate: string) => {
    setStartDate(nextStartDate);
    if (nextStartDate && endDate && endDate < nextStartDate) {
      setEndDate("");
    }
    setPredictionPage(0);
    setAttendancePage(0);
    setLatePage(0);
  };
  const { session } = useDevelopmentSession();
  const isAdmin = session?.role === "admin";
  const isDepartmentAdmin = session?.role === "department_admin";
  const scope = useOrganizerScope();
  const auditLogMutations = useAuditLogMutations(scope.context);
  const eventsQuery = useEvents({ pageSize: 200 }, scope.context);
  const automaticForecasts = useAutomaticForecasts(eventsQuery.data?.items ?? [], scope.context, session?.role === "organizer");
  const sessionsQuery = useAttendanceSessions({ pageSize: 500 }, scope.context);
  const attendanceRecordsQuery = useAttendanceRecords({ pageSize: 1000 }, scope.context);
  const organizerAttendanceEventIds = useMemo(
    () => (eventsQuery.data?.items ?? []).map((event) => event.id),
    [eventsQuery.data?.items]
  );
  const organizerAttendanceSummariesQuery = useAttendanceSummaries(organizerAttendanceEventIds);
  const objectivesQuery = useAllEventObjectives({ pageIndex: 0, pageSize: 1000 }, scope.context);
  const summariesQuery = useAllEventSummarySnapshots({ pageIndex: 0, pageSize: 200 }, scope.context);
  const feedbackQuery = useAllEventFeedback({ pageIndex: 0, pageSize: 1000 }, scope.context);

  const effectiveDateBounds = useMemo(() => {
    if (dateRangePreset === "all") return { start: null, end: null };
    const now = new Date();
    if (dateRangePreset === "7d") {
      const start = new Date(now);
      start.setDate(now.getDate() - 7);
      return { start: start.toISOString().slice(0, 10), end: now.toISOString().slice(0, 10) };
    }
    if (dateRangePreset === "30d") {
      const start = new Date(now);
      start.setDate(now.getDate() - 30);
      return { start: start.toISOString().slice(0, 10), end: now.toISOString().slice(0, 10) };
    }
    if (dateRangePreset === "this_month") {
      const start = new Date(now.getFullYear(), now.getMonth(), 1);
      return { start: start.toISOString().slice(0, 10), end: now.toISOString().slice(0, 10) };
    }
    if (dateRangePreset === "90d") {
      const start = new Date(now);
      start.setDate(now.getDate() - 90);
      return { start: start.toISOString().slice(0, 10), end: now.toISOString().slice(0, 10) };
    }
    if (dateRangePreset === "custom") {
      return { start: startDate || null, end: endDate || null };
    }
    return { start: null, end: null };
  }, [dateRangePreset, startDate, endDate]);

  const eventData = useMemo(
    () =>
      (eventsQuery.data?.items ?? [])
        .filter((event) => {
          if (isDepartmentAdmin) {
            return event.departmentId === (session as { departmentId?: string })?.departmentId;
          }
          return true;
        })
        .map((event) => ({
          id: event.id,
          organizerId: event.organizerId,
          code: event.code,
          title: event.title,
          category: event.category,
          venue: event.venue,
          date: dateKey(event.startsAt),
          startsAt: event.startsAt,
          time: `${new Date(event.startsAt).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" })} - ${new Date(event.endsAt).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" })}`,
          predictedTurnout: event.predictedTurnout,
          status: event.status
        })),
    [eventsQuery.data?.items, isDepartmentAdmin, session]
  );

  const filteredEventData = useMemo(() => {
    return eventData.filter((event) => {
      const matchesEvent = eventFilter === "all" || event.code === eventFilter;
      if (!matchesEvent) return false;
      if (effectiveDateBounds.start && event.date < effectiveDateBounds.start) return false;
      if (effectiveDateBounds.end && event.date > effectiveDateBounds.end) return false;
      return true;
    });
  }, [eventData, eventFilter, effectiveDateBounds]);

  const sessionSummaryData = useMemo(
    () => {
      const eventById = new Map(eventData.map((event) => [event.id, event]));
      return (sessionsQuery.data?.items ?? [])
        .filter((session) => session.type === "event" && session.status === "completed" && session.eventId && eventById.has(session.eventId))
        .map((session) => {
          const event = eventById.get(session.eventId ?? "");
        const records = (attendanceRecordsQuery.data?.items ?? []).filter((record) => record.sessionId === session.id);
        const walkInRows = (organizerAttendanceSummariesQuery.data?.[session.eventId ?? ""]?.rows ?? [])
          .filter((row) => row.sessionId === session.id && row.verificationLabel === "Unverified walk-in");
        const summary = summarizeUniqueAttendance([
          ...records.map((record) => ({ identity: record.studentId, attendanceStatus: record.status })),
          ...walkInRows.map((row) => ({ identity: row.studentId, attendanceStatus: row.attendanceStatus }))
        ], 0);
        return { eventCode: event?.code ?? session.title, eventId: session.eventId, date: dateKey(session.startsAt), present: summary.present, late: summary.late, absent: summary.absent, totalRegistered: summary.population, attendanceRate: summary.attendanceRate };
      });
    },
    [attendanceRecordsQuery.data?.items, eventData, organizerAttendanceSummariesQuery.data, sessionsQuery.data?.items]
  );

  const filteredSessionSummaryData = useMemo(() => {
    return sessionSummaryData.filter((row) => {
      const matchesEvent = eventFilter === "all" || row.eventCode === eventFilter;
      if (!matchesEvent) return false;
      if (effectiveDateBounds.start && row.date < effectiveDateBounds.start) return false;
      if (effectiveDateBounds.end && row.date > effectiveDateBounds.end) return false;
      return true;
    });
  }, [sessionSummaryData, eventFilter, effectiveDateBounds]);

  const eventLookup = useMemo(() => new Map(eventData.map((event) => [event.code, event])), [eventData]);

  const trendData = useMemo(() => {
    return filteredSessionSummaryData.map((row) => ({
      label: row.eventCode,
      attendanceRate: row.attendanceRate,
      date: row.date,
      present: row.present,
      late: row.late,
      absent: row.absent,
      totalRegistered: row.totalRegistered
    }));
  }, [filteredSessionSummaryData]);

  const totalAttendancePages = Math.ceil(trendData.length / 10);
  const paginatedTrendData = useMemo(() => {
    return trendData.slice(attendancePage * 10, (attendancePage + 1) * 10);
  }, [trendData, attendancePage]);

  const predictionOverviewData = useMemo(() => {
    return filteredEventData
      .filter((event) => event.status !== "rejected" && event.status !== "cancelled" && event.status !== "completed")
      .map((event) => ({
        label: event.code,
        title: event.title,
        date: event.date,
        predictedAttend: event.predictedTurnout,
        predictedMiss: event.predictedTurnout == null ? null : 100 - event.predictedTurnout
      }));
  }, [filteredEventData]);

  const totalPredictionPages = Math.ceil(predictionOverviewData.length / 10);
  const paginatedPredictionData = useMemo(() => {
    return predictionOverviewData.slice(predictionPage * 10, (predictionPage + 1) * 10);
  }, [predictionOverviewData, predictionPage]);

  const filteredSentimentSummaries = useMemo(() => {
    const validEventIds = new Set(filteredEventData.map((e) => e.id));
    return (summariesQuery.data?.items ?? []).filter((row) => validEventIds.has(row.eventId));
  }, [filteredEventData, summariesQuery.data?.items]);

  const sentimentOverview = useMemo(() => {
    const filteredSummaries = filteredSentimentSummaries;
    
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
  }, [filteredSentimentSummaries]);

  const filteredLateReasons = useMemo(() => {
    const validEventIds = new Set(filteredEventData.map((e) => e.id));
    const sessionIds = new Set(
      (sessionsQuery.data?.items ?? [])
        .filter((session) => session.eventId && validEventIds.has(session.eventId))
        .map((session) => session.id)
    );
    const lateRows = (attendanceRecordsQuery.data?.items ?? []).filter(
      (row) => (sessionIds.size === 0 || sessionIds.has(row.sessionId)) && row.status === "late"
    );

    const categories = [
      { key: "traffic", label: "Traffic / Commute" },
      { key: "class", label: "Class / Academic Conflict" },
      { key: "personal", label: "Personal / Health" },
      { key: "weather", label: "Weather / Force Majeure" },
      { key: "other", label: "Other" }
    ];

    function matchCategory(reasonStr: string | undefined) {
      if (!reasonStr) return "other";
      const l = reasonStr.toLowerCase();
      if (l.includes("traffic") || l.includes("commute")) return "traffic";
      if (l.includes("class") || l.includes("academic")) return "class";
      if (l.includes("personal") || l.includes("health")) return "personal";
      if (l.includes("weather") || l.includes("force")) return "weather";
      return "other";
    }

    const countMap: Record<string, number> = { traffic: 0, class: 0, personal: 0, weather: 0, other: 0 };
    lateRows.forEach((row) => {
      const catKey = matchCategory(row.lateReason || row.lateReasonCategory);
      countMap[catKey] = (countMap[catKey] || 0) + 1;
    });
    if (lateRows.length === 0) return [];

    const totalLate = Object.values(countMap).reduce((a, b) => a + b, 0);

    return categories.map((cat) => {
      const count = countMap[cat.key] || 0;
      return {
        category: cat.label,
        count: count,
        share: totalLate > 0 ? Math.round((count / totalLate) * 100) : 0
      };
    });
  }, [attendanceRecordsQuery.data?.items, filteredEventData, sessionsQuery.data?.items]);

  const totalLatePages = Math.ceil(filteredLateReasons.length / 10);
  const paginatedLateReasons = useMemo(() => {
    return filteredLateReasons.slice(latePage * 10, (latePage + 1) * 10);
  }, [filteredLateReasons, latePage]);

  const customLateReasons = useMemo(() => {
    const validEventIds = new Set(filteredEventData.map((e) => e.id));
    const sessionIds = new Set(
      (sessionsQuery.data?.items ?? [])
        .filter((session) => session.eventId && validEventIds.has(session.eventId))
        .map((session) => session.id)
    );
    const lateRows = (attendanceRecordsQuery.data?.items ?? []).filter((row) => sessionIds.has(row.sessionId) && row.status === "late");
    
    return lateRows
      .filter((row) => row.lateReason && row.lateReason !== row.lateReasonCategory && !(lateReasons as string[]).includes(row.lateReason))
      .map((row) => ({
        text: row.lateReason as string,
        category: row.lateReasonCategory || "Other",
        date: row.recordedAt
      }))
      .sort((a, b) => new Date(b.date).getTime() - new Date(a.date).getTime())
      .slice(0, 10);
  }, [attendanceRecordsQuery.data?.items, filteredEventData, sessionsQuery.data?.items]);

  const insightsQuery = useModelInsights();
  const insightsData = insightsQuery.data;
  const selectedForecastEvent = eventFilter === "all"
    ? filteredEventData.find((event) => event.predictedTurnout != null)
    : eventLookup.get(eventFilter);
  const isPredicting = automaticForecasts.status === "running";

  useEffect(() => {
    if (automaticForecasts.completedRun > 0) void insightsQuery.refetch();
  }, [automaticForecasts.completedRun, insightsQuery]);

  const selectedPrediction = useMemo(() => {
    return selectedForecastEvent?.predictedTurnout ?? null;
  }, [selectedForecastEvent]);

  const topLateReason = useMemo(() => {
    const reasons = filteredLateReasons;
    const hasData = reasons.some((r) => r.count > 0);
    return hasData
      ? reasons.reduce((max, r) => (r.share > max.share ? r : max))
      : { category: "No late records", count: 0, share: 0 };
  }, [filteredLateReasons]);

  const activePdpFeature = useMemo(() => {
    const features = insightsData?.partial_dependence ? Object.keys(insightsData.partial_dependence) : [];
    if (features.length === 0) return "";
    return selectedPdpFeature && features.includes(selectedPdpFeature) ? selectedPdpFeature : features[0];
  }, [insightsData, selectedPdpFeature]);

  const pdpData = useMemo(() => {
    const pd = insightsData?.partial_dependence;
    if (!pd || !pd[activePdpFeature]) return null;
    const data = pd[activePdpFeature] as { grid_values?: number[]; average?: number[] };
    const { grid_values, average } = data;
    if (!grid_values || !average) return null;
    return grid_values.map((val: number, i: number) => ({
      value: typeof val === "number" ? (val % 1 === 0 ? val : Number(val.toFixed(2))) : val,
      probability: Math.round(average[i] * 100)
    }));
  }, [insightsData, activePdpFeature]);

  const predictionFactors = useMemo(() => {
    if (!insightsData?.feature_importance?.length) return [];
    const positiveImportance = insightsData.feature_importance.filter((factor) => factor.importance_mean > 0).slice(0, 5);
    if (positiveImportance.length > 0) {
      const maxImp = Math.max(...positiveImportance.map(f => f.importance_mean));
      
      const getFeatureExplanation = (featureId: string) => {
        switch (featureId) {
          case 'rolling_participation_rate': return { name: "Recent Attendance Rate", detail: "Measures a student's recent historical attendance.", insight: "High historical attendance often reliably predicts future attendance." };
          case 'tardiness_frequency': return { name: "History of Being Late", detail: "How often a student has been late to past events.", insight: "Frequent past tardiness strongly correlates with overall lower on-time turnout." };
          case 'participation_trend_slope': return { name: "Attendance Trend", detail: "Indicates whether a student's attendance is improving or declining over time.", insight: "A negative slope acts as an early warning for potential absences." };
          case 'consecutive_missed_events': return { name: "Consecutive Absences", detail: "The number of events missed in a row.", insight: "Students missing multiple events sequentially have a high risk of being absent again." };
          case 'has_rolling_rate': return { name: "Has Attendance History", detail: "Indicates whether sufficient historical data exists for this student.", insight: "Newer students with no history are generally harder to predict accurately." };
          case 'has_tardiness_history': return { name: "Has Lateness History", detail: "Indicates whether sufficient historical data exists for this student.", insight: "Newer students with no history are generally harder to predict accurately." };
          case 'has_trend': return { name: "Has Trend History", detail: "Indicates whether sufficient historical data exists for this student.", insight: "Newer students with no history are generally harder to predict accurately." };
          case 'was_ever_late': return { name: "Past Lateness Record", detail: "Whether the student has ever been recorded as late.", insight: "Any history of lateness slightly increases the chance of future tardiness or absences." };
          case 'duration_hours': return { name: "Event Duration", detail: "The scheduled length of the event.", insight: "Longer events typically see lower turnout or higher late arrival rates." };
          case 'lead_time_days': return { name: "Days Announced in Advance", detail: "How far in advance the event was announced.", insight: "Extremely short or very long lead times often reduce the likelihood of attendance." };
          case 'predominant_late_reason': return { name: "Common Reason for Being Late", detail: "The most frequent excuse given by the student for arriving late.", insight: "Recurring specific reasons (like transportation) can highlight systemic barriers to attendance." };
          case 'event_category': return { name: "Event Category", detail: "The type or category of the event.", insight: "Certain categories naturally draw higher voluntary attendance than others." };
          case 'mandatory_voluntary': return { name: "Required vs Voluntary", detail: "Whether the event is required.", insight: "Mandatory events obviously drive attendance, but voluntary events rely heavily on interest." };
          case 'day_of_week': return { name: "Day of the Week", detail: "The day the event is held.", insight: "Mid-week events often see more consistent turnout compared to Mondays or Fridays." };
          case 'time_of_day_bucket': return { name: "Time of Day", detail: "The time block when the event takes place.", insight: "Early morning or late afternoon events typically face lower turnout rates." };
          case 'venue': return { name: "Event Venue", detail: "The location of the event.", insight: "Distant or difficult-to-access venues can significantly reduce participant turnout." };
          case 'target_group_size_tier': return { name: "Target Audience Size", detail: "The size classification of the target audience.", insight: "Larger target groups often suffer from the bystander effect, reducing individual attendance rates." };
          default: {
            const defaultName = featureId.split('_').map(w => w.charAt(0).toUpperCase() + w.slice(1)).join(' ');
            return { name: defaultName, detail: "Relative feature importance from the model evaluation dataset; not a causal effect.", insight: "This is a model-level association, not a guarantee that changing this factor will change attendance." };
          }
        }
      };

      return positiveImportance.map(f => {
        const actionableFeatures = ['time', 'category', 'venue', 'duration', 'day'];
        const isActionable = actionableFeatures.some(key => f.feature.toLowerCase().includes(key));
        const explanation = getFeatureExplanation(f.feature);
        
        return {
          id: f.feature,
          name: explanation.name,
          strength: Math.round((f.importance_mean / maxImp) * 100),
          detail: explanation.detail,
          type: isActionable ? "actionable" : "inherent",
          insight: explanation.insight
        };
      });
    }
    return [];
  }, [insightsData]);

  async function handleExportReport(request: { reportType: "master" | "attendance" | "prediction" | "sentiment" | "late"; format: "xlsx" | "pdf" }) {
    const selectedEvent = eventFilter === "all" ? undefined : eventLookup.get(eventFilter);
    const selectedEvents = filteredEventData;
    const selectedIds = new Set(selectedEvents.map((event) => event.id));
    const selectedSummaries = filteredSessionSummaryData;
    const eventLookupForId = (events: typeof eventData, eventId: string) => events.find((event) => event.id === eventId)?.code ?? eventId;
    const reportNames = { master: "PLPass Master Analytics Report", attendance: "PLPass Attendance Summary Report", prediction: "PLPass Turnout Prediction Report", sentiment: "PLPass Performance and Sentiment Report", late: "PLPass Late Arrival Patterns Report" };
    const attendanceRows = selectedSummaries.map((row) => ({ "Event Code": row.eventCode, "Event Date": row.date, "Attendance Rate": `${row.attendanceRate}%`, Present: row.present, Late: row.late, Absent: row.absent, Registered: row.totalRegistered }));
    const predictionRows = selectedEvents.map((event) => ({ "Event Code": event.code, "Event Title": event.title, "Event Date": event.date, "Predicted Attendance": event.predictedTurnout == null ? "Not available" : `${event.predictedTurnout}%`, "Predicted Absences": event.predictedTurnout == null ? "Not available" : `${100 - event.predictedTurnout}%` }));
    const summaryRows = (summariesQuery.data?.items ?? []).filter((row) => Boolean(row.eventId) && selectedIds.has(row.eventId)).map((row) => ({ "Event Code": eventLookupForId(eventData, row.eventId ?? ""), Positive: `${row.positivePercentage ?? 0}%`, Neutral: `${row.neutralPercentage ?? 0}%`, Negative: `${row.negativePercentage ?? 0}%` }));
    const lateRows = selectedSummaries.map((row) => ({ "Event Code": row.eventCode, "Event Date": row.date, Late: row.late, "Late Rate": `${row.totalRegistered ? Math.round((row.late / row.totalRegistered) * 100) : 0}%` }));
    const sections: ReportExportSection[] = request.reportType === "master" ? [{ name: "Attendance Summary", rows: attendanceRows }, { name: "Turnout Prediction", rows: predictionRows }, { name: "Performance and Sentiment", rows: summaryRows }, { name: "Late Arrival Patterns", rows: lateRows }] : [{ name: reportNames[request.reportType].replace("PLPass ", "").replace(" Report", ""), rows: request.reportType === "attendance" ? attendanceRows : request.reportType === "prediction" ? predictionRows : request.reportType === "sentiment" ? summaryRows : lateRows }];
    const scope = selectedEvent ? { type: "event" as const, eventId: selectedEvent.id } : { type: "global" as const };
    const scopeSlug = selectedEvent ? selectedEvent.code : "all-events";
    const filters = { "Target Event": selectedEvent ? `${selectedEvent.code} — ${selectedEvent.title}` : "All Events", Category: "All Categories", "Time Horizon": dateRangePreset === "all" ? "All time" : dateRangePreset };

    // KPI Summary Cards
    const summaryCards: ReportSummaryCard[] = [
      { label: "Overall Attendance", value: overallAttendanceLabel, subtitle: "Average across completed sessions", colorTheme: "emerald" },
      { label: "Turnout Forecast", value: selectedPrediction == null ? "Not available" : `${selectedPrediction}%`, subtitle: isDepartmentAdmin ? "Saved event estimate only; live department inference is unavailable" : "Experimental model estimate for selected event participants", colorTheme: "blue" },
      { label: "Positive Sentiment", value: positiveSentimentLabel, subtitle: "Favorable feedback share", colorTheme: "amber" },
      { label: "Top Tardiness Cause", value: topLateReason.category, subtitle: topLateReason.count > 0 ? `${topLateReason.count} check-ins (${topLateReason.share}%)` : "No late check-ins", colorTheme: "purple" }
    ];

    // Report-specific Analytical Narrative & Recommendations
    let insightsNarrative: ReportInsightsNarrative;
    if (request.reportType === "master") {
      insightsNarrative = {
        title: "EXECUTIVE ANALYTICAL SUMMARY & INSIGHTS",
        executiveSummary: `This report summarizes recorded attendance, saved feedback summaries, available event forecasts, and late-arrival records for the selected scope. Average recorded attendance is ${overallAttendanceLabel}.`,
        keyFindings: [
          `Overall session attendance rate is ${overallAttendanceLabel}${selectedSummaries.length ? `; the highest selected session rate is ${Math.max(...selectedSummaries.map((s) => s.attendanceRate))}%.` : "; no completed session records are available."}`,
          `Saved forecast for the selected event: ${selectedPrediction == null ? "not available" : `${selectedPrediction}%`}.`,
          `Post-event student feedback reflects a ${positiveSentimentLabel} positive sentiment rate.`,
          `The primary root cause for check-in tardiness is '${topLateReason.category}', accounting for ${topLateReason.share}% of recorded late check-ins.`
        ],
        recommendations: ["Use recorded event-level metrics as a baseline and review event context before changing schedules or attendance procedures."]
      };
    } else if (request.reportType === "attendance") {
      insightsNarrative = {
        title: "ATTENDANCE TRENDS & TURN-OUT ANALYSIS",
        executiveSummary: `Recorded attendance rows across the selected completed sessions show an average attendance rate of ${overallAttendanceLabel}.`,
        keyFindings: [
          `Average attendance rate across monitored sessions: ${overallAttendanceLabel}.`,
          `Total present check-ins: ${selectedSummaries.reduce((acc, row) => acc + row.present, 0)} participants; Late check-ins: ${selectedSummaries.reduce((acc, row) => acc + row.late, 0)} participants.`,
          `The report includes ${selectedSummaries.length} completed session summary row(s).`
        ],
        recommendations: ["Compare these observed rates with event registration and schedule before making operational changes."]
      };
    } else if (request.reportType === "prediction") {
      insightsNarrative = {
        title: "TURNOUT FORECAST & ML DETERMINANT ANALYSIS",
        executiveSummary: `The experimental attendance model estimate for the selected event is ${selectedPrediction == null ? "not available" : `${selectedPrediction}%`}. Model-level feature importance is distinct from department-specific attendance data.`,
        keyFindings: [
          `Predicted turnout rate: ${selectedPrediction == null ? "not available" : `${selectedPrediction}%`}.`,
          ...(predictionFactors.length ? [`Top positive model features: ${predictionFactors.slice(0, 3).map((f) => f.name).join(", ")}.`] : []),
          `This forecast is an estimate and should not be interpreted as a causal effect.`
        ],
        recommendations: ["Treat the estimate as exploratory; validate it against observed attendance before making decisions."]
      };
    } else if (request.reportType === "sentiment") {
      insightsNarrative = {
        title: "FEEDBACK SENTIMENT & OBJECTIVE EVALUATION",
        executiveSummary: `Saved event feedback summaries indicate ${positiveSentimentLabel} positive sentiment. Objective ratings are shown only where submitted ratings exist.`,
        keyFindings: [
          `Feedback sentiment breakdown: ${positiveSentimentLabel} Positive, ${filteredSentimentSummaries.length ? `${sentimentOverview.find((s) => s.name === "Neutral")?.value ?? 0}%` : "N/A"} Neutral, ${filteredSentimentSummaries.length ? `${sentimentOverview.find((s) => s.name === "Negative")?.value ?? 0}%` : "N/A"} Negative.`,
          `Objective rating records available in this scope: ${objectivePerformance.length}.`
        ],
        recommendations: ["Review the underlying feedback and objective ratings before drawing qualitative conclusions."]
      };
    } else {
      insightsNarrative = {
        title: "LATE ARRIVAL PATTERNS & BOTTLENECK ANALYSIS",
        executiveSummary: `Analysis of tardiness logs indicates that late check-ins account for approximately ${selectedSummaries.length ? Math.round((selectedSummaries.reduce((s, row) => s + row.late, 0) / Math.max(selectedSummaries.reduce((s, row) => s + row.totalRegistered, 0), 1)) * 100) : 0}% of total registered participants. The primary driver is '${topLateReason.category}'.`,
        keyFindings: [
          `Leading tardiness cause: ${topLateReason.category} (${topLateReason.share}% of total late check-ins).`,
          `Category counts use recorded late-arrival reason fields for the selected events.`
        ],
        recommendations: ["Treat recorded reasons as discussion points; they do not establish a cause or remedy by themselves."]
      };
    }

    // Dynamic Visual Charts Generation
    const charts: ReportChartItem[] = [];

    if (request.reportType === "master" || request.reportType === "attendance") {
      const trendLabels = selectedSummaries.slice(0, 8).map((s) => s.eventCode);
      const trendRates = selectedSummaries.slice(0, 8).map((s) => s.attendanceRate);
      if (trendLabels.length > 0) {
        charts.push({
          title: "Attendance Rate Trend Across Sessions (%)",
          imageDataUrl: generateLineChartPng({
            title: "Attendance Trend (%)",
            labels: trendLabels,
            data: trendRates,
            unit: "%",
            color: "#0F766E",
            width: 580,
            height: 280
          }),
          caption: "Figure 1: Session attendance rate percentage trajectory across evaluated events.",
          description: "Tracks student participation rates across recent event sessions. Steady or upward trends indicate high event engagement, whereas sharp dips signal potential scheduling conflicts or suboptimal session timing.",
          recommendations: [
            "Schedule core workshops during peak engagement days (Tuesdays & Thursdays 9:00 AM - 11:00 AM).",
            "Dispatch automated SMS and Email check-in reminders 48 hours and 2 hours prior to scheduled sessions."
          ]
        });
      }
    }

    if (request.reportType === "master" || request.reportType === "prediction") {
      const predictionEvents = selectedEvents.filter((event) => event.predictedTurnout != null).slice(0, 8);
      const predCategories = predictionEvents.map((event) => event.code);
      const predSeries = predictionEvents.map((event) => event.predictedTurnout as number);
      if (predCategories.length > 0) {
        charts.push({
          title: "Saved Predicted Turnout by Event (%)",
          imageDataUrl: generateBarChartPng({
            title: "Forecasted Turnout (%)",
            categories: predCategories,
            series: [{ name: "Predicted Turnout %", data: predSeries, color: "#16A34A" }],
            unit: "%",
            maxValue: 100,
            width: 580,
            height: 280
          }),
          caption: "Figure 2: Saved event turnout estimates (events without a saved estimate are omitted).",
          description: "Values are read from the event predicted_turnout_percent field and are not observed attendance.",
          recommendations: ["Validate saved estimates against actual completed-session attendance before using them for planning."]
        });
      }
    }

    if ((request.reportType === "master" || request.reportType === "sentiment") && filteredSentimentSummaries.length > 0) {
      const pos = positiveSentimentShare ?? 0;
      const neu = sentimentOverview.find((s) => s.name === "Neutral")?.value ?? 0;
      const neg = sentimentOverview.find((s) => s.name === "Negative")?.value ?? 0;
      charts.push({
        title: "Student Feedback Sentiment Distribution",
        imageDataUrl: generateDonutChartPng({
          title: "Sentiment Breakdown",
          slices: [
            { label: "Positive", value: pos, color: "#16A34A" },
            { label: "Neutral", value: neu, color: "#64748B" },
            { label: "Negative", value: neg, color: "#DC2626" }
          ],
          centerText: `${pos}%`,
          centerSubtext: "Positive",
          width: 520,
          height: 270
        }),
        caption: "Figure 3: Distribution of student feedback sentiment labels.",
          description: "Summary percentages are read from saved event feedback summary rows. They are descriptive and do not identify the cause of sentiment.",
          recommendations: ["Review the underlying event comments and ratings before making qualitative conclusions."]
      });
    }

    if ((request.reportType === "master" || request.reportType === "late") && filteredLateReasons.length > 0) {
      const lateCategories = filteredLateReasons.map((r) => r.category.split(" ")[0]);
      const lateShares = filteredLateReasons.map((r) => r.share);
      charts.push({
        title: "Primary Causes for Late Arrival (% Share)",
        imageDataUrl: generateBarChartPng({
          title: "Late Arrival Causes",
          categories: lateCategories,
          series: [{ name: "Share %", data: lateShares, color: "#D97706" }],
          unit: "%",
          maxValue: 100,
          width: 580,
          height: 270
        }),
        caption: "Figure 4: Breakdown of reported tardiness reasons among participants.",
          description: "Categories are derived from late-reason fields on recorded late attendance rows; this distribution alone does not establish root causes.",
          recommendations: ["Use recorded reasons as discussion points, not proof of a cause or remedy."]
      });
    }

    try {
      const options = {
        title: reportNames[request.reportType],
        sections,
        fileName: `plpass-${request.reportType}-analytics-${scopeSlug}-${new Date().toISOString().slice(0, 10)}`,
        scope,
        filters,
        summaryCards,
        insightsNarrative,
        charts
      };

      if (request.format === "xlsx") await exportReportXlsx(options);
      else await exportReportPdf(options);

      toast.success(`${reportNames[request.reportType]} downloaded.`);
      await auditLogMutations.logActionMutation.mutateAsync({
        action: "Exported Analytics",
        targetType: "export_action",
        metadata: { reportType: request.reportType, format: request.format, ...filters }
      });
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Unable to generate this report.");
    }
  }

  const objectivePerformance = useMemo(() => {
    const sourceObjectives = objectivesQuery.data?.items ?? [];
    const validEventIds = new Set(filteredEventData.map((e) => e.id));
    const filteredObjectives = sourceObjectives.filter((obj) => validEventIds.has(obj.eventId));
    
    const grouped = new Map<string, { totalScore: number; count: number }>();
    filteredObjectives.forEach((obj) => {
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
  }, [filteredEventData, objectivesQuery.data?.items]);

  const overallAverageRating = useMemo(() => {
    const sourceObjectives = objectivesQuery.data?.items ?? [];
    const validEventIds = new Set(filteredEventData.map((e) => e.id));
    const filteredObjectives = sourceObjectives.filter((obj) => validEventIds.has(obj.eventId));
    
    let totalScore = 0;
    let count = 0;
    filteredObjectives.forEach((obj) => {
      if (obj.averageRating != null && obj.averageRating > 0) {
        totalScore += obj.averageRating;
        count++;
      }
    });
    
    return count > 0 ? (totalScore / count).toFixed(1) : null;
  }, [filteredEventData, objectivesQuery.data?.items]);

  const studentComments = useMemo(() => {
    const sourceFeedback = feedbackQuery.data?.items ?? [];
    const validEventIds = new Set(filteredEventData.map((e) => e.id));
    const filteredFeedback = sourceFeedback.filter((fb) => validEventIds.has(fb.eventId));
    
    return filteredFeedback
      .filter((fb) => fb.comment && fb.comment.trim().length > 0)
      .map((fb) => ({
        sentiment: fb.sentimentLabel || "Neutral",
        comment: fb.comment || ""
      }))
      .slice(0, 10);
  }, [filteredEventData, feedbackQuery.data?.items]);

  const overallAttendanceRate = useMemo<number | null>(() => {
    if (trendData.length === 0) return null;
    return Math.round(trendData.reduce((acc: number, row: { attendanceRate?: number }) => acc + (row.attendanceRate ?? 0), 0) / trendData.length);
  }, [trendData]);

  const overallAttendanceLabel = overallAttendanceRate == null ? "N/A" : `${overallAttendanceRate}%`;
  const positiveSentimentShare = useMemo<number | null>(() => {
    if (filteredSentimentSummaries.length === 0) return null;
    const posObj = sentimentOverview.find(s => s.name === "Positive");
    return posObj?.value ?? null;
  }, [filteredSentimentSummaries.length, sentimentOverview]);
  const positiveSentimentLabel = positiveSentimentShare == null ? "N/A" : `${positiveSentimentShare}%`;

  const tabs: Array<{ id: ActiveTab; label: string; icon: typeof BarChart3 }> = [
    { id: "prediction", label: "Turnout Forecast", icon: Sparkles },
    { id: "attendance", label: "Attendance Trends", icon: TrendingUp },
    { id: "sentiment", label: "Feedback & Sentiment", icon: MessageSquareQuote },
    { id: "late", label: "Late Arrival Patterns", icon: Clock3 }
  ];

  return (
    <div className="analytics-page space-y-6 pb-12">
      <PageHeader
        title="Analytics Insights"
        description={isAdmin ? "Review institution-wide attendance trends, turnout forecasts, and feedback sentiment." : isDepartmentAdmin ? "Review attendance trends, turnout forecasts, and feedback sentiment for your department’s events." : "Monitor attendance trends, turnout forecasts, and feedback sentiment across your events."}
        actions={
          <>
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
          </>
        }
      />

      {/* Analytics Summary KPI Bar */}
      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
        <article className="rounded-xl border border-slate-200/80 bg-white p-4 shadow-xs transition hover:shadow-md">
          <div className="flex items-center justify-between">
            <p className="text-xs font-semibold text-slate-500 uppercase tracking-wider">Overall Attendance</p>
            <div className="p-2 rounded-lg bg-blue-50 text-blue-600">
              <TrendingUp className="h-4 w-4" />
            </div>
          </div>
          <p className="mt-2 text-2xl font-bold text-slate-900">{overallAttendanceLabel}</p>
          <p className="mt-1 text-[11px] text-slate-500 font-medium">Average across filtered sessions</p>
        </article>

        <article className="rounded-xl border border-slate-200/80 bg-white p-4 shadow-xs transition hover:shadow-md">
          <div className="flex items-center justify-between">
            <p className="text-xs font-semibold text-slate-500 uppercase tracking-wider">Turnout Forecast</p>
            <div className="p-2 rounded-lg bg-emerald-50 text-emerald-600">
              {isPredicting ? <span className="animate-spin h-4 w-4 block rounded-full border-2 border-emerald-600 border-t-transparent" /> : <Sparkles className="h-4 w-4" />}
            </div>
          </div>
          <p className="mt-2 text-2xl font-bold text-slate-900">{isPredicting ? "…" : selectedPrediction == null ? "N/A" : `${selectedPrediction}%`}</p>
          <p className="mt-1 text-[11px] text-slate-500 font-medium">{isPredicting ? "Calculating for registered event participants…" : isDepartmentAdmin ? "Saved event estimate only; live department inference unavailable" : "Experimental model estimate; N/A means unavailable"}</p>
        </article>

        <article className="rounded-xl border border-slate-200/80 bg-white p-4 shadow-xs transition hover:shadow-md">
          <div className="flex items-center justify-between">
            <p className="text-xs font-semibold text-slate-500 uppercase tracking-wider">Positive Sentiment</p>
            <div className="p-2 rounded-lg bg-amber-50 text-amber-600">
              <MessageSquareQuote className="h-4 w-4" />
            </div>
          </div>
          <p className="mt-2 text-2xl font-bold text-slate-900">{positiveSentimentLabel}</p>
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
          <p className="mt-1 text-[11px] text-slate-500 font-medium">
            {topLateReason.count > 0 ? `${topLateReason.count} check-ins (${topLateReason.share}%)` : "No late arrivals recorded"}
          </p>
        </article>
      </div>

      <details className="rounded-xl border border-slate-200/80 bg-white px-4 py-3 text-sm text-slate-600 shadow-xs">
        <summary className="cursor-pointer font-semibold text-slate-800">Where these analytics come from</summary>
        <div className="mt-3 space-y-2 text-xs leading-relaxed">
          <p><strong>Attendance:</strong> These numbers come directly from real check-ins at past events.</p>
          <p><strong>Sentiment:</strong> This tells you how people felt, based on the feedback they left after an event.</p>
          <p><strong>Turnout Estimate:</strong> {isDepartmentAdmin ? "We show a saved estimate of how many people might attend. Live predictions are turned off for specific departments." : "We look at past trends to guess how many people might attend. Remember, this is just a helpful estimate and not a guarantee!"}</p>
        </div>
      </details>

      {/* Analytics navigation tabs */}
      <div className="sticky top-0 z-20 rounded-2xl border border-slate-200/80 bg-white/95 p-4 shadow-md backdrop-blur-md">
        <div className="flex w-full items-center gap-3 flex-wrap">
          <nav className="grid w-full grid-cols-1 gap-1.5 sm:grid-cols-2 xl:grid-cols-4" aria-label="Analytics Navigation Tabs">
            {tabs.map((tab) => {
              const TabIcon = tab.icon;
              const isActive = activeTab === tab.id;
              return (
                <button
                  key={tab.id}
                  type="button"
                  onClick={() => setActiveTab(tab.id)}
                  className={`inline-flex w-full items-center justify-center gap-2 rounded-xl px-3.5 py-2 text-xs font-bold transition-all whitespace-nowrap ${
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

        </div>
      </div>

      {/* Analytics filters */}
      <div className="rounded-2xl border border-slate-200/80 bg-white p-4 shadow-sm">
          <div className="grid w-full gap-3 sm:grid-cols-2 xl:grid-cols-4">
            {/* Event Filter */}
            <div className="flex w-full items-center gap-1.5">
              <span className="text-xs font-semibold text-slate-500 flex items-center gap-1">
                <Filter className="h-3.5 w-3.5 text-primary" />
                Event:
              </span>
              <select
                aria-label="Event filter"
                className="h-8 min-w-0 flex-1 rounded-lg border border-slate-200 bg-slate-50/80 px-2.5 text-xs font-semibold text-slate-800 outline-none focus:border-primary focus:bg-white focus:ring-2 focus:ring-primary/20 transition"
                value={eventFilter}
                onChange={(event) => {
                  setEventFilter(event.target.value);
                  setPredictionPage(0);
                  setAttendancePage(0);
                  setLatePage(0);
                }}
              >
                <option value="all">All events</option>
                {eventData.map((event) => (
                  <option key={event.code} value={event.code}>
                    {event.code} - {event.title}
                  </option>
                ))}
              </select>
            </div>

            {/* Date Range Preset Selector */}
            <div className="flex w-full items-center gap-1.5">
              <span className="text-xs font-semibold text-slate-500 flex items-center gap-1">
                <CalendarCheck className="h-3.5 w-3.5 text-primary" />
                Date Range:
              </span>
              <select
                aria-label="Date range filter"
                className="h-8 min-w-0 flex-1 rounded-lg border border-slate-200 bg-slate-50/80 px-2.5 text-xs font-semibold text-slate-800 outline-none focus:border-primary focus:bg-white focus:ring-2 focus:ring-primary/20 transition"
                value={dateRangePreset}
                onChange={(e) => {
                  setDateRangePreset(e.target.value as typeof dateRangePreset);
                  setPredictionPage(0);
                  setAttendancePage(0);
                  setLatePage(0);
                }}
              >
                <option value="all">All Time</option>
                <option value="7d">Last 7 Days</option>
                <option value="30d">Last 30 Days</option>
                <option value="this_month">This Month</option>
                <option value="90d">Last 90 Days</option>
                <option value="custom">Custom Range</option>
              </select>
            </div>

            {/* Custom Date Inputs */}
            {dateRangePreset === "custom" && (
              <div className="flex w-full items-center gap-1.5 xl:col-span-2">
                <input
                  type="date"
                  aria-label="Start date filter"
                  className="h-8 min-w-0 flex-1 rounded-lg border border-slate-200 bg-slate-50/80 px-2 text-xs font-semibold text-slate-800 outline-none focus:border-primary focus:bg-white focus:ring-2 focus:ring-primary/20 transition"
                  value={startDate}
                  onChange={(e) => handleStartDateChange(e.target.value)}
                />
                <span className="text-xs text-slate-400 font-medium">to</span>
                <input
                  type="date"
                  min={startDate || undefined}
                  aria-label="End date filter"
                  className="h-8 min-w-0 flex-1 rounded-lg border border-slate-200 bg-slate-50/80 px-2 text-xs font-semibold text-slate-800 outline-none focus:border-primary focus:bg-white focus:ring-2 focus:ring-primary/20 transition"
                  value={endDate}
                  onChange={(e) => {
                    setEndDate(e.target.value);
                    setPredictionPage(0);
                    setAttendancePage(0);
                    setLatePage(0);
                  }}
                />
              </div>
            )}

            {/* Reset Filters Button */}
            {(eventFilter !== "all" || dateRangePreset !== "all" || startDate || endDate) && (
              <button
                type="button"
                onClick={() => {
                  setEventFilter("all");
                  setDateRangePreset("all");
                  setStartDate("");
                  setEndDate("");
                  setPredictionPage(0);
                  setAttendancePage(0);
                  setLatePage(0);
                }}
                className="inline-flex h-8 items-center justify-self-end gap-1 rounded-lg border border-slate-200 bg-white px-2.5 text-xs font-semibold text-slate-600 hover:text-primary transition sm:col-start-2 xl:col-start-4"
                title="Reset all filters"
              >
                <RotateCcw className="h-3.5 w-3.5" />
                Reset
              </button>
            )}
          </div>
      </div>

      {/* Tab 1: TURNOUT FORECAST TAB */}
      {activeTab === "prediction" && (
        <section className="space-y-4">


          <div className="grid gap-6 lg:grid-cols-[60%_40%] xl:grid-cols-[62%_38%]">
            {/* Left Column: Ranked Factors (62%) */}
            <div className="space-y-4">
              <div className="flex items-center gap-2 px-1 mb-2">
                <Target className="h-5 w-5 text-primary" />
                <div>
                  <h3 className="text-base font-bold text-foreground">Ranked Attendance Factors</h3>
                  <p className="text-[11px] text-muted-foreground">The most influential drivers for this event's turnout, ranked by permutation importance.</p>
                </div>
              </div>

              <div className="space-y-3">
                {predictionFactors.length === 0 ? <div className="rounded-xl border border-border bg-background p-4 text-sm text-muted-foreground">No model feature-importance data is available.</div> : predictionFactors.map((factor) => {
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
                            <span className="text-xs font-bold text-primary">{factor.strength}% Relative weight</span>
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
                            <h5 className="text-[10px] font-bold uppercase tracking-wider text-blue-800 mb-1">Model note</h5>
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

            {/* Right Column: Prediction Overview Context (38%) */}
            <div className="space-y-4">
              <ChartPanel title="Prediction Overview" description="Persisted turnout estimates; missing predictions are not replaced with synthetic values." empty={paginatedPredictionData.length === 0 || paginatedPredictionData.every((row) => row.predictedAttend == null)} emptyMessage="No turnout forecast data available for the selected filters.">
                <div className="flex h-full w-full min-h-0 flex-col">
                  <div className="min-h-0 flex-1 w-full">
                    <ResponsiveContainer width="100%" height="100%">
                      <BarChart data={paginatedPredictionData} margin={{ top: 8, right: 12, left: -10, bottom: 4 }}>
                          <CartesianGrid strokeDasharray="3 3" vertical={false} />
                          <XAxis dataKey="label" tickFormatter={(val) => shortenLabel(val, 10)} fontSize={11} tickLine={false} axisLine={false} />
                          <YAxis unit="%" domain={[0, 100]} fontSize={11} tickLine={false} axisLine={false} />
                          <Tooltip
                            content={({ active, payload }) => {
                              if (active && payload && payload.length) {
                                const data = payload[0].payload;
                                return (
                                  <div className="rounded-lg border bg-surface p-3 shadow-lg text-xs space-y-1.5 z-50">
                                    <p className="font-bold text-foreground">{data.title || data.label}</p>
                                    <p className="text-muted-foreground text-[11px]">Event Code: {data.label} {data.date ? `(${data.date})` : ""}</p>
                                    <div className="pt-1 border-t space-y-1">
                                      <div className="flex justify-between gap-4 text-emerald-600 font-semibold">
                                        <span>Predicted to Attend:</span>
                                        <span>{data.predictedAttend == null ? "N/A" : `${data.predictedAttend}%`}</span>
                                      </div>
                                      <div className="flex justify-between gap-4 text-red-600 font-semibold">
                                        <span>Predicted to Miss:</span>
                                        <span>{data.predictedMiss == null ? "N/A" : `${data.predictedMiss}%`}</span>
                                      </div>
                                    </div>
                                  </div>
                                );
                              }
                              return null;
                            }}
                          />
                          <Legend iconType="circle" wrapperStyle={{ fontSize: '11px' }} />
                          <Bar dataKey="predictedAttend" name="Predicted to attend" stackId="prediction" fill="#16a34a" radius={[3, 3, 0, 0]} />
                          <Bar dataKey="predictedMiss" name="Predicted to miss" stackId="prediction" fill="#dc2626" radius={[3, 3, 0, 0]} />
                        </BarChart>
                      </ResponsiveContainer>
                    </div>
                  {totalPredictionPages > 1 && (
                    <div className="mt-3 flex items-center justify-between border-t border-slate-100 pt-3">
                      <p className="text-[10px] text-muted-foreground">
                        Showing {predictionPage * 10 + 1} to {Math.min((predictionPage + 1) * 10, predictionOverviewData.length)} of {predictionOverviewData.length} events
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
          <div className="grid gap-6 xl:grid-cols-[3fr_2fr]">
            <ChartPanel title="Attendance Trends" description="Attendance rate per session across recorded events." empty={paginatedTrendData.length === 0} emptyMessage="No attendance session data available for the selected filters.">
              <div className="flex h-full w-full min-h-0 flex-col">
                <div className="min-h-0 flex-1 w-full">
                  <ResponsiveContainer width="100%" height="100%">
                    <LineChart data={paginatedTrendData} margin={{ top: 8, right: 14, left: -10, bottom: 4 }}>
                      <CartesianGrid strokeDasharray="3 3" vertical={false} />
                      <XAxis dataKey="label" tickFormatter={(val) => shortenLabel(val, 10)} fontSize={12} tickLine={false} axisLine={false} />
                      <YAxis unit="%" domain={[0, 100]} fontSize={12} tickLine={false} axisLine={false} />
                      <Tooltip
                        content={({ active, payload }) => {
                          if (active && payload && payload.length) {
                            const data = payload[0].payload;
                            return (
                              <div className="rounded-lg border bg-surface p-3 shadow-lg text-xs space-y-1.5 z-50">
                                <p className="font-bold text-foreground">{data.label}</p>
                                <p className="text-muted-foreground text-[11px]">Session Date: {data.date}</p>
                                <div className="pt-1 border-t space-y-1">
                                  <div className="flex justify-between gap-4 text-blue-600 font-bold">
                                    <span>Attendance Rate:</span>
                                    <span>{data.attendanceRate}%</span>
                                  </div>
                                  <div className="flex justify-between gap-4 text-muted-foreground">
                                    <span>Present:</span>
                                    <span className="font-semibold text-foreground">{data.present}</span>
                                  </div>
                                  <div className="flex justify-between gap-4 text-muted-foreground">
                                    <span>Late:</span>
                                    <span className="font-semibold text-foreground">{data.late}</span>
                                  </div>
                                  <div className="flex justify-between gap-4 text-muted-foreground">
                                    <span>Absent:</span>
                                    <span className="font-semibold text-foreground">{data.absent}</span>
                                  </div>
                                </div>
                              </div>
                            );
                          }
                          return null;
                        }}
                      />
                      <Line type="monotone" dataKey="attendanceRate" name="Attendance rate" stroke="#2563eb" strokeWidth={3} dot={{ r: 4, strokeWidth: 2 }} activeDot={{ r: 6 }} />
                    </LineChart>
                  </ResponsiveContainer>
                </div>
                {totalAttendancePages > 1 && (
                  <div className="mt-3 flex items-center justify-between border-t border-slate-100 pt-3">
                    <p className="text-[10px] text-muted-foreground">
                      Showing {attendancePage * 10 + 1} to {Math.min((attendancePage + 1) * 10, trendData.length)} of {trendData.length} sessions
                    </p>
                    <div className="flex items-center gap-1">
                      <Button type="button" variant="outline" size="sm" className="h-6 w-6 p-0" onClick={() => setAttendancePage(p => Math.max(0, p - 1))} disabled={attendancePage === 0}>
                        <ChevronLeft className="h-3.5 w-3.5" />
                      </Button>
                      <Button type="button" variant="outline" size="sm" className="h-6 w-6 p-0" onClick={() => setAttendancePage(p => Math.min(totalAttendancePages - 1, p + 1))} disabled={attendancePage >= totalAttendancePages - 1}>
                        <ChevronRight className="h-3.5 w-3.5" />
                      </Button>
                    </div>
                  </div>
                )}
              </div>
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
                    <span className="font-bold text-foreground">{overallAttendanceLabel}</span>
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
            {eventFilter !== "all" ? (
              <ChartPanel title="Objective Performance" description="Average rating score and response volume per goal." empty={objectivePerformance.length === 0} emptyMessage="No objective rating data submitted for the selected filters.">
                <div className="h-full max-h-full space-y-3 overflow-y-auto pr-2">
                  {objectivePerformance.map((objective) => (
                    <div key={objective.label} className="rounded-lg border bg-background p-3">
                      <div className="flex items-center justify-between gap-3">
                        <p className="text-xs font-semibold text-foreground">{objective.label}</p>
                        <span className="text-xs font-bold text-primary">{objective.score.toFixed(1)}/9</span>
                      </div>
                      <div className="mt-1.5 h-1.5 overflow-hidden rounded-full bg-muted">
                        <div className="h-full rounded-full bg-primary" style={{ width: `${(objective.score / 9) * 100}%` }} />
                      </div>
                      <p className="mt-1 text-[11px] text-muted-foreground">{objective.responses} responses</p>
                    </div>
                  ))}
                </div>
              </ChartPanel>
            ) : (
              <ChartPanel title="Overall Average Rating" description="The average objective rating across all events." empty={!overallAverageRating} emptyMessage="No objective rating data submitted.">
                <div className="flex h-full flex-col items-center justify-center p-6 text-center">
                  <div className="relative flex items-center justify-center">
                    <svg className="h-40 w-40 -rotate-90 transform text-primary" viewBox="0 0 36 36">
                      <path
                        className="fill-none stroke-muted stroke-[3]"
                        d="M18 2.0845 a 15.9155 15.9155 0 0 1 0 31.831 a 15.9155 15.9155 0 0 1 0 -31.831"
                      />
                      <path
                        className="fill-none stroke-primary stroke-[3]"
                        strokeDasharray={`${overallAverageRating ? (Number(overallAverageRating) / 9) * 100 : 0}, 100`}
                        strokeLinecap="round"
                        d="M18 2.0845 a 15.9155 15.9155 0 0 1 0 31.831 a 15.9155 15.9155 0 0 1 0 -31.831"
                      />
                    </svg>
                    <div className="absolute flex flex-col items-center justify-center">
                      <span className="text-4xl font-black text-slate-800">{overallAverageRating}</span>
                      <span className="text-sm font-semibold text-slate-500 mt-1">out of 9</span>
                    </div>
                  </div>
                </div>
              </ChartPanel>
            )}

            <ChartPanel title="Feedback Sentiment" description="Positive, neutral, and negative sentiment distribution." empty={!sentimentOverview.some((entry) => entry.value > 0)} emptyMessage="No student sentiment feedback submitted for the selected filters.">
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
                  <Tooltip formatter={(value: number) => [`${value}%`, "Share"]} />
                </PieChart>
              </ResponsiveContainer>
            </ChartPanel>
          </div>

        </section>
      )}

      {/* Tab 4: LATE ARRIVAL PATTERNS TAB */}
      {activeTab === "late" && (
        <section className="space-y-4 pt-2">
          <div className="grid gap-6 xl:grid-cols-[3fr_2fr]">
            <ChartPanel title="Late Reasons Breakdown" description="Distribution of reasons for late arrivals." empty={paginatedLateReasons.length === 0} emptyMessage="No late arrival records available for the selected filters.">
              <div className="flex h-full w-full min-h-0 flex-col">
                <div className="min-h-0 flex-1 w-full">
                  <ResponsiveContainer width="100%" height="100%">
                    <BarChart data={paginatedLateReasons} margin={{ top: 8, right: 12, left: -10, bottom: 20 }}>
                      <CartesianGrid strokeDasharray="3 3" vertical={false} />
                      <XAxis 
                        dataKey="category" 
                        tickFormatter={(val) => shortenLabel(val, 12)}
                        fontSize={11} 
                        tickLine={false} 
                        axisLine={false}
                        angle={-45}
                        textAnchor="end"
                        height={60}
                      />
                      <YAxis fontSize={12} tickLine={false} axisLine={false} allowDecimals={false} domain={[0, (dataMax: number) => Math.max(10, Math.ceil(dataMax * 1.25))]} />
                      <Tooltip
                        content={({ active, payload }) => {
                          if (active && payload && payload.length) {
                            const data = payload[0].payload;
                            return (
                              <div className="rounded-lg border bg-surface p-3 shadow-lg text-xs space-y-1 z-50">
                                <p className="font-bold text-foreground">{data.category}</p>
                                <div className="pt-1 border-t space-y-1">
                                  <p className="text-amber-600 font-bold">
                                    Late Check-ins: {data.count} ({data.share}%)
                                  </p>
                                </div>
                              </div>
                            );
                          }
                          return null;
                        }}
                      />
                      <Bar dataKey="count" name="Late arrivals" fill="#f59e0b" radius={[6, 6, 0, 0]} />
                    </BarChart>
                  </ResponsiveContainer>
                </div>
                {totalLatePages > 1 && (
                  <div className="mt-3 flex items-center justify-between border-t border-slate-100 pt-3">
                    <p className="text-[10px] text-muted-foreground">
                      Showing {latePage * 10 + 1} to {Math.min((latePage + 1) * 10, filteredLateReasons.length)} of {filteredLateReasons.length} categories
                    </p>
                    <div className="flex items-center gap-1">
                      <Button type="button" variant="outline" size="sm" className="h-6 w-6 p-0" onClick={() => setLatePage(p => Math.max(0, p - 1))} disabled={latePage === 0}>
                        <ChevronLeft className="h-3.5 w-3.5" />
                      </Button>
                      <Button type="button" variant="outline" size="sm" className="h-6 w-6 p-0" onClick={() => setLatePage(p => Math.min(totalLatePages - 1, p + 1))} disabled={latePage >= totalLatePages - 1}>
                        <ChevronRight className="h-3.5 w-3.5" />
                      </Button>
                    </div>
                  </div>
                )}
              </div>
            </ChartPanel>

            <div className="space-y-4">
              <article className="rounded-xl border bg-surface p-4 shadow-xs">
                <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wider">Top Late Reason</p>
                <p className="mt-1.5 text-xl font-bold text-foreground">{topLateReason.category}</p>
                <p className="mt-1 text-xs text-muted-foreground">
                  {topLateReason.count > 0 ? `${topLateReason.count} check-ins (${topLateReason.share}% of total late arrivals)` : "No late arrival records"}
                </p>
              </article>
              <article className="rounded-xl border bg-surface p-4 shadow-xs">
                <h3 className="text-xs font-semibold text-muted-foreground uppercase tracking-wider mb-3">Late-arrival categories</h3>
                <div className="space-y-2.5">
                  {filteredLateReasons.length === 0 || !filteredLateReasons.some((r) => r.count > 0) ? (
                    <p className="rounded-lg border bg-background p-3 text-xs text-muted-foreground">
                      No late-arrival records available yet.
                    </p>
                  ) : (
                    filteredLateReasons.map((reason: { category: string; count: number; share: number }) => (
                      <div key={reason.category} className="rounded-lg border bg-background p-3">
                        <div className="flex items-center justify-between gap-3 text-xs font-semibold">
                          <p className="text-foreground">{reason.category}</p>
                          <span className="text-foreground font-bold">{reason.count} ({reason.share}%)</span>
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
        onExport={handleExportReport}
      />
    </div>
  );
}
