/* eslint-disable @typescript-eslint/no-unused-vars */
import { useCallback, useEffect, useState } from "react";
import type { ColDef, ICellRendererParams } from "ag-grid-community";
import { ClientSideRowModelModule, ModuleRegistry } from "ag-grid-community";
import { AgGridReact } from "ag-grid-react";
import "ag-grid-community/styles/ag-grid.css";
import "ag-grid-community/styles/ag-theme-quartz.css";
import { GraduationCap, LayoutGrid, MapPin, Table2, Users } from "lucide-react";
import { NavLink } from "react-router-dom";
import { toast } from "sonner";
import { EmptyState } from "@/components/feedback/EmptyState";
import { ErrorState } from "@/components/feedback/ErrorState";
import { LoadingState } from "@/components/feedback/LoadingState";
import { StatusBadge } from "@/components/feedback/StatusBadge";
import { PageHeader } from "@/components/shared/PageHeader";
import { StatCard } from "@/components/shared/StatCard";
import { FilterBar } from "@/components/tables/FilterBar";
import { Button } from "@/components/ui/button";
import { GenerateReportModal } from "@/features/reports/GenerateReportModal";
import { useDevelopmentSession } from "@/hooks/useDevelopmentSession";
import { useClasses, useFacultyProfiles, useStudentsForClass } from "@/hooks/useRepositoryQueries";
import { APP_ROUTES } from "@/lib/constants/routes";
import type { RepositoryContext } from "@/services/mock/mockRepositoryUtils";
import type { Class } from "@/types/domain";

// ag-grid v31+ requires modules to be registered before any grid renders. Registering just the
// client-side row model keeps the bundle small; swap for AllCommunityModule if you're already
// pulling in other ag-grid features elsewhere (v33+ only).
ModuleRegistry.registerModules([ClientSideRowModelModule]);

// Local class-merge helper — avoids depending on a "@/lib/utils" that may not exist in this
// project. Falsy/undefined entries are skipped so conditional classes stay easy to write.
function cn(...classes: Array<string | false | null | undefined>) {
  return classes.filter(Boolean).join(" ");
}

/**
 * FIX NOTES (previous version failed to compile):
 * - `useClassEnrollments` and `useClassSchedules` do not exist in useRepositoryQueries — only
 *   `useStudentsForClass(classId, params, context)` (per-class roster) is available. There is no
 *   bulk enrollment-count-per-class or class_schedules endpoint exposed to the client yet.
 * - `Class` already carries a precomputed `scheduleLabel` string (see ClassDetailsPage), so the
 *   custom day/time formatting and schedules map were working against data that doesn't exist
 *   on the client. Schedule now just reads `classRecord.scheduleLabel` directly.
 * - `StatCard` takes `title` / `value` / `icon` / `tone`, not `label` — matches its usage in
 *   ClassDetailsPage.
 *
 * ENROLLMENT COUNTS: since there's no bulk "enrolled count per class" hook, each class's count is
 * fetched via `useStudentsForClass`. To stay within the Rules of Hooks (no hooks in a loop/map
 * inside one component), each class gets its own tiny `EnrollmentProbe` component instance that
 * calls the hook once and reports the count up via a callback. This is a stopgap — ideally the
 * classes list endpoint returns an `enrolledCount` field directly so this extra fan-out of
 * requests isn't needed.
 *
 * GRID PASS: table view now renders through ag-grid (AgGridReact) instead of the bespoke
 * PLPassDataGrid, giving built-in sort/resize/pagination for free. Rows are pre-enriched with
 * `enrolledCount` before being handed to the grid so column defs can stay plain field lookups
 * instead of reaching into external state.
 */

type FacultyScope = {
  context: RepositoryContext;
  facultyId?: string;
  facultyName: string;
  isLoading: boolean;
  isError: boolean;
};

type ClassRow = Class & { enrolledCount: number | null };

