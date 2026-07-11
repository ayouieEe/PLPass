/* eslint-disable @typescript-eslint/no-unused-vars */
import { useMemo, useState } from "react";
import { zodResolver } from "@hookform/resolvers/zod";
import type { ColumnDef } from "@tanstack/react-table";
import { AlertTriangle, BarChart3, CalendarCheck, ClipboardList, Clock3, Download, Filter, MessageSquareQuote, Plus, Search, Sparkles, Target, TrendingUp, Users } from "lucide-react";
import { Bar, BarChart, CartesianGrid, Cell, Legend, Line, LineChart, Pie, PieChart, ResponsiveContainer, Tooltip, XAxis, YAxis } from "recharts";
import { useForm } from "react-hook-form";
import { DUMMY_EVENTS, DUMMY_LATE_REASON_FREQUENCY, DUMMY_SENTIMENT, DUMMY_SESSION_SUMMARY, DUMMY_SUMMARY } from "./OrganizerDashboardPage";
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
import { ActiveSessionHeader } from "@/features/attendance/ActiveSessionHeader";
import { LatestTapResultCard } from "@/features/attendance/LatestTapResultCard";
import { LiveAttendanceList } from "@/features/attendance/LiveAttendanceList";
import { ManualLookupPanel } from "@/features/attendance/ManualLookupPanel";
import { QRFallbackPanel } from "@/features/attendance/QRFallbackPanel";
import { SessionSummaryCards } from "@/features/attendance/SessionSummaryCards";
import type { LiveAttendanceRecord } from "@/features/attendance/types";
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
import type { RepositoryContext } from "@/services/mock/mockRepositoryUtils";
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

type EventWithCount = Event & { participantCount: number };

const dateFormatter = new Intl.DateTimeFormat("en-US", { month: "short", day: "numeric", year: "numeric" });
const timeFormatter = new Intl.DateTimeFormat("en-US", { hour: "2-digit", minute: "2-digit" });

const eventFormSchema = z
  .object({
    code: z.string().min(2, "Event code is required."),
    title: z.string().min(3, "Event name is required."),
    category: z.string().min(2, "Category is required."),
    venue: z.string().min(2, "Venue is required."),
    date: z.string().min(1, "Date is required."),
    startTime: z.string().min(1, "Start time is required."),
    endTime: z.string().min(1, "End time is required."),
    attendanceMode: z.enum(["face-to-face", "online"]),
    description: z.string().optional(),
    remarks: z.string().optional()
  })
  .refine((value) => value.endTime > value.startTime, {
    path: ["endTime"],
    message: "End time must be after start time."
  });

const sessionFormSchema = z
  .object({
    venue: z.string().min(2, "Venue is required."),
    date: z.string().min(1, "Date is required."),
    startTime: z.string().min(1, "Start time is required."),
    expectedEndTime: z.string().min(1, "Expected end time is required."),
    attendanceMode: z.enum(["face-to-face", "online"])
  })
  .refine((value) => value.expectedEndTime > value.startTime, {
    path: ["expectedEndTime"],
    message: "Expected end time must be after start time."
  });

type EventFormValues = z.infer<typeof eventFormSchema>;
type SessionFormValues = z.infer<typeof sessionFormSchema>;

