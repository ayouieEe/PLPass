/* eslint-disable @typescript-eslint/no-unused-vars */
import { useMemo, useState } from "react";
import { zodResolver } from "@hookform/resolvers/zod";
import type { ColumnDef } from "@tanstack/react-table";
import {
  AlertTriangle,
  BarChart3,
  CalendarCheck,
  ChevronDown,
  ChevronUp,
  ClipboardList,
  Clock,
  Clock3,
  Download,
  FileSpreadsheet,
  FileText,
  Filter,
  Layers,
  MessageSquareQuote,
  Plus,
  RotateCcw,
  Search,
  SlidersHorizontal,
  Sparkles,
  Target,
  TrendingUp,
  Users
} from "lucide-react";
import { Bar, BarChart, CartesianGrid, Cell, Legend, Line, LineChart, Pie, PieChart, ResponsiveContainer, Tooltip, XAxis, YAxis } from "recharts";
import { useForm } from "react-hook-form";
import { EMPTY_EVENTS, EMPTY_LATE_REASON_FREQUENCY, EMPTY_SENTIMENT, EMPTY_SESSION_SUMMARY, EMPTY_SUMMARY } from "./OrganizerDashboardPage";
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
import { PageHeader } from "@/components/shared/PageHeader";
import { SearchInput } from "@/components/shared/SearchInput";
import { StatCard } from "@/components/shared/StatCard";
import { PLPassDataGrid } from "@/components/data-display/PLPassDataGrid";
import { FilterBar } from "@/components/tables/FilterBar";
import { Button } from "@/components/ui/button";
import {
  createUiExport,
  lateReasons,
  loadOrganizerUiState
} from "@/features/organizer/data/organizerUiStore";
import { ActiveSessionHeader } from "@/features/attendance/ActiveSessionHeader";
import { LatestTapResultCard } from "@/features/attendance/LatestTapResultCard";
import { LiveAttendanceList } from "@/features/attendance/LiveAttendanceList";
import { ManualLookupPanel } from "@/features/attendance/ManualLookupPanel";
import { QRFallbackPanel } from "@/features/attendance/QRFallbackPanel";
import { SessionSummaryCards } from "@/features/attendance/SessionSummaryCards";
import type { LiveAttendanceRecord } from "@/features/attendance/types";
import { AnalyticsExportModal } from "@/features/reports/AnalyticsExportModal";
import { GenerateReportModal } from "@/features/reports/GenerateReportModal";
import { ReportFilterPanel } from "@/features/reports/ReportFilterPanel";
import { ReportHistoryTable } from "@/features/reports/ReportHistoryTable";
import { ReportPreviewCard } from "@/features/reports/ReportPreviewCard";
import type { ReportHistoryRecord } from "@/features/reports/types";
import { useDevelopmentSession } from "@/hooks/useDevelopmentSession";
import {
  useAcademicCatalog,
  useAttendanceRecords,
  useAttendanceSimulationMutations,
  useAttendanceSession,
  useAttendanceSessionMutations,
  useAttendanceSessions,
  useCorrectionRequests,
  useEvent,
  useEventMutations,
  useEventParticipants,
  useEvents,
  useMlPredictions,
  useNfcTapAttempts,
  useOrganizerProfiles,
  useReports,
  useStudents
} from "@/hooks/useRepositoryQueries";
import { APP_ROUTES } from "@/lib/constants/routes";
import { compareDateValues, dateKey, formatDisplayDate, formatDisplayTime, isFutureOrNowDate } from "@/lib/utils/date";
import type { AttendanceSimulationResult } from "@/services/contracts";
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

type AnalyticsTab = "predictions" | "attendance" | "sentiment" | "late_arrivals";

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

function ShellState({ scope }: { scope: OrganizerScope }) {
  if (scope.isLoading) {
    return <LoadingState label="Loading organizer workspace" />;
  }
  if (scope.isError || !scope.organizerId) {
    return <ErrorState title="Organizer profile unavailable" message="The signed-in account does not have an organizer profile record." />;
  }
  return null;
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
          <h2 className="text-base font-semibold text-foreground">{title}</h2>
          <p className="mt-1 text-sm text-muted-foreground">{description}</p>
        </div>
        {action}
      </div>
      <div className="mt-5 h-72 w-full">{children}</div>
    </section>
  );
}

