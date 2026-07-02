/* eslint-disable @typescript-eslint/no-unused-vars */
import { useState } from "react";
import type { ColDef, ICellRendererParams } from "ag-grid-community";
import { ClientSideRowModelModule, ModuleRegistry } from "ag-grid-community";
import { AgGridReact } from "ag-grid-react";
import "ag-grid-community/styles/ag-grid.css";
import "ag-grid-community/styles/ag-theme-quartz.css";
import { AlertTriangle, CalendarCheck, ClipboardList, FileDown, Users } from "lucide-react";
import { Navigate, NavLink, useParams } from "react-router-dom";
import { toast } from "sonner";
import { AttendanceTrendChart } from "@/components/charts/AttendanceTrendChart";
import { ErrorState } from "@/components/feedback/ErrorState";
import { LoadingState } from "@/components/feedback/LoadingState";
import { StatusBadge } from "@/components/feedback/StatusBadge";
import { PageHeader } from "@/components/shared/PageHeader";
import { StatCard } from "@/components/shared/StatCard";
import { Button } from "@/components/ui/button";
import { GenerateReportModal } from "@/features/reports/GenerateReportModal";
import { useDevelopmentSession } from "@/hooks/useDevelopmentSession";
import {
  useAcademicCatalog,
  useAttendanceRecords,
  useAttendanceSessions,
  useClass,
  useFacultyProfiles,
  useMlPredictions,
  useStudentsForClass
} from "@/hooks/useRepositoryQueries";
import { APP_ROUTES } from "@/lib/constants/routes";
import type { RepositoryContext } from "@/services/mock/mockRepositoryUtils";
import type { AttendanceRecord, AttendanceSession, Class, MlPrediction, Program, Student } from "@/types/domain";
import type { AttendanceStatus, CorrectionRequestStatus, RiskLevel, SessionStatus, StudentStatus } from "@/types/enums";

// ag-grid v31+ requires modules to be registered before any grid renders. Registering just the
// client-side row model keeps the bundle small; swap for AllCommunityModule if you're already
// pulling in other ag-grid features elsewhere (v33+ only).
ModuleRegistry.registerModules([ClientSideRowModelModule]);

// Local class-merge helper — avoids depending on a "@/lib/utils" that may not exist in this
// project. Falsy/undefined entries are skipped so conditional classes stay easy to write.
function cn(...classes: Array<string | false | null | undefined>) {
  return classes.filter(Boolean).join(" ");
}

type FacultyScope = {
  context: RepositoryContext;
  facultyId?: string;
  facultyName: string;
  isLoading: boolean;
  isError: boolean;
};

const dateFormatter = new Intl.DateTimeFormat("en-US", { month: "short", day: "numeric", year: "numeric" });
const timeFormatter = new Intl.DateTimeFormat("en-US", { hour: "2-digit", minute: "2-digit" });

const TABS = [
  { value: "roster", label: "Roster" },
  { value: "sessions", label: "Recent sessions" },
  { value: "summary", label: "Attendance summary" },
  { value: "info", label: "Class information" }
] as const;

// Shared type-scale tokens — keep the roster, sessions, and info tab reading as one voice.
const typography = {
  eyebrow: "text-[11px] font-semibold uppercase tracking-wider text-muted-foreground",
  sectionTitle: "text-lg font-semibold tracking-tight text-foreground",
  metaLabel: "text-[11px] font-medium uppercase tracking-wide text-muted-foreground/80",
  metaValue: "text-sm font-medium text-foreground"
};

// Maps ag-grid's theming API onto the app's existing shadcn/Tailwind CSS variables so the grid
// doesn't look like a foreign component dropped onto the page. Assumes those HSL custom
// properties exist globally (they do in a standard shadcn setup) — adjust if your token names differ.
const gridThemeVars = {
  "--ag-background-color": "hsl(var(--background))",
  "--ag-foreground-color": "hsl(var(--foreground))",
  "--ag-header-background-color": "hsl(var(--muted))",
  "--ag-header-foreground-color": "hsl(var(--muted-foreground))",
  "--ag-border-color": "hsl(var(--border))",
  "--ag-row-border-color": "hsl(var(--border))",
  "--ag-row-hover-color": "hsl(var(--muted) / 0.5)",
  "--ag-selected-row-background-color": "hsl(var(--muted))",
  "--ag-accent-color": "hsl(var(--primary))",
  "--ag-font-family": "inherit",
  "--ag-font-size": "13.5px",
  "--ag-header-font-weight": "600",
  "--ag-border-radius": "0.5rem",
  "--ag-wrapper-border-radius": "0.5rem"
} as React.CSSProperties;