function useOrganizerScope(): OrganizerScope {
  const { session } = useDevelopmentSession();
  const context = session ? { actorUserId: session.userId, actorRole: session.role } : undefined;
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

function attendanceCounts(records: AttendanceRecord[]) {
  return {
    present: records.filter((record) => record.status === "present").length,
    late: records.filter((record) => record.status === "late").length,
    absent: records.filter((record) => record.status === "absent").length,
    excused: records.filter((record) => record.status === "excused").length
  };
}

function attendanceRate(records: AttendanceRecord[]) {
  if (records.length === 0) {
    return 0;
  }
  const attended = records.filter((record) => record.status === "present" || record.status === "late").length;
  return Math.round((attended / records.length) * 100);
}

function eventLabel(event: Event | undefined) {
  return event ? `${event.code} - ${event.title}` : "Unknown event";
}

function studentName(student: Student | undefined) {
  return student ? student.studentNumber : "Unknown student";
}

function ShellState({ scope }: { scope: OrganizerScope }) {
  if (scope.isLoading) {
    return <LoadingState label="Loading organizer workspace" />;
  }
  if (scope.isError || !scope.organizerId) {
    return <ErrorState title="Organizer profile unavailable" message="The signed-in mock account does not have an organizer profile fixture." />;
  }
  return null;
}

function OrganizerFrame({ children }: { children: React.ReactNode }) {
  return <div className="space-y-6">{children}</div>;
}

function recordsForSession(records: AttendanceRecord[], sessionId: string) {
  return records.filter((record) => record.sessionId === sessionId);
}

function participantStudents(participants: EventParticipant[], students: Student[]) {
  const participantIds = new Set(participants.map((participant) => participant.studentId));
  return students.filter((student) => participantIds.has(student.id));
}

function eventSemesterId(event: Event, semesters: { id: string; startsAt: string; endsAt: string }[]) {
  const eventDate = dateKey(event.startsAt);
  if (!eventDate) {
    return undefined;
  }
  return semesters.find((semester) => eventDate >= semester.startsAt && eventDate <= semester.endsAt)?.id;
}

function eventMatchesDateRange(event: Event, dateFrom: string, dateTo: string) {
  const date = dateKey(event.startsAt);
  return (!dateFrom || date >= dateFrom) && (!dateTo || date <= dateTo);
}

function buildLiveRecords(records: AttendanceRecord[], students: Student[]): LiveAttendanceRecord[] {
  return records.map((record) => ({
    id: record.id,
    studentName: studentName(students.find((student) => student.id === record.studentId)),
    identifier: students.find((student) => student.id === record.studentId)?.studentNumber ?? record.studentId,
    status: record.status === "excused" ? "manual" : record.status,
    timestamp: formatTime(record.recordedAt)
  }));
}

function EventScheduleCard({ event }: { event: Event }) {
  return (
    <article className="rounded-lg border bg-background p-3">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div>
          <p className="font-medium">{eventLabel(event)}</p>
          <p className="text-sm text-muted-foreground">{formatDate(event.startsAt)} {formatTime(event.startsAt)} - {formatTime(event.endsAt)} - {event.venue}</p>
        </div>
        <Button asChild variant="outline" size="sm">
          <NavLink to={APP_ROUTES.organizerEvent(event.id)}>View</NavLink>
        </Button>
      </div>
    </article>
  );
}

function PredictionCard({ prediction }: { prediction: MlPrediction }) {
  return (
    <article className="rounded-lg border bg-background p-3">
      <div className="flex items-center justify-between gap-2">
        <div>
          <p className="font-medium">{prediction.patternLabel}</p>
          <p className="text-sm text-muted-foreground">{prediction.explanation}</p>
        </div>
        <StatusBadge label={prediction.riskLevel} tone={statusTone(prediction.riskLevel)} />
      </div>
    </article>
  );
}

function SessionCard({ session }: { session: AttendanceSession }) {
  return (
    <article className="rounded-lg border bg-background p-3">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div>
          <p className="font-medium">{session.title}</p>
          <p className="text-sm text-muted-foreground">{formatDate(session.startsAt)} {formatTime(session.startsAt)}</p>
        </div>
        <Button asChild variant="outline" size="sm">
          <NavLink to={APP_ROUTES.organizerSession(session.id)}>View session</NavLink>
        </Button>
      </div>
    </article>
  );

}

function DashboardMetricCard({
  title,
  value,
  detail,
  icon: Icon,
  tone = "default"
}: {
  title: string;
  value: string;
  detail: string;
  icon: typeof CalendarCheck;
  tone?: "default" | "warning" | "success";
}) {
  const toneClass =
    tone === "warning"
      ? "border-amber-200 bg-amber-50 text-amber-700"
      : tone === "success"
        ? "border-emerald-200 bg-emerald-50 text-emerald-700"
        : "border-primary/15 bg-primary/5 text-primary";

  return (
    <article className="min-h-36 rounded-lg border bg-surface p-4 shadow-sm">
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <p className="text-xs font-medium uppercase tracking-normal text-muted-foreground">{title}</p>
          <p className="mt-3 text-3xl font-semibold leading-none text-foreground">{value}</p>
        </div>
        <span className={`grid h-10 w-10 flex-none place-items-center rounded-md border ${toneClass}`}>
          <Icon className="h-5 w-5" aria-hidden="true" />
        </span>
      </div>
      <p className="mt-4 line-clamp-2 text-sm leading-5 text-muted-foreground">{detail}</p>
    </article>
  );
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
    <section className="rounded-lg border bg-surface p-4 shadow-sm">
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
  const [eventFilter, setEventFilter] = useState("all");
  const eventLookup = useMemo(() => new Map(DUMMY_EVENTS.map((event) => [event.code, event])), []);

  const trendData = useMemo(() => {
    const rows = eventFilter === "all" ? DUMMY_SESSION_SUMMARY : DUMMY_SESSION_SUMMARY.filter((row) => row.eventCode === eventFilter);

    return rows.map((row) => ({
      label: row.eventCode,
      attendanceRate: row.attendanceRate,
      date: row.date,
      present: row.present,
      late: row.late,
      absent: row.absent
    }));
  }, [eventFilter]);

  const predictionOverviewData = useMemo(() => {
    const filteredEvents = eventFilter === "all" ? DUMMY_EVENTS : DUMMY_EVENTS.filter((event) => event.code === eventFilter);
    return filteredEvents.map((event) => ({
      label: event.code,
      title: event.title,
      predictedAttend: event.predictedTurnout,
      predictedMiss: 100 - event.predictedTurnout
    }));
  }, [eventFilter]);

  const sentimentOverview = useMemo(() => {
    const filteredSentiment = eventFilter === "all" ? DUMMY_SENTIMENT : DUMMY_SENTIMENT.filter((row) => row.eventCode === eventFilter);
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
  }, [eventFilter]);

  const filteredLateReasons = useMemo(() => {
    if (eventFilter === "all") return DUMMY_LATE_REASON_FREQUENCY;
    return DUMMY_LATE_REASON_FREQUENCY.map(r => ({ ...r, share: Math.max(5, r.share - 5) }));
  }, [eventFilter]);

  const activeEvent = eventLookup.get(DUMMY_SUMMARY.activeSessionToday.eventCode);
  const nextEvent = eventLookup.get(DUMMY_SUMMARY.predictedTurnoutNextEvent.eventCode);
  const topLateReason = useMemo(() => {
    const reasons = eventFilter === "all" ? DUMMY_LATE_REASON_FREQUENCY : filteredLateReasons;
    return reasons.length > 0 ? reasons.reduce((max, r) => (r.share > max.share ? r : max)) : DUMMY_LATE_REASON_FREQUENCY[0];
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
    return event ? baseFactors.map(f => ({ ...f, detail: `Based on ${event.code} data: ${f.detail.split(": ")[1] || f.detail}` })) : baseFactors;
  }, [eventFilter, eventLookup]);

  const objectivePerformance = useMemo(() => {
    const baseObjectives = [
      { label: "Professional readiness", score: 4.6, responses: 84 },
      { label: "Workshop relevance", score: 4.3, responses: 71 },
      { label: "Speaker quality", score: 4.1, responses: 64 }
    ];
    if (eventFilter === "all") return baseObjectives;
    const event = eventLookup.get(eventFilter);
    return event ? baseObjectives.map(o => ({ ...o, responses: Math.round(o.responses * 0.6) })) : baseObjectives;
  }, [eventFilter, eventLookup]);

  const studentComments = useMemo(() => {
    const baseComments = [
      { sentiment: "Positive", comment: "The event was well-paced and the venue was easy to reach." },
      { sentiment: "Neutral", comment: "The sessions were useful, but the schedule felt slightly rushed." },
      { sentiment: "Negative", comment: "The late start made it difficult for many students to participate early." }
    ];
    if (eventFilter === "all") return baseComments;
    const event = eventLookup.get(eventFilter);
    return event ? baseComments.map(c => ({ ...c, comment: `Re: ${event.code} - ${c.comment}` })) : baseComments;
  }, [eventFilter, eventLookup]);

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

  return (
    <div className="space-y-10">
      <PageHeader
        eyebrow="Insights"
        title="Analytics insights"
        description="Use the current event data to forecast turnout, review feedback sentiment, and identify late-arrival patterns that can guide venue, timing, and transport planning."
      />

      <section className="rounded-xl border bg-surface p-6 shadow-sm space-y-4">
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div>
            <h2 className="text-base font-semibold text-foreground">Analytics filters</h2>
            <p className="mt-1 text-sm text-muted-foreground">Apply the same scope across prediction, attendance, feedback, and late-arrival analysis.</p>
          </div>
          <span className="flex items-center gap-2 rounded-full border border-primary/15 bg-primary/5 px-3 py-1 text-sm font-medium text-primary">
            <Filter className="h-4 w-4" />
            Global filters
          </span>
        </div>
        <div className="grid gap-5 md:grid-cols-2 xl:grid-cols-5">
          <label className="space-y-1 text-sm text-muted-foreground">
            <span className="font-medium text-foreground">Event</span>
            <select className="plpass-field h-10 w-full rounded-md border px-3 text-sm" value={eventFilter} onChange={(event) => setEventFilter(event.target.value)}>
              <option value="all">All events</option>
              {DUMMY_EVENTS.map((event) => (
                <option key={event.code} value={event.code}>
                  {event.code}
                </option>
              ))}
            </select>
          </label>
          <label className="space-y-1 text-sm text-muted-foreground">
            <span className="font-medium text-foreground">Event Category</span>
            <select className="plpass-field h-10 w-full rounded-md border px-3 text-sm">
              <option value="all">All categories</option>
              <option value="career-development">Career Development</option>
              <option value="skills-training">Skills Training</option>
            </select>
          </label>
          <label className="space-y-1 text-sm text-muted-foreground">
            <span className="font-medium text-foreground">Date Range</span>
            <select className="plpass-field h-10 w-full rounded-md border px-3 text-sm">
              <option value="all">Last 6 months</option>
              <option value="quarter">Last quarter</option>
            </select>
          </label>
          <label className="space-y-1 text-sm text-muted-foreground">
            <span className="font-medium text-foreground">Semester</span>
            <select className="plpass-field h-10 w-full rounded-md border px-3 text-sm">
              <option value="all">All semesters</option>
              <option value="first">1st Semester</option>
              <option value="second">2nd Semester</option>
            </select>
          </label>
          <label className="space-y-1 text-sm text-muted-foreground">
            <span className="font-medium text-foreground">Academic Year</span>
            <select className="plpass-field h-10 w-full rounded-md border px-3 text-sm">
              <option value="2026">2026</option>
              <option value="2025">2025</option>
            </select>
          </label>
        </div>
      </section>

      <section className="space-y-4">
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div>
            <h2 className="text-lg font-semibold text-foreground">Event Attendance Prediction</h2>
            <p className="mt-1 text-sm text-muted-foreground">Forecast turnout with a Random Forest view of the most relevant attendance determinants.</p>
          </div>
          <span className="flex items-center gap-2 rounded-full border border-emerald-200 bg-emerald-50 px-3 py-1 text-sm font-medium text-emerald-700">
            <Sparkles className="h-4 w-4" />
            Random Forest
          </span>
        </div>

        <div className="grid gap-6 xl:grid-cols-[1.15fr_0.85fr]">
          <div className="space-y-4">
            <div className="grid gap-4 md:grid-cols-3">
              <article className="rounded-lg border bg-surface p-4 shadow-sm">
                <p className="text-sm font-medium text-muted-foreground">Predicted Turnout</p>
                <p className="mt-2 text-3xl font-semibold text-foreground">{DUMMY_SUMMARY.predictedTurnoutNextEvent.value}%</p>
              </article>
              <article className="rounded-lg border bg-surface p-4 shadow-sm">
                <p className="text-sm font-medium text-muted-foreground">Expected Attendees</p>
                <p className="mt-2 text-3xl font-semibold text-foreground">{Math.round((DUMMY_SUMMARY.totalRegisteredStudents * DUMMY_SUMMARY.predictedTurnoutNextEvent.value) / 100).toLocaleString()}</p>
              </article>
              <article className="rounded-lg border bg-surface p-4 shadow-sm">
                <p className="text-sm font-medium text-muted-foreground">Expected Absentees</p>
                <p className="mt-2 text-3xl font-semibold text-foreground">{Math.round(DUMMY_SUMMARY.totalRegisteredStudents - (DUMMY_SUMMARY.totalRegisteredStudents * DUMMY_SUMMARY.predictedTurnoutNextEvent.value) / 100).toLocaleString()}</p>
              </article>
            </div>

            <ChartPanel title="Prediction Overview" description="Predicted attendance versus expected absence across the current event list.">
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
          </div>

          <aside className="rounded-xl border bg-surface p-4 shadow-sm">
            <div className="flex items-center gap-2">
              <Target className="h-4 w-4 text-primary" />
              <h3 className="text-base font-semibold text-foreground">Ranked attendance factors</h3>
            </div>
            <div className="mt-4 space-y-4">
              {predictionFactors.map((factor) => (
                <div key={factor.name} className="rounded-lg border bg-background p-4">
                  <div className="flex items-center justify-between gap-3">
                    <p className="text-sm font-medium text-foreground">{factor.name}</p>
                    <span className="text-sm font-semibold text-primary">{factor.strength}%</span>
                  </div>
                  <div className="mt-2 h-2 overflow-hidden rounded-full bg-muted">
                    <div className="h-full rounded-full bg-primary" style={{ width: `${factor.strength}%` }} />
                  </div>
                  <p className="mt-2 text-sm text-muted-foreground">{factor.detail}</p>
                </div>
              ))}
            </div>
          </aside>
        </div>
      </section>

      <section className="space-y-4">
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div>
            <h2 className="text-lg font-semibold text-foreground">Attendance Analytics</h2>
            <p className="mt-1 text-sm text-muted-foreground">Review the detailed attendance story behind the dashboard summary with attendance, late, and absence breakdowns.</p>
          </div>
          <span className="rounded-full border border-primary/15 bg-primary/5 px-3 py-1 text-sm font-medium text-primary">Detailed view</span>
        </div>

        <div className="grid gap-6 xl:grid-cols-[1.1fr_0.9fr]">
          <ChartPanel
            title="Attendance Trends"
            description="Attendance rate per session, filterable by event."
            action={
              <select
                className="h-10 rounded-md border bg-background px-3 text-sm text-foreground shadow-sm outline-none transition focus:border-primary focus:ring-2 focus:ring-primary/20"
                value={eventFilter}
                onChange={(event) => setEventFilter(event.target.value)}
                aria-label="Filter attendance trend by event"
              >
                <option value="all">All events</option>
                {DUMMY_EVENTS.map((event) => (
                  <option key={event.code} value={event.code}>
                    {event.code} - {event.title}
                  </option>
                ))}
              </select>
            }
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
            <div className="grid gap-4 sm:grid-cols-2">
              <article className="rounded-lg border bg-surface p-4 shadow-sm">
                <p className="text-sm font-medium text-muted-foreground">Total Present</p>
                <p className="mt-2 text-2xl font-semibold text-foreground">{trendData.reduce((acc, row) => acc + (row.present ?? 0), 0).toLocaleString()}</p>
              </article>
              <article className="rounded-lg border bg-surface p-4 shadow-sm">
                <p className="text-sm font-medium text-muted-foreground">Total Late</p>
                <p className="mt-2 text-2xl font-semibold text-foreground">{trendData.reduce((acc, row) => acc + (row.late ?? 0), 0).toLocaleString()}</p>
              </article>
            </div>
            <article className="rounded-lg border bg-surface p-4 shadow-sm">
              <p className="text-sm font-medium text-muted-foreground">Attendance Summary</p>
              <div className="mt-3 space-y-3">
                <div className="flex items-center justify-between text-sm">
                  <span>Total Absent</span>
                  <span className="font-semibold text-foreground">{trendData.reduce((acc, row) => acc + (row.absent ?? 0), 0).toLocaleString()}</span>
                </div>
                <div className="flex items-center justify-between text-sm">
                  <span>Overall Attendance Rate</span>
                  <span className="font-semibold text-foreground">{Math.round(trendData.reduce((acc, row) => acc + (row.attendanceRate ?? 0), 0) / Math.max(trendData.length, 1))}%</span>
                </div>
              </div>
            </article>
          </div>
        </div>
      </section>

      <section className="space-y-4">
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div>
            <h2 className="text-lg font-semibold text-foreground">Feedback & Objective Insights</h2>
            <p className="mt-1 text-sm text-muted-foreground">Compare the impact of event objectives with sentiment and representative student comments.</p>
          </div>
          <span className="rounded-full border border-amber-200 bg-amber-50 px-3 py-1 text-sm font-medium text-amber-700">VADER + objective ratings</span>
        </div>

        <div className="grid gap-6 xl:grid-cols-2">
          <ChartPanel title="Objective Performance" description="Average objective rating and response volume for each event goal.">
            <div className="space-y-4">
              {objectivePerformance.map((objective) => (
                <div key={objective.label} className="rounded-lg border bg-background p-3">
                  <div className="flex items-center justify-between gap-3">
                    <p className="text-sm font-medium text-foreground">{objective.label}</p>
                    <span className="text-sm font-semibold text-primary">{objective.score.toFixed(1)}/5</span>
                  </div>
                  <div className="mt-2 h-2 overflow-hidden rounded-full bg-muted">
                    <div className="h-full rounded-full bg-primary" style={{ width: `${(objective.score / 5) * 100}%` }} />
                  </div>
                  <p className="mt-2 text-sm text-muted-foreground">{objective.responses} responses</p>
                </div>
              ))}
            </div>
          </ChartPanel>

          <ChartPanel title="Feedback Sentiment" description="Positive, neutral, and negative feedback shares across the selected events.">
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

        <section className="rounded-xl border bg-surface p-4 shadow-sm">
          <div className="flex items-center gap-2">
            <MessageSquareQuote className="h-4 w-4 text-primary" />
            <h3 className="text-base font-semibold text-foreground">Student comments</h3>
          </div>
          <div className="mt-4 grid gap-6 md:grid-cols-3">
            {studentComments.map((item) => (
              <article key={item.comment} className="rounded-lg border bg-background p-4">
                <p className="text-sm font-semibold text-foreground">{item.sentiment}</p>
                <p className="mt-2 text-sm text-muted-foreground">“{item.comment}”</p>
              </article>
            ))}
          </div>
        </section>
      </section>

      <section className="space-y-4">
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div>
            <h2 className="text-lg font-semibold text-foreground">Late Arrival Insights</h2>
            <p className="mt-1 text-sm text-muted-foreground">Identify the reasons students arrive late and quantify how often those causes recur.</p>
          </div>
          <span className="rounded-full border border-amber-200 bg-amber-50 px-3 py-1 text-sm font-medium text-amber-700">Trend watch</span>
        </div>

        <div className="grid gap-6 xl:grid-cols-[1.15fr_0.85fr]">
          <ChartPanel title="Monthly counts" description="Late-arrival frequency across the most recent months in the current view.">
            <ResponsiveContainer width="100%" height="100%">
              <BarChart data={lateArrivalTrend} margin={{ top: 8, right: 12, left: -10, bottom: 4 }}>
                <CartesianGrid strokeDasharray="3 3" vertical={false} />
                <XAxis dataKey="month" fontSize={12} tickLine={false} axisLine={false} />
                <YAxis fontSize={12} tickLine={false} axisLine={false} />
                <Tooltip />
                <Bar dataKey="count" name="Late arrivals" fill="#f59e0b" radius={[6, 6, 0, 0]} />
              </BarChart>
            </ResponsiveContainer>
          </ChartPanel>

          <div className="space-y-4">
            <article className="rounded-xl border bg-surface p-4 shadow-sm">
              <p className="text-sm font-medium text-muted-foreground">Most common late-arrival reason</p>
              <p className="mt-2 text-2xl font-semibold text-foreground">{topLateReason.category}</p>
              <p className="mt-2 text-sm text-muted-foreground">{topLateReason.share}% of late arrivals, highlighting the strongest signal for transport or scheduling interventions.</p>
            </article>
            <article className="rounded-xl border bg-surface p-4 shadow-sm">
              <h3 className="text-base font-semibold text-foreground">Late-arrival categories</h3>
              <div className="mt-4 space-y-3">
              {filteredLateReasons.map((reason) => (
                  <div key={reason.category} className="rounded-lg border bg-background p-3">
                    <div className="flex items-center justify-between gap-3">
                      <p className="text-sm font-medium text-foreground">{reason.category}</p>
                      <span className="text-sm font-semibold text-foreground">{reason.share}%</span>
                    </div>
                    <div className="mt-2 h-2 overflow-hidden rounded-full bg-muted">
                      <div className="h-full rounded-full bg-amber-500" style={{ width: `${reason.share}%` }} />
                    </div>
                  </div>
                ))}
              </div>
            </article>
          </div>
        </div>
      </section>

      <section className="rounded-xl border bg-surface p-5 shadow-sm">
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div>
            <h2 className="text-lg font-semibold text-foreground">Reports</h2>
            <p className="mt-1 text-sm text-muted-foreground">Export the current analytics data or filtered view.</p>
          </div>
          <span className="rounded-full border border-primary/15 bg-primary/5 px-3 py-1 text-sm font-medium text-primary">XLSX / PDF</span>
        </div>

        <div className="mt-8 grid gap-6 md:grid-cols-2">
          <article className="rounded-lg border bg-background p-5">
            <h3 className="font-semibold text-foreground">Attendance Summary Report</h3>
            <p className="mt-2 text-sm text-muted-foreground">Attendance rates, trends, and session summaries.</p>
            <div className="mt-4 flex gap-2">
              <button className="flex items-center gap-2 rounded-md border bg-background px-3 py-2 text-sm font-medium text-foreground hover:bg-muted">
                <Download className="h-4 w-4" />
                XLSX
              </button>
              <button className="flex items-center gap-2 rounded-md border bg-background px-3 py-2 text-sm font-medium text-foreground hover:bg-muted">
                <Download className="h-4 w-4" />
                PDF
              </button>
            </div>
          </article>

          <article className="rounded-lg border bg-background p-4">
            <h3 className="font-semibold text-foreground">Turnout Prediction Report</h3>
            <p className="mt-2 text-sm text-muted-foreground">Predicted turnout, influential factors, and confidence scores.</p>
            <div className="mt-4 flex gap-2">
              <button className="flex items-center gap-2 rounded-md border bg-background px-3 py-2 text-sm font-medium text-foreground hover:bg-muted">
                <Download className="h-4 w-4" />
                XLSX
              </button>
              <button className="flex items-center gap-2 rounded-md border bg-background px-3 py-2 text-sm font-medium text-foreground hover:bg-muted">
                <Download className="h-4 w-4" />
                PDF
              </button>
            </div>
          </article>

          <article className="rounded-lg border bg-background p-4">
            <h3 className="font-semibold text-foreground">Performance & Sentiment Report</h3>
            <p className="mt-2 text-sm text-muted-foreground">Objective performance ratings and sentiment analysis.</p>
            <div className="mt-4 flex gap-2">
              <button className="flex items-center gap-2 rounded-md border bg-background px-3 py-2 text-sm font-medium text-foreground hover:bg-muted">
                <Download className="h-4 w-4" />
                XLSX
              </button>
              <button className="flex items-center gap-2 rounded-md border bg-background px-3 py-2 text-sm font-medium text-foreground hover:bg-muted">
                <Download className="h-4 w-4" />
                PDF
              </button>
            </div>
          </article>

          <article className="rounded-lg border bg-background p-4">
            <h3 className="font-semibold text-foreground">Late Arrival Patterns Report</h3>
            <p className="mt-2 text-sm text-muted-foreground">Late-arrival reasons, frequency, and category breakdown.</p>
            <div className="mt-4 flex gap-2">
              <button className="flex items-center gap-2 rounded-md border bg-background px-3 py-2 text-sm font-medium text-foreground hover:bg-muted">
                <Download className="h-4 w-4" />
                XLSX
              </button>
              <button className="flex items-center gap-2 rounded-md border bg-background px-3 py-2 text-sm font-medium text-foreground hover:bg-muted">
                <Download className="h-4 w-4" />
                PDF
              </button>
            </div>
          </article>
        </div>
      </section>
    </div>
  );
}