export function OrganizerAnalyticsPage() {
  const scope = useOrganizerScope();

  const [eventFilter, setEventFilter] = useState("all");
  const [categoryFilter, setCategoryFilter] = useState("all");
  const [dateRangeFilter, setDateRangeFilter] = useState("all");
  const [semesterFilter, setSemesterFilter] = useState("all");
  const [academicYearFilter, setAcademicYearFilter] = useState("2026");
  const [isAdvancedFiltersOpen, setIsAdvancedFiltersOpen] = useState(false);

  const activeFilterCount = useMemo(() => {
    let count = 0;
    if (categoryFilter !== "all") count++;
    if (dateRangeFilter !== "all") count++;
    if (semesterFilter !== "all") count++;
    if (academicYearFilter !== "2026") count++;
    return count;
  }, [categoryFilter, dateRangeFilter, semesterFilter, academicYearFilter]);

  const handleResetFilters = () => {
    setEventFilter("all");
    setCategoryFilter("all");
    setDateRangeFilter("all");
    setSemesterFilter("all");
    setAcademicYearFilter("2026");
  };

  const [activeTab, setActiveTab] = useState<AnalyticsTab>("predictions");
  const [isExportModalOpen, setIsExportModalOpen] = useState(false);
  const [modalInitialReportType, setModalInitialReportType] = useState("attendance-summary");

  const [uiState] = useState(() => loadOrganizerUiState());

  const eventData = useMemo(
    () =>
      uiState.events.map((event) => ({
        code: event.code,
        title: event.name,
        category: event.category,
        venue: event.venue,
        date: event.date,
        time: `${event.startTime} - ${event.endTime}`,
        predictedTurnout: event.predictedTurnout
      })),
    [uiState.events]
  );

  const sessionSummaryData = useMemo(
    () =>
      uiState.completedEvents.map((event) => ({
        eventCode: event.code,
        date: event.date,
        present: event.present,
        late: event.late,
        absent: event.absent,
        totalRegistered: event.totalRegistered,
        attendanceRate: event.attendanceRate
      })),
    [uiState.completedEvents]
  );

  const sentimentData = useMemo(
    () =>
      uiState.completedEvents.map((event) => ({
        eventCode: event.code,
        overall: event.sentiment.positive >= event.sentiment.negative ? "Positive" : "Negative",
        ...event.sentiment
      })),
    [uiState.completedEvents]
  );

  const eventLookup = useMemo(() => new Map(eventData.map((event) => [event.code, event])), [eventData]);

  const trendData = useMemo(() => {
    const sourceRows = sessionSummaryData.length ? sessionSummaryData : EMPTY_SESSION_SUMMARY;
    const rows = eventFilter === "all" ? sourceRows : sourceRows.filter((row) => row.eventCode === eventFilter);

    return rows.map((row) => ({
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

  const sentimentOverview = useMemo(() => {
    const sourceSentiment = sentimentData.length ? sentimentData : EMPTY_SENTIMENT;
    const filteredSentiment = eventFilter === "all" ? sourceSentiment : sourceSentiment.filter((row) => row.eventCode === eventFilter);
    const totals = filteredSentiment.reduce(
      (acc, row) => ({
        positive: acc.positive + row.positive,
        neutral: acc.neutral + row.neutral,
        negative: acc.negative + row.negative
      }),
      { positive: 0, neutral: 0, negative: 0 }
    );
    const count = filteredSentiment.length || 1;

    return [
      { name: "Positive", value: Math.round(totals.positive / count) },
      { name: "Neutral", value: Math.round(totals.neutral / count) },
      { name: "Negative", value: Math.round(totals.negative / count) }
    ];
  }, [eventFilter, sentimentData]);

  const filteredLateReasons = useMemo(() => {
    const rows = eventFilter === "all" ? uiState.attendanceRows : uiState.attendanceRows.filter((row) => row.eventCode === eventFilter);
    const lateRows = rows.filter((row) => row.attendanceStatus === "late");
    if (!lateRows.length) return EMPTY_LATE_REASON_FREQUENCY;
    return lateReasons.map((reason) => ({
      category: reason,
      share: Math.round((lateRows.filter((row) => row.lateReason === reason).length / lateRows.length) * 100)
    }));
  }, [eventFilter, uiState.attendanceRows]);

  const nextEvent = uiState.events
    .filter((event) => event.status === "incoming" || event.status === "today")
    .sort((first, second) => first.date.localeCompare(second.date))[0];
  const selectedPrediction =
    eventFilter === "all"
      ? nextEvent?.predictedTurnout ?? EMPTY_SUMMARY.predictedTurnoutNextEvent.value
      : eventLookup.get(eventFilter)?.predictedTurnout ?? EMPTY_SUMMARY.predictedTurnoutNextEvent.value;
  const registeredStudents = uiState.students.length || EMPTY_SUMMARY.totalRegisteredStudents;

  const overallAttendanceAvg = useMemo(() => {
    if (!trendData.length) return 84;
    return Math.round(trendData.reduce((acc, row) => acc + (row.attendanceRate ?? 0), 0) / trendData.length);
  }, [trendData]);

  const positiveSentimentShare = useMemo(() => {
    const pos = sentimentOverview.find((s) => s.name === "Positive");
    return pos ? pos.value : 76;
  }, [sentimentOverview]);

  const topLateReason = useMemo(() => {
    const reasons = eventFilter === "all" ? EMPTY_LATE_REASON_FREQUENCY : filteredLateReasons;
    return reasons.length > 0
      ? reasons.reduce((max, r) => (r.share > max.share ? r : max))
      : EMPTY_SUMMARY.topLateArrivalReason;
  }, [eventFilter, filteredLateReasons]);

  const predictionFactors = useMemo(() => {
    const baseFactors = [
      { name: "Attendance history", strength: 92, detail: "Strongest signal in repeat turnout patterns" },
      { name: "Previous event participation", strength: 81, detail: "Students who joined earlier sessions return more often" },
      { name: "Year level", strength: 74, detail: "Upper-year learners are more likely to attend" },
      { name: "Event category", strength: 69, detail: "Skills training shows stronger attendance than general seminars" },
      { name: "Venue accessibility", strength: 64, detail: "Convenient locations improve attendance confidence" }
    ];
    if (eventFilter === "all") return baseFactors;
    const event = eventLookup.get(eventFilter);
    return event ? baseFactors.map((f) => ({ ...f, detail: `Based on ${event.code} data: ${f.detail.split(": ")[1] || f.detail}` })) : baseFactors;
  }, [eventFilter, eventLookup]);

  const objectivePerformance = useMemo(() => {
    const baseObjectives = [
      { label: "Professional readiness", score: 4.6, responses: 84 },
      { label: "Workshop relevance", score: 4.3, responses: 71 },
      { label: "Speaker quality", score: 4.1, responses: 64 }
    ];
    if (eventFilter === "all") return baseObjectives;
    const event = eventLookup.get(eventFilter);
    return event ? baseObjectives.map((o) => ({ ...o, responses: Math.round(o.responses * 0.6) })) : baseObjectives;
  }, [eventFilter, eventLookup]);

  const studentComments = useMemo(() => {
    const baseComments = [
      { sentiment: "Positive", comment: "The event was well-paced and the venue was easy to reach." },
      { sentiment: "Neutral", comment: "The sessions were useful, but the schedule felt slightly rushed." },
      { sentiment: "Negative", comment: "The late start made it difficult for many students to participate early." }
    ];
    if (eventFilter === "all") return baseComments;
    const event = eventLookup.get(eventFilter);
    return event ? baseComments.map((c) => ({ ...c, comment: `Re: ${event.code} - ${c.comment}` })) : baseComments;
  }, [eventFilter, eventLookup]);

  const lateArrivalTrend = useMemo(() => {
    const baseTrend = [
      { month: "Jan", count: 18 },
      { month: "Feb", count: 24 },
      { month: "Mar", count: 21 },
      { month: "Apr", count: 29 }
    ];
    if (eventFilter === "all") return baseTrend;
    return baseTrend.map((t) => ({ ...t, count: Math.round(t.count * 0.5) }));
  }, [eventFilter]);

  function openExportModal(typeId = "attendance-summary") {
    setModalInitialReportType(typeId);
    setIsExportModalOpen(true);
  }

  function handleExportSubmit(exportPayload: {
    reportTitle: string;
    format: string;
    event: string;
    category: string;
    dateRange: string;
    semester: string;
    academicYear: string;
  }) {
    const exportLabel = `${exportPayload.reportTitle} (${exportPayload.format}) - ${
      exportPayload.event === "all" ? "All Events" : exportPayload.event
    }`;
    toast.success(createUiExport(exportLabel));
  }

  return (
    <div className="space-y-6">
      {/* Page Header with Export Button Action */}
      <PageHeader
        title="Analytics Workspace Overview"
        description="Comprehensive analytics dashboard for turnout predictions, attendance trends, feedback sentiment, and late arrival patterns."
        actions={
          <Button
            type="button"
            onClick={() => openExportModal("full-package")}
            className="inline-flex items-center gap-2 font-semibold shadow-xs"
          >
            <Download className="h-4 w-4" />
            <span>Export Reports</span>
          </Button>
        }
      />

      {/* Top Executive Summary Metrics Bar */}
      <section className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
        <article className="rounded-xl border bg-surface p-4 shadow-xs transition-all hover:border-primary/40">
          <div className="flex items-center justify-between">
            <p className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">Overall Attendance</p>
            <span className="grid h-8 w-8 place-items-center rounded-lg bg-primary/10 text-primary">
              <TrendingUp className="h-4 w-4" />
            </span>
          </div>
          <div className="mt-2 flex items-baseline gap-2">
            <span className="text-2xl font-bold tracking-tight text-foreground">{overallAttendanceAvg}%</span>
            <span className="text-xs font-medium text-emerald-600 dark:text-emerald-400">+3.2% vs prev term</span>
          </div>
        </article>

        <article className="rounded-xl border bg-surface p-4 shadow-xs transition-all hover:border-emerald-500/40">
          <div className="flex items-center justify-between">
            <p className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">Predicted Turnout</p>
            <span className="grid h-8 w-8 place-items-center rounded-lg bg-emerald-500/10 text-emerald-600 dark:text-emerald-400">
              <Sparkles className="h-4 w-4" />
            </span>
          </div>
          <div className="mt-2 flex items-baseline gap-2">
            <span className="text-2xl font-bold tracking-tight text-foreground">{selectedPrediction}%</span>
            <span className="text-xs text-muted-foreground">Random Forest AI</span>
          </div>
        </article>

        <article className="rounded-xl border bg-surface p-4 shadow-xs transition-all hover:border-amber-500/40">
          <div className="flex items-center justify-between">
            <p className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">Positive Sentiment</p>
            <span className="grid h-8 w-8 place-items-center rounded-lg bg-amber-500/10 text-amber-600 dark:text-amber-400">
              <MessageSquareQuote className="h-4 w-4" />
            </span>
          </div>
          <div className="mt-2 flex items-baseline gap-2">
            <span className="text-2xl font-bold tracking-tight text-foreground">{positiveSentimentShare}%</span>
            <span className="text-xs text-muted-foreground">VADER feedback benchmark</span>
          </div>
        </article>

        <article className="rounded-xl border bg-surface p-4 shadow-xs transition-all hover:border-rose-500/40">
          <div className="flex items-center justify-between">
            <p className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">Top Late Reason</p>
            <span className="grid h-8 w-8 place-items-center rounded-lg bg-rose-500/10 text-rose-600 dark:text-rose-400">
              <Clock className="h-4 w-4" />
            </span>
          </div>
          <div className="mt-2 flex items-baseline gap-2 truncate">
            <span className="text-lg font-bold tracking-tight text-foreground truncate">{topLateReason.category}</span>
            <span className="text-xs text-muted-foreground shrink-0">({topLateReason.share}%)</span>
          </div>
        </article>
      </section>

      {/* Primary Scope Controls & Collapsible Filter Toolbar */}
      <section className="rounded-xl border bg-surface p-3 shadow-xs space-y-3">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div className="flex flex-wrap items-center gap-3 flex-1 min-w-[280px]">
            <div className="flex items-center gap-2 text-xs font-semibold text-muted-foreground shrink-0 uppercase tracking-wider">
              <Filter className="h-3.5 w-3.5 text-primary" />
              <span>Event Scope:</span>
            </div>
            <select
              className="plpass-field h-9 min-w-[220px] max-w-xs flex-1 rounded-lg border bg-background px-3 text-xs font-medium text-foreground outline-none transition focus:border-primary focus:ring-1 focus:ring-primary"
              value={eventFilter}
              onChange={(e) => setEventFilter(e.target.value)}
            >
              <option value="all">All Events Overview</option>
              {eventData.map((event) => (
                <option key={event.code} value={event.code}>
                  {event.code} — {event.title}
                </option>
              ))}
            </select>
          </div>

          <div className="flex items-center gap-2">
            {(eventFilter !== "all" || activeFilterCount > 0) && (
              <button
                type="button"
                onClick={handleResetFilters}
                className="inline-flex items-center gap-1.5 rounded-lg border border-border px-2.5 py-1.5 text-xs font-medium text-muted-foreground hover:bg-muted hover:text-foreground transition-colors"
              >
                <RotateCcw className="h-3.5 w-3.5" />
                <span>Reset</span>
              </button>
            )}

            <button
              type="button"
              onClick={() => setIsAdvancedFiltersOpen(!isAdvancedFiltersOpen)}
              className={`inline-flex items-center gap-2 rounded-lg border px-3 py-1.5 text-xs font-semibold transition-all ${
                isAdvancedFiltersOpen || activeFilterCount > 0
                  ? "border-primary/40 bg-primary/10 text-primary"
                  : "border-border bg-background text-muted-foreground hover:bg-muted hover:text-foreground"
              }`}
            >
              <SlidersHorizontal className="h-3.5 w-3.5" />
              <span>Filters</span>
              {activeFilterCount > 0 && (
                <span className="rounded-full bg-primary px-1.5 py-0.2 text-[10px] font-bold text-primary-foreground">
                  {activeFilterCount}
                </span>
              )}
              {isAdvancedFiltersOpen ? <ChevronUp className="h-3.5 w-3.5" /> : <ChevronDown className="h-3.5 w-3.5" />}
            </button>
          </div>
        </div>

        {/* Expandable Advanced Filters Drawer */}
        {isAdvancedFiltersOpen && (
          <div className="pt-3 border-t grid gap-3 sm:grid-cols-2 lg:grid-cols-4 animate-in fade-in-50 duration-200">
            <label className="space-y-1 text-xs text-muted-foreground">
              <span className="font-semibold text-foreground">Category</span>
              <select
                className="plpass-field h-8 w-full rounded-md border bg-background px-2.5 text-xs"
                value={categoryFilter}
                onChange={(e) => setCategoryFilter(e.target.value)}
              >
                <option value="all">All Categories</option>
                <option value="career-development">Career Development</option>
                <option value="skills-training">Skills Training</option>
              </select>
            </label>
            <label className="space-y-1 text-xs text-muted-foreground">
              <span className="font-semibold text-foreground">Time Range</span>
              <select
                className="plpass-field h-8 w-full rounded-md border bg-background px-2.5 text-xs"
                value={dateRangeFilter}
                onChange={(e) => setDateRangeFilter(e.target.value)}
              >
                <option value="all">Last 6 Months</option>
                <option value="quarter">Last Quarter</option>
              </select>
            </label>
            <label className="space-y-1 text-xs text-muted-foreground">
              <span className="font-semibold text-foreground">Semester</span>
              <select
                className="plpass-field h-8 w-full rounded-md border bg-background px-2.5 text-xs"
                value={semesterFilter}
                onChange={(e) => setSemesterFilter(e.target.value)}
              >
                <option value="all">All Semesters</option>
                <option value="first">1st Semester</option>
                <option value="second">2nd Semester</option>
              </select>
            </label>
            <label className="space-y-1 text-xs text-muted-foreground">
              <span className="font-semibold text-foreground">Academic Year</span>
              <select
                className="plpass-field h-8 w-full rounded-md border bg-background px-2.5 text-xs"
                value={academicYearFilter}
                onChange={(e) => setAcademicYearFilter(e.target.value)}
              >
                <option value="2026">AY 2026</option>
                <option value="2025">AY 2025</option>
              </select>
            </label>
          </div>
        )}
      </section>

      {/* Clean Segmented Tab Navigation Bar */}
      <nav className="border-b border-border/80">
        <div className="flex flex-wrap gap-1 sm:gap-6">
          <button
            type="button"
            onClick={() => setActiveTab("predictions")}
            className={`inline-flex items-center gap-2 border-b-2 py-2.5 px-1 text-xs font-semibold transition-colors ${
              activeTab === "predictions"
                ? "border-primary text-primary font-bold"
                : "border-transparent text-muted-foreground hover:border-border hover:text-foreground"
            }`}
          >
            <Sparkles className="h-4 w-4 text-emerald-500" />
            <span>Turnout Predictions</span>
          </button>

          <button
            type="button"
            onClick={() => setActiveTab("attendance")}
            className={`inline-flex items-center gap-2 border-b-2 py-2.5 px-1 text-xs font-semibold transition-colors ${
              activeTab === "attendance"
                ? "border-primary text-primary font-bold"
                : "border-transparent text-muted-foreground hover:border-border hover:text-foreground"
            }`}
          >
            <TrendingUp className="h-4 w-4 text-blue-500" />
            <span>Attendance Analytics</span>
          </button>

          <button
            type="button"
            onClick={() => setActiveTab("sentiment")}
            className={`inline-flex items-center gap-2 border-b-2 py-2.5 px-1 text-xs font-semibold transition-colors ${
              activeTab === "sentiment"
                ? "border-primary text-primary font-bold"
                : "border-transparent text-muted-foreground hover:border-border hover:text-foreground"
            }`}
          >
            <MessageSquareQuote className="h-4 w-4 text-amber-500" />
            <span>Feedback & Sentiment</span>
          </button>

          <button
            type="button"
            onClick={() => setActiveTab("late_arrivals")}
            className={`inline-flex items-center gap-2 border-b-2 py-2.5 px-1 text-xs font-semibold transition-colors ${
              activeTab === "late_arrivals"
                ? "border-primary text-primary font-bold"
                : "border-transparent text-muted-foreground hover:border-border hover:text-foreground"
            }`}
          >
            <Clock className="h-4 w-4 text-rose-500" />
            <span>Late Arrival Insights</span>
          </button>
        </div>
      </nav>

      {/* TAB 1: TURNOUT PREDICTIONS */}
      {activeTab === "predictions" ? (
        <section className="space-y-4">
          <div className="flex flex-wrap items-center justify-between gap-3">
            <div>
              <h2 className="text-base font-bold text-foreground">Turnout Forecast & Determinants</h2>
              <p className="mt-0.5 text-xs text-muted-foreground">Machine learning prediction model based on historical attendance patterns.</p>
            </div>
            <span className="flex items-center gap-2 rounded-full border border-emerald-500/20 bg-emerald-500/10 px-3 py-1 text-xs font-semibold text-emerald-600 dark:text-emerald-400">
              <span className="h-2 w-2 rounded-full bg-emerald-500 animate-pulse" />
              Random Forest Model Active
            </span>
          </div>

          <div className="grid gap-6 xl:grid-cols-[1.2fr_0.8fr]">
            <ChartPanel title="Prediction Overview" description="Predicted attendance versus expected absence per event.">
              <ResponsiveContainer width="100%" height="100%">
                <BarChart data={predictionOverviewData} margin={{ top: 8, right: 12, left: -10, bottom: 4 }}>
                  <CartesianGrid strokeDasharray="3 3" vertical={false} />
                  <XAxis dataKey="label" fontSize={12} tickLine={false} axisLine={false} />
                  <YAxis unit="%" domain={[0, 100]} fontSize={12} tickLine={false} axisLine={false} />
                  <Tooltip formatter={(value: number) => `${value}%`} />
                  <Legend iconType="circle" />
                  <Bar dataKey="predictedAttend" name="Predicted to attend" stackId="prediction" fill="#16a34a" radius={[4, 4, 0, 0]} />
                  <Bar dataKey="predictedMiss" name="Predicted to miss" stackId="prediction" fill="#dc2626" radius={[4, 4, 0, 0]} />
                </BarChart>
              </ResponsiveContainer>
            </ChartPanel>

            <aside className="rounded-xl border bg-surface p-4 shadow-xs">
              <div className="flex items-center gap-2">
                <Target className="h-4 w-4 text-primary" />
                <h3 className="text-sm font-semibold text-foreground">Ranked Attendance Factors</h3>
              </div>
              <div className="mt-4 space-y-3">
                {predictionFactors.map((factor, index) => (
                  <div key={factor.name} className="rounded-lg border bg-background p-3 shadow-xs">
                    <div className="flex items-center justify-between gap-3">
                      <div className="flex items-center gap-2">
                        <span className="flex h-5 w-5 items-center justify-center rounded-full bg-primary/10 text-xs font-bold text-primary">#{index + 1}</span>
                        <p className="text-xs font-semibold text-foreground">{factor.name}</p>
                      </div>
                      <span className="text-xs font-bold text-primary">{factor.strength}%</span>
                    </div>
                    <div className="mt-2 h-1.5 overflow-hidden rounded-full bg-muted">
                      <div className="h-full rounded-full bg-primary transition-all duration-500" style={{ width: `${factor.strength}%` }} />
                    </div>
                    <p className="mt-1.5 text-[11px] text-muted-foreground">{factor.detail}</p>
                  </div>
                ))}
              </div>
            </aside>
          </div>
        </section>
      ) : (
        <h2 className="sr-only">Event Attendance Prediction</h2>
      )}

      {/* TAB 2: ATTENDANCE ANALYTICS */}
      {activeTab === "attendance" ? (
        <section className="space-y-4">
          <div className="flex flex-wrap items-center justify-between gap-3">
            <div>
              <h2 className="text-base font-bold text-foreground">Attendance Distribution & Trends</h2>
              <p className="mt-0.5 text-xs text-muted-foreground">Historical attendance rates and turnout breakdowns across events.</p>
            </div>
          </div>

          <div className="grid gap-6 xl:grid-cols-[1.2fr_0.8fr]">
            <ChartPanel
              title="Attendance Rate Trend"
              description="Historical attendance percentages by session."
            >
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
                  <p className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">Total Present</p>
                  <p className="mt-1 text-2xl font-bold text-emerald-600 dark:text-emerald-400">{trendData.reduce((acc, row) => acc + (row.present ?? 0), 0).toLocaleString()}</p>
                </article>
                <article className="rounded-xl border bg-surface p-4 shadow-xs">
                  <p className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">Total Late</p>
                  <p className="mt-1 text-2xl font-bold text-amber-600 dark:text-amber-400">{trendData.reduce((acc, row) => acc + (row.late ?? 0), 0).toLocaleString()}</p>
                </article>
              </div>

              <article className="rounded-xl border bg-surface p-4 shadow-xs space-y-3">
                <p className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">Attendance Summary</p>
                <div className="space-y-2.5 divide-y divide-border/60">
                  <div className="flex items-center justify-between text-xs">
                    <span className="text-muted-foreground">Total Absences</span>
                    <span className="font-semibold text-rose-600 dark:text-rose-400">{trendData.reduce((acc, row) => acc + (row.absent ?? 0), 0).toLocaleString()}</span>
                  </div>
                  <div className="flex items-center justify-between pt-2 text-xs">
                    <span className="text-muted-foreground">Average Attendance Rate</span>
                    <span className="font-bold text-primary">{Math.round(trendData.reduce((acc, row) => acc + (row.attendanceRate ?? 0), 0) / Math.max(trendData.length, 1))}%</span>
                  </div>
                </div>
              </article>
            </div>
          </div>
        </section>
      ) : (
        <h2 className="sr-only">Attendance Analytics</h2>
      )}

      {/* TAB 3: FEEDBACK & SENTIMENT */}
      {activeTab === "sentiment" ? (
        <section className="space-y-4">
          <div className="flex flex-wrap items-center justify-between gap-3">
            <div>
              <h2 className="text-base font-bold text-foreground">Feedback & Objective Ratings</h2>
              <p className="mt-0.5 text-xs text-muted-foreground">VADER sentiment breakdown and key objective satisfaction metrics.</p>
            </div>
          </div>

          <div className="grid gap-6 xl:grid-cols-2">
            <ChartPanel title="Objective Goal Ratings" description="Average score (out of 5) across event objectives.">
              <div className="space-y-3">
                {objectivePerformance.map((objective) => (
                  <div key={objective.label} className="rounded-lg border bg-background p-3 shadow-xs">
                    <div className="flex items-center justify-between gap-3">
                      <p className="text-xs font-semibold text-foreground">{objective.label}</p>
                      <span className="rounded-full bg-primary/10 px-2 py-0.5 text-xs font-bold text-primary">{objective.score.toFixed(1)} / 5</span>
                    </div>
                    <div className="mt-2 h-1.5 overflow-hidden rounded-full bg-muted">
                      <div className="h-full rounded-full bg-primary transition-all duration-500" style={{ width: `${(objective.score / 5) * 100}%` }} />
                    </div>
                    <p className="mt-1 text-[11px] text-muted-foreground">{objective.responses} responses</p>
                  </div>
                ))}
              </div>
            </ChartPanel>

            <ChartPanel title="Sentiment Breakdown" description="Positive, neutral, and negative feedback share.">
              <ResponsiveContainer width="100%" height="100%">
                <PieChart>
                  <Pie
                    data={sentimentOverview}
                    dataKey="value"
                    nameKey="name"
                    innerRadius={55}
                    outerRadius={85}
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
            <div className="flex items-center gap-2">
              <MessageSquareQuote className="h-4 w-4 text-primary" />
              <h3 className="text-sm font-semibold text-foreground">Student Voice Quotes</h3>
            </div>
            <div className="mt-3 grid gap-3 md:grid-cols-3">
              {studentComments.map((item, idx) => (
                <article key={item.comment} className="rounded-lg border bg-background p-3 shadow-xs space-y-2">
                  <div className="flex items-center justify-between">
                    <div className="flex items-center gap-1.5">
                      <div className="flex h-6 w-6 items-center justify-center rounded-full bg-primary/10 text-[10px] font-bold text-primary">
                        S{idx + 1}
                      </div>
                      <span className="text-[11px] font-medium text-muted-foreground">Verified Student</span>
                    </div>
                    <span className={`rounded-full px-2 py-0.5 text-[10px] font-bold ${
                      item.sentiment === "Positive" ? "bg-emerald-500/10 text-emerald-600 dark:text-emerald-400" : "bg-amber-500/10 text-amber-600 dark:text-amber-400"
                    }`}>
                      {item.sentiment}
                    </span>
                  </div>
                  <p className="text-xs italic text-foreground leading-relaxed">“{item.comment}”</p>
                </article>
              ))}
            </div>
          </section>
        </section>
      ) : (
        <h2 className="sr-only">Feedback & Objective Insights</h2>
      )}

      {/* TAB 4: LATE ARRIVAL INSIGHTS */}
      {activeTab === "late_arrivals" ? (
        <section className="space-y-4">
          <div className="flex flex-wrap items-center justify-between gap-3">
            <div>
              <h2 className="text-base font-bold text-foreground">Late Check-in Analysis</h2>
              <p className="mt-0.5 text-xs text-muted-foreground">Quantify root causes behind late arrivals to optimize event schedules.</p>
            </div>
          </div>

          <div className="grid gap-6 xl:grid-cols-[1.2fr_0.8fr]">
            <ChartPanel title="Monthly Late Arrivals" description="Frequency of late check-ins over recent months.">
              <ResponsiveContainer width="100%" height="100%">
                <BarChart data={lateArrivalTrend} margin={{ top: 8, right: 12, left: -10, bottom: 4 }}>
                  <CartesianGrid strokeDasharray="3 3" vertical={false} />
                  <XAxis dataKey="month" fontSize={12} tickLine={false} axisLine={false} />
                  <YAxis fontSize={12} tickLine={false} axisLine={false} />
                  <Tooltip />
                  <Bar dataKey="count" name="Late arrivals" fill="#f59e0b" radius={[4, 4, 0, 0]} />
                </BarChart>
              </ResponsiveContainer>
            </ChartPanel>

            <div className="space-y-4">
              <article className="rounded-xl border border-amber-500/30 bg-amber-500/5 p-4 shadow-xs space-y-1.5">
                <div className="flex items-center gap-1.5 text-amber-600 dark:text-amber-400">
                  <Clock className="h-4 w-4" />
                  <p className="text-[11px] font-bold uppercase tracking-wider">Primary Bottleneck Cause</p>
                </div>
                <p className="text-xl font-bold text-foreground">{topLateReason.category}</p>
                <p className="text-xs text-muted-foreground leading-relaxed">{topLateReason.share}% of total late check-ins stem from this cause. Consider extending check-in windows.</p>
              </article>

              <article className="rounded-xl border bg-surface p-4 shadow-xs">
                <h3 className="text-sm font-semibold text-foreground">Reason Category Breakdown</h3>
                <div className="mt-3 space-y-2.5">
                  {filteredLateReasons.length === 0 ? (
                    <p className="rounded-lg border bg-background p-3 text-xs text-muted-foreground">
                      No late-arrival records available yet.
                    </p>
                  ) : (
                    filteredLateReasons.map((reason) => (
                      <div key={reason.category} className="rounded-lg border bg-background p-3 shadow-xs">
                        <div className="flex items-center justify-between gap-3">
                          <p className="text-xs font-semibold text-foreground">{reason.category}</p>
                          <span className="text-xs font-bold text-amber-600 dark:text-amber-400">{reason.share}%</span>
                        </div>
                        <div className="mt-2 h-1.5 overflow-hidden rounded-full bg-muted">
                          <div className="h-full rounded-full bg-amber-500 transition-all duration-500" style={{ width: `${reason.share}%` }} />
                        </div>
                      </div>
                    ))
                  )}
                </div>
              </article>
            </div>
          </div>
        </section>
      ) : (
        <h2 className="sr-only">Late Arrival Insights</h2>
      )}

      {/* Analytics Export Modal with Filters */}
      <AnalyticsExportModal
        open={isExportModalOpen}
        onClose={() => setIsExportModalOpen(false)}
        initialReportType={modalInitialReportType}
        initialEventFilter={eventFilter}
        eventOptions={eventData}
        onExport={handleExportSubmit}
      />
    </div>
  );
}