function useFacultyScope(): FacultyScope {
  const { session } = useDevelopmentSession();
  const context = session ? { actorUserId: session.userId, actorRole: session.role } : undefined;
  const facultyQuery = useFacultyProfiles({ pageSize: 1 }, context);
  return {
    context: context ?? { actorUserId: "", actorRole: "faculty" },
    facultyId: facultyQuery.data?.items[0]?.id,
    facultyName: session?.displayName ?? "Faculty",
    isLoading: facultyQuery.isLoading,
    isError: facultyQuery.isError
  };
}

function formatDate(value: string | undefined) {
  return value ? dateFormatter.format(new Date(value)) : "Not scheduled";
}

function formatTime(value: string | undefined) {
  return value ? timeFormatter.format(new Date(value)) : "Not set";
}

function statusTone(status: AttendanceStatus | SessionStatus | CorrectionRequestStatus | StudentStatus | RiskLevel) {
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

function recordsForSession(records: AttendanceRecord[], sessionId: string) {
  return records.filter((record) => record.sessionId === sessionId);
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

/**
 * The roster grid needs the student's actual name, not their student number. `types/domain.ts`
 * wasn't available to confirm the exact field name on `Student`, so this checks the common
 * candidates (a combined `fullName`, separate `firstName`/`lastName`, or a generic `name`) rather
 * than guessing one and risking another "property does not exist" TS error. Falls back to the
 * student number only if none of those fields are present, and to a placeholder if there's no
 * student at all. Replace with `student.<actualField>` directly once confirmed from types/domain.ts.
 */
function studentName(student: Student | undefined) {
  if (!student) {
    return "Unknown student";
  }
  const candidate = student as unknown as {
    fullName?: string;
    firstName?: string;
    lastName?: string;
    name?: string;
  };
  if (candidate.fullName) {
    return candidate.fullName;
  }
  if (candidate.firstName || candidate.lastName) {
    return [candidate.firstName, candidate.lastName].filter(Boolean).join(" ");
  }
  return candidate.name ?? student.studentNumber;
}

/**
 * `Program` doesn't have a `programName` field (TS: "Property 'programName' does not exist on
 * type 'Program'"), so the real field name isn't confirmed here. This checks the common
 * candidates rather than guessing one and risking another round of the same error — replace with
 * `program.<actualField>` directly once you confirm it from types/domain.ts.
 */
function programDisplayName(program: Program): string {
  const candidate = program as unknown as { programName?: string; name?: string; title?: string; programCode?: string };
  return candidate.programName ?? candidate.name ?? candidate.title ?? candidate.programCode ?? "—";
}

type RosterRow = Student & {
  displayName: string;
  programName: string;
  rate: number;
  risk: MlPrediction | undefined;
};

type SessionRow = AttendanceSession & {
  dateLabel: string;
  startLabel: string;
  endLabel: string;
  present: number;
  late: number;
  absent: number;
  excused: number;
};

export function ClassDetailsPage() {
  const { classId } = useParams();
  const scope = useFacultyScope();

  // Guard early: a malformed link (no classId in the URL) should never reach the data hooks.
  if (!classId) {
    return <Navigate to={APP_ROUTES.facultyClasses} replace />;
  }

  const classQuery = useClass(classId, scope.context);
  const rosterQuery = useStudentsForClass(classId, { pageSize: 200 }, scope.context);
  const sessionsQuery = useAttendanceSessions({ classId, pageSize: 100 }, scope.context);
  const recordsQuery = useAttendanceRecords({ classId, pageSize: 500 }, scope.context);
  const catalogQuery = useAcademicCatalog({}, scope.context);
  const predictionsQuery = useMlPredictions({ classId }, scope.context);
  const [tab, setTab] = useState<(typeof TABS)[number]["value"]>("roster");
  const [reportOpen, setReportOpen] = useState(false);

  if (scope.isLoading) {
    return <LoadingState label="Loading faculty workspace" />;
  }
  if (scope.isError || !scope.facultyId) {
    return <ErrorState title="Faculty profile unavailable" message="The signed-in mock account does not have a faculty profile fixture." />;
  }
  if (classQuery.isLoading || rosterQuery.isLoading || sessionsQuery.isLoading || recordsQuery.isLoading) {
    return <LoadingState label="Loading class details" />;
  }
  if (classQuery.isError || !classQuery.data) {
    return <ErrorState title="Class unavailable" message="This class was not found or is outside your assigned classes." />;
  }

  const classRecord = classQuery.data;
  const roster = rosterQuery.data?.items ?? [];
  const sessions = sessionsQuery.data?.items ?? [];
  const records = recordsQuery.data?.items ?? [];
  const programsById = new Map(
    (catalogQuery.programs.data?.items ?? []).map((program: Program) => [program.id, programDisplayName(program)])
  );
  const riskByStudent = new Map((predictionsQuery.data?.items ?? []).map((p: MlPrediction) => [p.studentId, p]));
  const flaggedCount = records.filter((record) => record.status === "absent").length;
  const completedSessionCount = sessions.filter((session) => session.status === "completed").length;

  // Pre-enrich rows so column defs are plain field lookups instead of reaching into closures.
  const rosterRows: RosterRow[] = roster.map((student) => ({
    ...student,
    displayName: studentName(student),
    programName: programsById.get(student.programId) ?? "—",
    rate: attendanceRate(records.filter((record) => record.studentId === student.id)),
    risk: riskByStudent.get(student.id)
  }));

  const sessionRows: SessionRow[] = sessions.map((session) => ({
    ...session,
    dateLabel: formatDate(session.startsAt),
    startLabel: formatTime(session.startsAt),
    endLabel: formatTime(session.endsAt),
    ...attendanceCounts(recordsForSession(records, session.id))
  }));

  // Plain arrays, not useMemo — built after the early returns above, so a hook here would make
  // the hook count vary between renders (Rules of Hooks violation).
  const rosterColumnDefs: ColDef<RosterRow>[] = [
      { field: "displayName", headerName: "Student name", minWidth: 160, cellClass: "font-medium text-foreground" },
      { field: "studentNumber", headerName: "Student number", minWidth: 150, cellClass: "tabular-nums text-muted-foreground" },
      { field: "programName", headerName: "Program", minWidth: 160, cellClass: "text-muted-foreground" },
      { field: "yearLevel", headerName: "Year level", maxWidth: 120, cellClass: "text-muted-foreground" },
      { field: "section", headerName: "Section", maxWidth: 110, cellClass: "text-muted-foreground" },
      {
        field: "status",
        headerName: "Student status",
        maxWidth: 150,
        filter: false,
        cellRenderer: (params: ICellRendererParams<RosterRow>) => (
          <StatusBadge label={params.data!.status} tone={statusTone(params.data!.status)} />
        )
      },
      {
        field: "rate",
        headerName: "Attendance rate",
        maxWidth: 150,
        type: "rightAligned",
        cellClass: "tabular-nums font-semibold text-foreground",
        valueFormatter: (params) => `${params.value}%`
      },
      {
        field: "risk",
        headerName: "Risk level",
        maxWidth: 140,
        filter: false,
        cellRenderer: (params: ICellRendererParams<RosterRow>) =>
          params.data!.risk ? (
            <StatusBadge label={params.data!.risk.riskLevel} tone={statusTone(params.data!.risk.riskLevel)} />
          ) : (
            <span className="text-xs text-muted-foreground/70">Not scored</span>
          )
      }
  ];

  const sessionColumnDefs: ColDef<SessionRow>[] = [
      { field: "dateLabel", headerName: "Session date", minWidth: 150, cellClass: "font-medium text-foreground" },
      { field: "startLabel", headerName: "Start time", maxWidth: 130, cellClass: "tabular-nums text-muted-foreground" },
      { field: "endLabel", headerName: "End time", maxWidth: 130, cellClass: "tabular-nums text-muted-foreground" },
      {
        field: "status",
        headerName: "Status",
        maxWidth: 140,
        filter: false,
        cellRenderer: (params: ICellRendererParams<SessionRow>) => (
          <StatusBadge label={params.data!.status} tone={statusTone(params.data!.status)} />
        )
      },
      {
        field: "present",
        headerName: "Present",
        maxWidth: 110,
        type: "rightAligned",
        cellClass: "tabular-nums font-medium text-success"
      },
      {
        field: "late",
        headerName: "Late",
        maxWidth: 100,
        type: "rightAligned",
        cellClass: "tabular-nums font-medium text-warning"
      },
      {
        field: "absent",
        headerName: "Absent",
        maxWidth: 110,
        type: "rightAligned",
        cellClass: "tabular-nums font-medium text-danger"
      },
      {
        headerName: "",
        field: "id",
        minWidth: 160,
        maxWidth: 180,
        sortable: false,
        filter: false,
        resizable: false,
        cellRenderer: (params: ICellRendererParams<SessionRow>) => (
          <div className="flex h-full items-center justify-end">
            <Button asChild variant="outline" size="sm">
              <NavLink to={APP_ROUTES.facultySession(params.data!.id)}>View session</NavLink>
            </Button>
          </div>
        )
      }
  ];

  const defaultColDef: ColDef = { sortable: true, resizable: true, filter: true };

  return (
    <div className="space-y-6">
      <PageHeader
        eyebrow="Class Details"
        title={`${classRecord.subjectCode} - ${classRecord.subjectTitle}`}
        description={`${classRecord.section} · ${classRecord.room} · ${classRecord.scheduleLabel}`}
        actions={
          <div className="flex gap-2">
            <Button variant="outline" onClick={() => setReportOpen(true)}>
              <FileDown className="mr-1.5 h-4 w-4" /> Generate report
            </Button>
            <Button asChild>
              <NavLink to={`${APP_ROUTES.facultyStartSession}?classId=${classId}`}>Start session</NavLink>
            </Button>
          </div>
        }
      />

      <section className="grid gap-4 md:grid-cols-2 xl:grid-cols-4">
        <StatCard title="Enrolled students" value={String(roster.length)} icon={Users} />
        <StatCard title="Completed sessions" value={String(completedSessionCount)} icon={ClipboardList} />
        <StatCard title="Average attendance" value={`${attendanceRate(records)}%`} icon={CalendarCheck} />
        <StatCard
          title="Flagged students"
          value={String(flaggedCount)}
          icon={AlertTriangle}
          tone={flaggedCount ? "warning" : "success"}
        />
      </section>

      {/* Underlined tab navigation instead of a row of buttons — reads as one connected control */}
      <div role="tablist" aria-label="Class details sections" className="flex gap-6 border-b">
        {TABS.map((item) => (
          <button
            key={item.value}
            type="button"
            role="tab"
            aria-selected={tab === item.value}
            onClick={() => setTab(item.value)}
            className={cn(
              "relative -mb-px border-b-2 px-1 pb-3 text-sm font-medium transition-colors",
              tab === item.value
                ? "border-primary text-foreground"
                : "border-transparent text-muted-foreground hover:text-foreground"
            )}
          >
            {item.label}
          </button>
        ))}
      </div>

      {tab === "roster" ? (
        <div
          className="ag-theme-quartz overflow-hidden rounded-lg border shadow-sm"
          style={{ height: 480, width: "100%", ...gridThemeVars }}
        >
          <AgGridReact<RosterRow>
            theme="legacy"
            rowData={rosterRows}
            columnDefs={rosterColumnDefs}
            defaultColDef={defaultColDef}
            rowHeight={52}
            headerHeight={44}
            animateRows
            pagination
            paginationPageSize={10}
            paginationPageSizeSelector={[10, 25, 50]}
          />
        </div>
      ) : null}

      {tab === "sessions" ? (
        <div
          className="ag-theme-quartz overflow-hidden rounded-lg border shadow-sm"
          style={{ height: 480, width: "100%", ...gridThemeVars }}
        >
          <AgGridReact<SessionRow>
            theme="legacy"
            rowData={sessionRows}
            columnDefs={sessionColumnDefs}
            defaultColDef={defaultColDef}
            rowHeight={52}
            headerHeight={44}
            animateRows
            pagination
            paginationPageSize={10}
            paginationPageSizeSelector={[10, 25, 50]}
          />
        </div>
      ) : null}

      {tab === "summary" ? (
        <AttendanceTrendChart
          data={sessions.map((session) => ({
            label: formatDate(session.startsAt),
            ...attendanceCounts(recordsForSession(records, session.id))
          }))}
        />
      ) : null}

      {tab === "info" ? (
        <section className="rounded-xl border bg-surface p-5">
          <h2 className={cn(typography.sectionTitle, "mb-4")}>Class information</h2>
          <dl className="grid gap-3 md:grid-cols-2 xl:grid-cols-3">
            {[
              ["Subject code", classRecord.subjectCode],
              ["Subject name", classRecord.subjectTitle],
              ["Faculty", scope.facultyName],
              ["Room", classRecord.room],
              ["Schedule", classRecord.scheduleLabel],
              ["Semester", classRecord.semesterId],
              ["Class status", classRecord.status]
            ].map(([label, value]) => (
              <div key={label} className="rounded-lg border bg-background p-3">
                <dt className={typography.metaLabel}>{label}</dt>
                <dd className={cn(typography.metaValue, "mt-1 text-[15px]")}>{value}</dd>
              </div>
            ))}
          </dl>
        </section>
      ) : null}

      <GenerateReportModal
        open={reportOpen}
        reportName={`Class attendance — ${classRecord.subjectCode}`}
        onClose={() => setReportOpen(false)}
        onGenerate={() => {
          toast.success(`Queued report for ${classRecord.subjectCode}`);
          setReportOpen(false);
        }}
      />
    </div>
  );
}