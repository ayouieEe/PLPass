/* eslint-disable react-refresh/only-export-components */
import type { ComponentType, ReactNode } from "react";
import { Building2, CalendarDays, ChevronDown, Clock3, Search, X } from "lucide-react";
import { StatusBadge } from "@/components/feedback/StatusBadge";
import { ErrorState } from "@/components/feedback/ErrorState";
import { ExportButtons } from "@/components/shared/ExportButtons";
import { PageHeader } from "@/components/shared/PageHeader";
import { Button } from "@/components/ui/button";
import { useDevelopmentSession } from "@/hooks/useDevelopmentSession";
import { useAcademicCatalog, useAdminProfiles, useSystemSettings } from "@/hooks/useRepositoryQueries";
import { cn } from "@/lib/utils/cn";
import type { Department, Program, Semester, User } from "@/types/domain";

export type BadgeTone = "success" | "warning" | "danger" | "info" | "muted";
export type AdminContext = { actorUserId: string; actorRole: "admin" };

export type FilterOption = {
  label: string;
  value: string;
};

export function useAdminContext(): { context?: AdminContext; userLabel?: string; userId?: string } {
  const { session } = useDevelopmentSession();
  return {
    context: session?.role === "admin" ? { actorUserId: session.userId, actorRole: "admin" } : undefined,
    userId: session?.userId,
    userLabel: session?.displayName
  };
}

export function useAdminScope() {
  const { context, userLabel, userId } = useAdminContext();
  const profiles = useAdminProfiles({ pageSize: 20 }, context);
  const catalog = useAcademicCatalog({ pageSize: 100 }, context);
  const settings = useSystemSettings(context);

  const profile = profiles.data?.items.find((item) => item.userId === userId) ?? profiles.data?.items[0];
  const departments = catalog.departments.data?.items ?? [];
  const programs = catalog.programs.data?.items ?? [];
  const semesters = catalog.semesters.data?.items ?? [];
  const activeSemester = semesters.find((semester) => semester.id === settings.data?.currentSemesterId) ?? semesters.find((semester) => semester.isActive) ?? semesters[0];
  const department = departments.find((item) => item.id === profile?.departmentId);

  return {
    context,
    userLabel,
    userId,
    profile,
    department,
    departments,
    programs,
    semesters,
    activeSemester,
    settings: settings.data,
    isLoading: profiles.isLoading || catalog.departments.isLoading || catalog.programs.isLoading || catalog.semesters.isLoading || settings.isLoading,
    isError: profiles.isError || catalog.departments.isError || catalog.programs.isError || catalog.semesters.isError || settings.isError
  };
}

export function AdminFrame({ children }: { children: ReactNode }) {
  return <div className="mx-auto w-full max-w-[1500px] space-y-4">{children}</div>;
}

export function AdminAccessError() {
  return <ErrorState title="Admin scope unavailable" message="The signed-in account does not have an assigned Dean profile in the repository response." />;
}

export function AdminPageHeader({
  title,
  accessibleTitle,
  description,
  actions,
  children
}: {
  title: string;
  accessibleTitle?: string;
  description: string;
  actions?: ReactNode;
  children?: ReactNode;
}) {
  return (
    <div className="space-y-3">
      <PageHeader title={title} description={description} actions={actions} />
      {accessibleTitle ? <h1 className="sr-only">{accessibleTitle}</h1> : null}
      {children}
    </div>
  );
}

export function AdminContextBar({
  department,
  semester,
  lastUpdated,
  extra
}: {
  department?: Department;
  semester?: Semester;
  lastUpdated?: string;
  extra?: ReactNode;
}) {
  const contextItems = [
    {
      icon: Building2,
      label: "Scope",
      value: department ? department.name : "Assigned departments"
    },
    semester
      ? {
          icon: CalendarDays,
          label: "Semester",
          value: `${semester.schoolYear} / ${semester.label}`
        }
      : undefined,
    lastUpdated
      ? {
          icon: Clock3,
          label: "Updated",
          value: lastUpdated
        }
      : undefined
  ].filter(Boolean) as Array<{ icon: ComponentType<{ className?: string }>; label: string; value: string }>;

  return (
    <section className="flex flex-col gap-3 rounded-2xl border border-border/70 bg-surface-muted/70 px-4 py-3 text-sm shadow-sm md:flex-row md:items-center md:justify-between" aria-label="Admin scope and academic context">
      <div className="flex flex-wrap gap-2">
        {contextItems.map(({ icon: Icon, label, value }) => (
          <span key={label} className="inline-flex items-center gap-2 rounded-full border border-border bg-surface px-3 py-1.5 text-xs font-medium text-foreground shadow-sm">
            <Icon className="h-3.5 w-3.5 text-primary" aria-hidden="true" />
            <span className="text-muted-foreground">{label}</span>
            <span className="max-w-[16rem] truncate">{value}</span>
          </span>
        ))}
      </div>
      {extra ? <div className="flex flex-wrap items-center gap-2">{extra}</div> : null}
    </section>
  );
}

