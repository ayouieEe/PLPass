/* eslint-disable react-refresh/only-export-components */
import type { ReactNode } from "react";
import { StatusBadge } from "@/components/feedback/StatusBadge";
import { ErrorState } from "@/components/feedback/ErrorState";
import { PageHeader } from "@/components/shared/PageHeader";
import { SearchInput } from "@/components/shared/SearchInput";
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
  return <div className="space-y-6">{children}</div>;
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
    <div className="space-y-4">
      <PageHeader
        eyebrow="Dean Admin"
        title={title}
        description={description}
        actions={actions}
      />
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
  return (
    <section className="flex flex-col gap-3 rounded-lg border bg-surface p-3 text-sm md:flex-row md:items-center md:justify-between" aria-label="Admin scope and academic context">
      <div className="flex flex-wrap gap-2">
        <StatusBadge label={`Scope: ${department ? department.name : "Assigned Dean departments"}`} tone="info" />
        {semester ? <StatusBadge label={`${semester.schoolYear} / ${semester.label}`} tone="muted" /> : null}
        {lastUpdated ? <StatusBadge label={`Last updated: ${lastUpdated}`} tone="muted" /> : null}
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
  return (
    <section className="flex flex-col gap-3 rounded-lg border bg-surface p-3 lg:flex-row lg:items-center lg:justify-between" aria-label="Admin filters">
      {typeof search === "string" && onSearchChange ? (
        <div className="min-w-0 flex-1 lg:max-w-sm">
          <label className="sr-only">{searchLabel}</label>
          <SearchInput value={search} placeholder={searchPlaceholder} onChange={onSearchChange} />
        </div>
      ) : <span />}
      <div className="flex flex-wrap items-center gap-2">
        {filters?.map((filter) => (
          <Button
            key={filter.value}
            type="button"
            variant="outline"
            size="sm"
            className={cn(selectedFilter === filter.value && "plpass-filter-selected")}
            onClick={() => onFilterChange?.(filter.value)}
          >
            {filter.label}
          </Button>
        ))}
        {children}
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
    <div className="flex flex-wrap gap-2 rounded-lg border bg-surface p-2" role="tablist" aria-label={label}>
      {tabs.map((tab) => (
        <button
          key={tab.value}
          type="button"
          role="tab"
          aria-selected={selected === tab.value}
          className={cn(
            "rounded-md px-3 py-2 text-sm font-medium transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring",
            selected === tab.value ? "bg-primary text-primary-foreground" : "text-muted-foreground hover:bg-primary-hover hover:text-primary-foreground"
          )}
          onClick={() => onSelect(tab.value)}
        >
          {tab.label}
        </button>
      ))}
    </div>
  );
}

export function UnavailablePanel({ title, message }: { title: string; message: string }) {
  return (
    <section className="rounded-lg border bg-surface-muted p-5" aria-disabled="true">
      <StatusBadge label="Unavailable" tone="muted" />
      <h2 className="mt-3 text-lg font-semibold">{title}</h2>
      <p className="mt-2 text-sm leading-6 text-muted-foreground">{message}</p>
    </section>
  );
}

export function DetailPanel({ title = "Details", children }: { title?: string; children: ReactNode }) {
  return (
    <section className="rounded-lg border bg-surface p-4">
      <h2 className="font-semibold">{title}</h2>
      <div className="mt-2 text-sm text-muted-foreground">{children}</div>
    </section>
  );
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