// Shared type-scale tokens so cards, tables, and headers stay visually consistent.
const typography = {
  eyebrow: "text-[11px] font-semibold uppercase tracking-wider text-muted-foreground",
  cardTitle: "text-[15px] font-semibold leading-snug tracking-tight text-foreground",
  metaLabel: "text-[11px] font-medium uppercase tracking-wide text-muted-foreground/80",
  metaValue: "text-sm font-medium text-foreground",
  numeric: "tabular-nums font-semibold text-foreground"
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

/** Invisible probe: resolves one class's enrolled headcount and reports it to the parent. */
function EnrollmentProbe({
  classId,
  context,
  onCount
}: {
  classId: string;
  context: RepositoryContext;
  onCount: (classId: string, count: number) => void;
}) {
  const rosterQuery = useStudentsForClass(classId, { pageSize: 200 }, context);
  const count = rosterQuery.data?.items.length;

  useEffect(() => {
    if (count !== undefined) {
      onCount(classId, count);
    }
  }, [classId, count, onCount]);

  return null;
}

function ClassScheduleCard({ classRecord, enrolledCount }: { classRecord: Class; enrolledCount: number | undefined }) {
  return (
    <article className="group flex flex-col overflow-hidden rounded-xl border bg-background shadow-sm transition-all hover:-translate-y-0.5 hover:shadow-md">
      {/* Identity band */}
      <div className="flex items-start justify-between gap-3 px-4 pt-4">
        <div className="min-w-0">
          <p className={typography.eyebrow}>{classRecord.subjectCode}</p>
          <h3 className={cn(typography.cardTitle, "mt-0.5 truncate")}>{classRecord.subjectTitle}</h3>
        </div>
        <StatusBadge label={classRecord.status} tone={classRecord.status === "active" ? "success" : "muted"} />
      </div>

      <div className="mt-3 flex items-center gap-x-3 gap-y-1 px-4 text-sm text-muted-foreground">
        <span className="font-medium text-foreground/80">Sec {classRecord.section}</span>
        <span aria-hidden className="text-muted-foreground/40">
          •
        </span>
        <span className="inline-flex items-center gap-1">
          <MapPin className="h-3.5 w-3.5" aria-hidden />
          {classRecord.room}
        </span>
      </div>

      <hr className="mx-4 mt-4 border-border/70" />

      {/* Metrics band */}
      <div className="grid grid-cols-2 gap-3 px-4 py-3">
        <div>
          <p className={typography.metaLabel}>Schedule</p>
          <p className={cn(typography.metaValue, "mt-0.5")}>{classRecord.scheduleLabel ?? "No schedule set"}</p>
        </div>
        <div className="text-right">
          <p className={typography.metaLabel}>Students</p>
          <p className={cn(typography.numeric, "mt-0.5 text-base")}>{enrolledCount ?? "…"}</p>
        </div>
      </div>

      <div className="mt-auto border-t bg-muted/30 px-4 py-2.5">
        <Button asChild variant="outline" size="sm" className="w-full">
          <NavLink to={APP_ROUTES.facultyClass(classRecord.id)}>View class</NavLink>
        </Button>
      </div>
    </article>
  );
}

export function MyClassesPage() {
  const scope = useFacultyScope();
  const [search, setSearch] = useState("");
  const [status, setStatus] = useState("all");
  const [view, setView] = useState<"table" | "cards">("table");
  const [reportClass, setReportClass] = useState<Class | null>(null);
  const [enrolledCounts, setEnrolledCounts] = useState<Record<string, number>>({});

  const classesQuery = useClasses({ pageSize: 100, search }, scope.context);

  const handleCount = useCallback((classId: string, count: number) => {
    setEnrolledCounts((prev) => (prev[classId] === count ? prev : { ...prev, [classId]: count }));
  }, []);

  if (scope.isLoading) {
    return <LoadingState label="Loading faculty workspace" />;
  }
  if (scope.isError || !scope.facultyId) {
    return <ErrorState title="Faculty profile unavailable" message="The signed-in account does not have a faculty profile." />;
  }
  if (classesQuery.isLoading) {
    return <LoadingState label="Loading assigned classes" />;
  }
  if (classesQuery.isError) {
    return <ErrorState title="Unable to load classes" message="Assigned classes could not be loaded." />;
  }

  const allClasses = classesQuery.data?.items ?? [];
  const classes = allClasses.filter((c) => status === "all" || c.status === status);
  const totalStudents = allClasses.reduce((sum, c) => sum + (enrolledCounts[c.id] ?? 0), 0);
  const activeCount = allClasses.filter((c) => c.status === "active").length;

  // Enrich rows with the async enrollment count so column defs stay simple field lookups.
  const rowData: ClassRow[] = classes.map((c) => ({ ...c, enrolledCount: enrolledCounts[c.id] ?? null }));

  // Plain array, not useMemo — this is built after the early returns above, so wrapping it in a
  // hook would make the hook count vary between renders (Rules of Hooks violation).
  const columnDefs: ColDef<ClassRow>[] = [
      {
        field: "subjectCode",
        headerName: "Subject Code",
        minWidth: 130,
        cellClass: "font-medium text-foreground"
      },
      {
        field: "subjectTitle",
        headerName: "Subject Name",
        flex: 1.6,
        minWidth: 180
      },
      {
        field: "section",
        headerName: "Section",
        maxWidth: 110,
        cellClass: "text-muted-foreground"
      },
      {
        field: "room",
        headerName: "Room",
        maxWidth: 110,
        cellClass: "text-muted-foreground"
      },
      {
        field: "scheduleLabel",
        headerName: "Schedule",
        flex: 1.3,
        minWidth: 160,
        cellClass: "text-muted-foreground",
        valueFormatter: (params) => params.value ?? "No schedule set"
      },
      {
        field: "enrolledCount",
        headerName: "Students",
        maxWidth: 110,
        type: "rightAligned",
        cellClass: "tabular-nums font-medium text-foreground",
        valueFormatter: (params) => (params.value === null || params.value === undefined ? "…" : String(params.value))
      },
      {
        field: "status",
        headerName: "Status",
        maxWidth: 130,
        sortable: true,
        filter: false,
        cellRenderer: (params: ICellRendererParams<ClassRow>) => (
          <StatusBadge label={params.data!.status} tone={params.data!.status === "active" ? "success" : "muted"} />
        )
      },
      {
        headerName: "",
        field: "id",
        minWidth: 220,
        maxWidth: 240,
        sortable: false,
        filter: false,
        resizable: false,
        cellRenderer: (params: ICellRendererParams<ClassRow>) => (
          <div className="flex h-full items-center justify-end gap-2">
            <Button asChild variant="outline" size="sm">
              <NavLink to={APP_ROUTES.facultyClass(params.data!.id)}>View class</NavLink>
            </Button>
            <Button variant="ghost" size="sm" onClick={() => setReportClass(params.data!)}>
              Report
            </Button>
          </div>
        )
      }
  ];

  const defaultColDef: ColDef = { sortable: true, resizable: true, filter: true };

  return (
    <div className="space-y-6">
      {allClasses.map((c) => (
        <EnrollmentProbe key={c.id} classId={c.id} context={scope.context} onCount={handleCount} />
      ))}

      <PageHeader
        eyebrow="Faculty"
        title="My Classes"
        description="Your assigned classes for the current semester, with roster counts and schedules."
      />

      <div className="grid gap-4 sm:grid-cols-3">
        <StatCard title="Assigned classes" value={String(allClasses.length)} icon={GraduationCap} />
        <StatCard title="Active classes" value={String(activeCount)} icon={LayoutGrid} />
        <StatCard title="Total enrolled students" value={String(totalStudents)} icon={Users} />
      </div>

      <div className="flex flex-col gap-3 rounded-lg border bg-surface p-3 sm:flex-row sm:items-center sm:justify-between">
        <FilterBar
          search={search}
          selectedFilter={status}
          filters={[
            { label: "All", value: "all" },
            { label: "Active", value: "active" },
            { label: "Inactive", value: "inactive" },
            { label: "Completed", value: "completed" }
          ]}
          onSearchChange={setSearch}
          onFilterChange={setStatus}
        />

        {/* Segmented view switch */}
        <div className="inline-flex shrink-0 items-center gap-1 self-start rounded-md border bg-background p-1 sm:self-auto">
          <button
            type="button"
            onClick={() => setView("table")}
            aria-pressed={view === "table"}
            className={cn(
              "inline-flex items-center gap-1.5 rounded-sm px-2.5 py-1.5 text-sm font-medium transition-colors",
              view === "table" ? "bg-primary text-primary-foreground shadow-sm" : "text-muted-foreground hover:text-foreground"
            )}
          >
            <Table2 className="h-4 w-4" /> Table
          </button>
          <button
            type="button"
            onClick={() => setView("cards")}
            aria-pressed={view === "cards"}
            className={cn(
              "inline-flex items-center gap-1.5 rounded-sm px-2.5 py-1.5 text-sm font-medium transition-colors",
              view === "cards" ? "bg-primary text-primary-foreground shadow-sm" : "text-muted-foreground hover:text-foreground"
            )}
          >
            <LayoutGrid className="h-4 w-4" /> Cards
          </button>
        </div>
      </div>

      {classes.length === 0 ? (
        <EmptyState title="No assigned classes" description="Classes assigned to you this semester will appear here." />
      ) : view === "table" ? (
        <div
          className="ag-theme-quartz overflow-hidden rounded-lg border shadow-sm"
          style={{ height: 480, width: "100%", ...gridThemeVars }}
        >
          <AgGridReact<ClassRow>
            theme="legacy"
            rowData={rowData}
            columnDefs={columnDefs}
            defaultColDef={defaultColDef}
            rowHeight={52}
            headerHeight={44}
            animateRows
            pagination
            paginationPageSize={10}
            paginationPageSizeSelector={[10, 25, 50]}
          />
        </div>
      ) : (
        <section className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
          {classes.map((classRecord) => (
            <ClassScheduleCard key={classRecord.id} classRecord={classRecord} enrolledCount={enrolledCounts[classRecord.id]} />
          ))}
        </section>
      )}

      <GenerateReportModal
        open={Boolean(reportClass)}
        reportName={reportClass ? `Class attendance — ${reportClass.subjectCode}` : ""}
        onClose={() => setReportClass(null)}
        onGenerate={() => {
          if (reportClass) {
            toast.success(`Queued report for ${reportClass.subjectCode}`);
          }
          setReportClass(null);
        }}
      />
    </div>
  );
}