export function AdminToolbar({
  search,
  searchLabel = "Search records",
  searchPlaceholder = "Search records",
  onSearchChange,
  filters,
  selectedFilter,
  onFilterChange,
  children
}: {
  search?: string;
  searchLabel?: string;
  searchPlaceholder?: string;
  onSearchChange?: (value: string) => void;
  filters?: FilterOption[];
  selectedFilter?: string;
  onFilterChange?: (value: string) => void;
  children?: ReactNode;
}) {
  const filterOptions = filters ?? [];
  const defaultFilter = filterOptions[0]?.value ?? "";
  const hasSearch = typeof search === "string" && onSearchChange;
  const hasFilters = Boolean(filterOptions.length && onFilterChange);
  const hasActiveSearch = Boolean(search?.trim());
  const hasActiveFilter = Boolean(filterOptions.length && selectedFilter && selectedFilter !== defaultFilter);
  const canClear = hasActiveSearch || hasActiveFilter;

  const handleClear = () => {
    onSearchChange?.("");
    if (filterOptions.length) {
      onFilterChange?.(defaultFilter);
    }
  };

  return (
    <section className="rounded-2xl border border-border/80 bg-surface p-3 shadow-sm" aria-label="Admin filters">
      <div className="flex flex-col gap-3 xl:flex-row xl:items-center xl:justify-between">
        {hasSearch ? (
        <div className="relative min-w-0 flex-1 xl:max-w-md">
          <label className="sr-only">{searchLabel}</label>
          <Search className="pointer-events-none absolute left-4 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" aria-hidden="true" />
          <input
            className="plpass-field h-11 w-full rounded-xl border bg-surface pl-11 pr-3 text-sm outline-none"
            value={search}
            placeholder={searchPlaceholder}
            onChange={(event) => onSearchChange(event.target.value)}
          />
        </div>
      ) : <span />}
        <div className="flex flex-col gap-2 sm:flex-row sm:flex-wrap sm:items-center sm:justify-end xl:flex-nowrap">
        {hasFilters ? (
          <label className="relative inline-flex min-w-44 items-center">
            <span className="sr-only">Filter records</span>
            <select
              value={selectedFilter ?? defaultFilter}
              onChange={(event) => onFilterChange?.(event.target.value)}
              className="plpass-field h-11 w-full appearance-none rounded-xl border bg-surface py-0 pl-4 pr-10 text-sm font-medium outline-none"
            >
              {filterOptions.map((filter) => (
                <option key={filter.value} value={filter.value}>{filter.label}</option>
              ))}
            </select>
            <ChevronDown className="pointer-events-none absolute right-3 h-4 w-4 text-muted-foreground" aria-hidden="true" />
          </label>
        ) : null}
        {children}
        {(hasSearch || hasFilters) ? (
          <Button
            type="button"
            variant="outline"
            className="h-11 rounded-xl px-4"
            disabled={!canClear}
            onClick={handleClear}
          >
            <X className="h-4 w-4" aria-hidden="true" />
            Clear
          </Button>
        ) : null}
        </div>
      </div>
    </section>
  );
}

export function AdminTabs<T extends string>({
  label,
  tabs,
  selected,
  onSelect
}: {
  label: string;
  tabs: Array<{ label: string; value: T }>;
  selected: T;
  onSelect: (value: T) => void;
}) {
  return (
    <div className="inline-flex max-w-full flex-wrap gap-1 rounded-2xl border border-border/80 bg-surface-muted p-1 shadow-sm" role="tablist" aria-label={label}>
      {tabs.map((tab) => (
        <button
          key={tab.value}
          type="button"
          role="tab"
          aria-selected={selected === tab.value}
          className={cn(
            "rounded-xl px-3.5 py-2 text-sm font-medium transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring",
            selected === tab.value ? "bg-primary text-primary-foreground shadow-sm" : "text-muted-foreground hover:bg-surface hover:text-foreground"
          )}
          onClick={() => onSelect(tab.value)}
        >
          {tab.label}
        </button>
      ))}
    </div>
  );
}

