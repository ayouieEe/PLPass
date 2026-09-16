import { useMemo } from "react";
import { NavLink } from "react-router-dom";
import { BarChart3, CalendarDays, ClipboardList, Settings, ShieldCheck, Users, type LucideIcon } from "lucide-react";
import { PageHeader } from "@/components/shared/PageHeader";
import { EmptyState } from "@/components/feedback/EmptyState";
import { useDevelopmentSession } from "@/hooks/useDevelopmentSession";
import { useAcademicCatalog, useAuditLogs, useAttendanceRecords, useEvents, useReports, useUsers } from "@/hooks/useRepositoryQueries";
import { APP_ROUTES } from "@/lib/constants/routes";

function useAdminContext() {
  const { session } = useDevelopmentSession();
  return useMemo(() => session ? { actorUserId: session.userId, actorRole: session.role } : undefined, [session]);
}

export function AdminDashboardPage() {
  const context = useAdminContext();
  const users = useUsers({ pageSize: 1 }, context);
  const events = useEvents({ pageSize: 1 }, context);
  const records = useAttendanceRecords({ pageSize: 1 }, context);
  const cards: Array<{ label: string; value?: number; path: string; icon: LucideIcon }> = [
    { label: "Users", value: users.data?.total, path: APP_ROUTES.adminUsers, icon: Users },
    { label: "Events", value: events.data?.total, path: APP_ROUTES.adminEvents, icon: CalendarDays },
    { label: "Attendance Records", value: records.data?.total, path: APP_ROUTES.adminAttendance, icon: ClipboardList },
    { label: "System Health", path: APP_ROUTES.adminSystemHealth, icon: ShieldCheck }
  ];
  return <div className="space-y-5">
    <PageHeader title="Admin Dashboard" description="Institution-wide operational overview and administration." />
    <section className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
      {cards.map(({ label, value, path, icon: Icon }) => <NavLink key={label} to={path} className="rounded-lg border bg-surface p-5 shadow-sm hover:border-primary/40"><Icon className="h-5 w-5 text-primary" aria-hidden="true" /><p className="mt-4 text-xs uppercase tracking-wide text-muted-foreground">{label}</p><p className="mt-1 text-3xl font-semibold">{value ?? "—"}</p></NavLink>)}
    </section>
    <section className="grid gap-4 md:grid-cols-3">
      <NavLink to={APP_ROUTES.adminAnalytics} className="rounded-lg border bg-surface p-5"><BarChart3 className="h-5 w-5 text-primary" /><h2 className="mt-3 font-semibold">Global Analytics</h2><p className="mt-1 text-sm text-muted-foreground">Review institution-wide attendance, event, and feedback trends.</p></NavLink>
      <NavLink to={APP_ROUTES.adminAuditLogs} className="rounded-lg border bg-surface p-5"><ClipboardList className="h-5 w-5 text-primary" /><h2 className="mt-3 font-semibold">Audit & Security</h2><p className="mt-1 text-sm text-muted-foreground">Trace administrative and operational actions across PLPass.</p></NavLink>
      <NavLink to={APP_ROUTES.adminSettings} className="rounded-lg border bg-surface p-5"><Settings className="h-5 w-5 text-primary" /><h2 className="mt-3 font-semibold">System Configuration</h2><p className="mt-1 text-sm text-muted-foreground">Manage institution-wide policies and operational defaults.</p></NavLink>
    </section>
  </div>;
}

type AdminResourcePageProps = { title: string; description: string; kind: "users" | "events" | "records" | "reports" | "audit" | "catalog" };

export function AdminResourcePage({ title, description, kind }: AdminResourcePageProps) {
  const context = useAdminContext();
  const users = useUsers({ pageSize: 10 }, context);
  const events = useEvents({ pageSize: 10 }, context);
  const records = useAttendanceRecords({ pageSize: 10 }, context);
  const reports = useReports({ pageSize: 10 }, context);
  const audit = useAuditLogs({ pageSize: 10 }, context);
  const catalog = useAcademicCatalog({ pageSize: 10 }, context);
  const result = kind === "users" ? users.data : kind === "events" ? events.data : kind === "records" ? records.data : kind === "reports" ? reports.data : kind === "audit" ? audit.data : catalog.departments.data;
  const items = result?.items ?? [];
  return <div className="space-y-5"><PageHeader title={title} description={description} /><section className="rounded-lg border bg-surface p-5 shadow-sm"><p className="text-sm text-muted-foreground">{result ? `${result.total.toLocaleString()} records available to administrators.` : "Loading administrative data…"}</p>{result && !items.length ? <div className="mt-5"><EmptyState title="No records found" description="There are no records available for this section yet." /></div> : <div className="mt-5 space-y-2">{items.map((item, index) => <div key={String((item as { id?: string }).id ?? index)} className="rounded-md border bg-background px-4 py-3 text-sm">{String((item as { title?: string; displayName?: string; action?: string; code?: string }).title ?? (item as { displayName?: string }).displayName ?? (item as { action?: string }).action ?? (item as { code?: string }).code ?? `Record ${index + 1}`)}</div>)}</div>}</section></div>;
}

export const AdminUsersPage = () => <AdminResourcePage kind="users" title="Users" description="Manage Student, Organizer, and Admin accounts." />;
export const AdminEventsPage = () => <AdminResourcePage kind="events" title="Events" description="View and manage all events and approvals." />;
export const AdminAttendancePage = () => <AdminResourcePage kind="records" title="Attendance Records" description="Review attendance sessions and records across all events." />;
export const AdminReportsPage = () => <AdminResourcePage kind="reports" title="Reports" description="Review generated reports across all scopes." />;
export const AdminAuditLogsPage = () => <AdminResourcePage kind="audit" title="Audit Logs" description="Review all system activity and administrative actions." />;
export const AdminCatalogsPage = () => <AdminResourcePage kind="catalog" title="Academic Catalogs" description="Manage departments, programs, sections, semesters, and event categories." />;
export const AdminCredentialsPage = () => <AdminResourcePage kind="users" title="Credential Management" description="Manage student QR and facial credential operations." />;