export function UnavailablePanel({ title, message, actions }: { title: string; message: string; actions?: ReactNode }) {
  return (
    <section className="flex flex-col gap-3 rounded-2xl border border-border bg-surface-muted px-4 py-3 text-sm shadow-sm sm:flex-row sm:items-center sm:justify-between" aria-disabled="true">
      <div>
        <div className="flex flex-wrap items-center gap-2">
          <StatusBadge label="Unavailable" tone="muted" />
          <span className="font-medium text-foreground">{title}</span>
        </div>
        <p className="mt-1 text-sm leading-5 text-muted-foreground">{message}</p>
      </div>
      {actions ? <div className="flex shrink-0 flex-wrap gap-2">{actions}</div> : null}
    </section>
  );
}

export function DetailPanel({ title = "Details", children }: { title?: string; children: ReactNode }) {
  return (
    <section className="max-w-4xl rounded-2xl border border-border/80 bg-surface p-4 shadow-sm">
      <h2 className="text-base font-semibold text-foreground">{title}</h2>
      <div className="mt-2 text-sm leading-6 text-muted-foreground">{children}</div>
    </section>
  );
}

export function AdminSectionCard({
  title,
  description,
  children,
  actions,
  className
}: {
  title?: string;
  description?: string;
  children: ReactNode;
  actions?: ReactNode;
  className?: string;
}) {
  return (
    <section className={cn("rounded-2xl border border-border/80 bg-surface p-4 shadow-sm", className)}>
      {(title || description || actions) ? (
        <div className="mb-3 flex flex-col gap-2 sm:flex-row sm:items-start sm:justify-between">
          <div>
            {title ? <h2 className="text-base font-semibold">{title}</h2> : null}
            {description ? <p className="mt-1 text-sm text-muted-foreground">{description}</p> : null}
          </div>
          {actions ? <div className="flex flex-wrap items-center gap-2">{actions}</div> : null}
        </div>
      ) : null}
      {children}
    </section>
  );
}

export function AdminStatGrid({ children }: { children: ReactNode }) {
  return <section className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4 2xl:grid-cols-6 [&>*]:h-full">{children}</section>;
}

export function AdminTableExportActions({ title = "Export generation requires backend support" }: { title?: string }) {
  return <ExportButtons disabled title={title} />;
}

export function statusTone(status: string): BadgeTone {
  if (["present", "success", "approved", "active", "activated", "ready", "low", "enrolled"].includes(status)) return "success";
  if (["late", "warning", "pending", "processing", "queued", "medium", "maintenance", "part_time"].includes(status)) return "warning";
  if (["absent", "error", "rejected", "failed", "blocked", "lost", "damaged", "critical", "high", "dropped", "archived"].includes(status)) return "danger";
  if (["draft", "info", "inactive", "read", "loa"].includes(status)) return "info";
  return "muted";
}

export function formatStatus(status: string) {
  return status.replace(/_/g, " ").replace(/\b\w/g, (letter) => letter.toUpperCase());
}

export function formatDateTime(value?: string) {
  if (!value) return "Not recorded";
  return new Intl.DateTimeFormat("en", { dateStyle: "medium", timeStyle: "short" }).format(new Date(value));
}

export function formatDate(value?: string) {
  if (!value) return "Not recorded";
  return new Intl.DateTimeFormat("en", { dateStyle: "medium" }).format(new Date(value));
}

export function formatTimeRange(start?: string, end?: string) {
  if (!start || !end) return "Not recorded";
  const formatter = new Intl.DateTimeFormat("en", { timeStyle: "short" });
  return `${formatter.format(new Date(start))} - ${formatter.format(new Date(end))}`;
}

export function maskIdentifier(identifier: string) {
  if (identifier.length <= 6) return "****";
  return `${identifier.slice(0, 3)}-${"*".repeat(Math.max(identifier.length - 6, 4))}-${identifier.slice(-3)}`;
}

export function userName(users: User[], userId?: string) {
  return users.find((user) => user.id === userId)?.displayName ?? "Unassigned";
}

export function departmentName(departments: Department[], departmentId?: string) {
  return departments.find((department) => department.id === departmentId)?.name ?? "Assigned department";
}

export function programLabel(programs: Program[], programId?: string) {
  const program = programs.find((item) => item.id === programId);
  return program ? `${program.code} - ${program.name}` : "Unassigned program";
}

export function compactProgram(programs: Program[], programId?: string) {
  return programs.find((item) => item.id === programId)?.code ?? "Program";
}
