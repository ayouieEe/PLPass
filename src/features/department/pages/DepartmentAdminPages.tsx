import { useEffect, useState } from "react";
import { useLocation } from "react-router-dom";
import { BarChart3, Building2, CalendarDays, ClipboardList, Save, Users } from "lucide-react";
import { PageHeader } from "@/components/shared/PageHeader";
import { LoadingState } from "@/components/feedback/LoadingState";
import { useDevelopmentSession } from "@/hooks/useDevelopmentSession";
import { useAttendanceRecords, useAuditLogs, useDepartmentBranding, useEvents, useReports, useStudents } from "@/hooks/useRepositoryQueries";

function useDepartmentContext() {
  const { session } = useDevelopmentSession();
  return session ? { actorUserId: session.userId, actorRole: session.role } : undefined;
}

function DepartmentEventsPage() {
  const context = useDepartmentContext();
  const query = useEvents({ pageIndex: 0, pageSize: 50, sortBy: "starts_at", sortDirection: "desc" }, context);
  if (query.isLoading) return <LoadingState label="Loading department events…" />;
  return <section className="rounded-2xl border border-border bg-surface p-5 shadow-sm">
    <h2 className="text-lg font-semibold">Department events</h2>
    <p className="mt-1 text-sm text-muted-foreground">Read-only events associated with your assigned department.</p>
    <div className="mt-5 divide-y divide-border rounded-xl border">
      {(query.data?.items ?? []).map((event) => <div key={event.id} className="flex flex-wrap items-center justify-between gap-3 p-4">
        <div><p className="font-semibold">{event.title}</p><p className="text-sm text-muted-foreground">{event.code} · {event.venue}</p></div>
        <span className="rounded-full bg-primary/10 px-3 py-1 text-xs font-semibold capitalize">{event.status}</span>
      </div>)}
      {!query.data?.items.length ? <p className="p-6 text-sm text-muted-foreground">No department events are visible.</p> : null}
    </div>
  </section>;
}

function DepartmentStudentsPage() {
  const context = useDepartmentContext();
  const query = useStudents({ pageIndex: 0, pageSize: 100 }, context);
  if (query.isLoading) return <LoadingState label="Loading department students…" />;
  return <section className="rounded-2xl border border-border bg-surface p-5 shadow-sm">
    <h2 className="text-lg font-semibold">Department students</h2>
    <p className="mt-1 text-sm text-muted-foreground">Only students allowed by the department scope are returned.</p>
    <div className="mt-5 overflow-x-auto rounded-xl border"><table className="w-full text-left text-sm"><thead className="bg-muted/40"><tr><th className="px-4 py-3">Student</th><th className="px-4 py-3">Student ID</th><th className="px-4 py-3">Status</th></tr></thead><tbody className="divide-y divide-border">
      {(query.data?.items ?? []).map((student) => <tr key={student.id}><td className="px-4 py-3 font-medium">{student.fullName || "Unnamed student"}</td><td className="px-4 py-3">{student.studentNumber}</td><td className="px-4 py-3 capitalize">{student.status}</td></tr>)}
      {!query.data?.items.length ? <tr><td colSpan={3} className="p-6 text-sm text-muted-foreground">No students are visible.</td></tr> : null}
    </tbody></table></div>
  </section>;
}

function DepartmentBrandingPage() {
  const { session } = useDevelopmentSession();
  const context = useDepartmentContext();
  const branding = useDepartmentBranding(session?.departmentId, context);
  const [displayName, setDisplayName] = useState("");
  const [primaryColor, setPrimaryColor] = useState("");
  const [secondaryColor, setSecondaryColor] = useState("");
  const [logo, setLogo] = useState<File | null>(null);
  const [removeLogo, setRemoveLogo] = useState(false);

  useEffect(() => {
    if (!branding.data) return;
    setDisplayName(branding.data.displayName ?? "");
    setPrimaryColor(branding.data.primaryColor ?? "");
    setSecondaryColor(branding.data.secondaryColor ?? "");
  }, [branding.data]);

  if (branding.isLoading) return <LoadingState label="Loading department branding…" />;
  return <section className="max-w-3xl rounded-2xl border border-border bg-surface p-5 shadow-sm">
    <h2 className="text-lg font-semibold">Department branding</h2>
    <p className="mt-1 text-sm text-muted-foreground">These values apply to department-scoped presentation and reports. Official department name and code are unchanged.</p>
    <form className="mt-5 grid gap-4" onSubmit={(event) => { event.preventDefault(); void branding.updateMutation.mutateAsync({ displayName, primaryColor, secondaryColor, logo, removeLogo }); }}>
      <label className="text-sm font-medium">Display name<input required value={displayName} onChange={(event) => setDisplayName(event.target.value)} className="mt-1 h-11 w-full rounded-xl border border-border bg-background px-3" /></label>
      <div className="grid gap-4 sm:grid-cols-2"><label className="text-sm font-medium">Primary color<input type="color" value={primaryColor || "#3f7a44"} onChange={(event) => setPrimaryColor(event.target.value)} className="mt-1 h-11 w-full rounded-xl border border-border bg-background p-1" /></label><label className="text-sm font-medium">Secondary color<input type="color" value={secondaryColor || "#e8f1e6"} onChange={(event) => setSecondaryColor(event.target.value)} className="mt-1 h-11 w-full rounded-xl border border-border bg-background p-1" /></label></div>
      <label className="text-sm font-medium">Logo<input type="file" accept="image/png,image/jpeg,image/webp" onChange={(event) => setLogo(event.target.files?.[0] ?? null)} className="mt-1 block w-full rounded-xl border border-border bg-background p-2 text-sm" /></label>
      {branding.data?.logoUrl ? <label className="flex items-center gap-2 text-sm"><input type="checkbox" checked={removeLogo} onChange={(event) => setRemoveLogo(event.target.checked)} />Remove current logo</label> : null}
      <div><button type="submit" disabled={branding.updateMutation.isPending || !session?.departmentId} className="inline-flex items-center rounded-xl bg-primary px-4 py-2.5 text-sm font-semibold text-primary-foreground disabled:opacity-50"><Save className="mr-2 h-4 w-4" />{branding.updateMutation.isPending ? "Saving…" : "Save branding"}</button></div>
    </form>
  </section>;
}

function DepartmentAttendancePage() {
  const context = useDepartmentContext();
  const query = useAttendanceRecords({ pageIndex: 0, pageSize: 100, sortBy: "recorded_at", sortDirection: "desc" }, context);
  if (query.isLoading) return <LoadingState label="Loading department attendance…" />;
  return <section className="rounded-2xl border border-border bg-surface p-5 shadow-sm">
    <h2 className="text-lg font-semibold">Department attendance records</h2>
    <p className="mt-1 text-sm text-muted-foreground">Read-only attendance for events associated with your department.</p>
    <div className="mt-5 overflow-x-auto rounded-xl border"><table className="w-full text-left text-sm"><thead className="bg-muted/40"><tr><th className="px-4 py-3">Student</th><th className="px-4 py-3">Status</th><th className="px-4 py-3">Recorded</th><th className="px-4 py-3">Method</th></tr></thead><tbody className="divide-y divide-border">
      {(query.data?.items ?? []).map((record) => <tr key={record.id}><td className="px-4 py-3 font-medium">{record.studentId}</td><td className="px-4 py-3 capitalize">{record.status}</td><td className="px-4 py-3">{new Date(record.recordedAt).toLocaleString()}</td><td className="px-4 py-3 capitalize">{record.verificationMethod.replace(/_/g, " ")}</td></tr>)}
      {!query.data?.items.length ? <tr><td colSpan={4} className="p-6 text-sm text-muted-foreground">No attendance records are visible.</td></tr> : null}
    </tbody></table></div>
  </section>;
}

function DepartmentAnalyticsPage() {
  const context = useDepartmentContext();
  const query = useAttendanceRecords({ pageIndex: 0, pageSize: 1000 }, context);
  if (query.isLoading) return <LoadingState label="Loading department analytics…" />;
  const records = query.data?.items ?? [];
  const counts = records.reduce<Record<string, number>>((result, record) => { result[record.status] = (result[record.status] ?? 0) + 1; return result; }, {});
  const present = (counts.present ?? 0) + (counts.late ?? 0);
  const rate = records.length ? Math.round((present / records.length) * 100) : 0;
  return <div className="space-y-6"><PageHeader title="Department analytics" description="Read-only attendance insights for your assigned department." />
    <div className="grid gap-4 md:grid-cols-3"><div className="rounded-2xl border border-border bg-surface p-5 shadow-sm"><BarChart3 className="h-5 w-5 text-primary" /><p className="mt-4 text-sm text-muted-foreground">Attendance records</p><p className="text-3xl font-semibold">{records.length}</p></div><div className="rounded-2xl border border-border bg-surface p-5 shadow-sm"><Users className="h-5 w-5 text-primary" /><p className="mt-4 text-sm text-muted-foreground">Present or late</p><p className="text-3xl font-semibold">{present}</p></div><div className="rounded-2xl border border-border bg-surface p-5 shadow-sm"><CalendarDays className="h-5 w-5 text-primary" /><p className="mt-4 text-sm text-muted-foreground">Recorded attendance rate</p><p className="text-3xl font-semibold">{rate}%</p></div></div>
    <section className="rounded-2xl border border-border bg-surface p-5 shadow-sm"><h2 className="text-lg font-semibold">Status breakdown</h2><div className="mt-4 grid gap-3 sm:grid-cols-3">{Object.entries(counts).map(([status, count]) => <div key={status} className="rounded-xl border p-4"><p className="text-sm capitalize text-muted-foreground">{status}</p><p className="text-2xl font-semibold">{count}</p></div>)}{!records.length ? <p className="text-sm text-muted-foreground">No attendance data is available yet.</p> : null}</div></section>
  </div>;
}

function DepartmentReportsPage() {
  const context = useDepartmentContext();
  const query = useReports({ pageIndex: 0, pageSize: 50, sortBy: "created_at", sortDirection: "desc" }, context);
  if (query.isLoading) return <LoadingState label="Loading department reports…" />;
  return <section className="rounded-2xl border border-border bg-surface p-5 shadow-sm"><h2 className="text-lg font-semibold">Department reports</h2><p className="mt-1 text-sm text-muted-foreground">Reports generated by organizers assigned to your department.</p><div className="mt-5 divide-y divide-border rounded-xl border">{(query.data?.items ?? []).map((report) => <div key={report.id} className="flex flex-wrap items-center justify-between gap-3 p-4"><div><p className="font-semibold">{report.title}</p><p className="text-sm text-muted-foreground">{report.scope}</p></div><span className="rounded-full bg-primary/10 px-3 py-1 text-xs font-semibold capitalize">{report.status}</span></div>)}{!query.data?.items.length ? <p className="p-6 text-sm text-muted-foreground">No department reports are visible.</p> : null}</div></section>;
}

function DepartmentAuditLogsPage() {
  const context = useDepartmentContext();
  const query = useAuditLogs({ pageIndex: 0, pageSize: 100, sortBy: "created_at", sortDirection: "desc" }, context);
  if (query.isLoading) return <LoadingState label="Loading department audit logs…" />;
  return <section className="rounded-2xl border border-border bg-surface p-5 shadow-sm"><div className="flex items-center gap-3"><ClipboardList className="h-5 w-5 text-primary" /><div><h2 className="text-lg font-semibold">Department audit logs</h2><p className="mt-1 text-sm text-muted-foreground">Relevant activity for events and attendance in your department.</p></div></div><div className="mt-5 divide-y divide-border rounded-xl border">{(query.data?.items ?? []).map((log) => <div key={log.id} className="p-4"><div className="flex flex-wrap items-center justify-between gap-2"><p className="font-semibold">{log.action}</p><time className="text-xs text-muted-foreground">{new Date(log.timestamp).toLocaleString()}</time></div><p className="mt-1 text-sm text-muted-foreground">{log.targetType}{log.targetId ? ` · ${log.targetId}` : ""}</p></div>)}{!query.data?.items.length ? <p className="p-6 text-sm text-muted-foreground">No department audit activity is visible.</p> : null}</div></section>;
}

function DepartmentOverviewPage() {
  const context = useDepartmentContext();
  const events = useEvents({ pageIndex: 0, pageSize: 50 }, context);
  const students = useStudents({ pageIndex: 0, pageSize: 100 }, context);
  const branding = useDepartmentBranding(useDevelopmentSession().session?.departmentId, context);
  const counts = { events: events.data?.total ?? 0, students: students.data?.total ?? 0 };
  return <div className="space-y-6"><PageHeader title="Department Overview" description="Review scoped department activity without event-control permissions." />
    <div className="grid gap-4 md:grid-cols-2"><div className="rounded-2xl border border-border bg-surface p-5 shadow-sm"><CalendarDays className="h-5 w-5 text-primary" /><p className="mt-4 text-sm text-muted-foreground">Department events</p><p className="text-3xl font-semibold">{counts.events}</p></div><div className="rounded-2xl border border-border bg-surface p-5 shadow-sm"><Users className="h-5 w-5 text-primary" /><p className="mt-4 text-sm text-muted-foreground">Visible students</p><p className="text-3xl font-semibold">{counts.students}</p></div><div className="rounded-2xl border border-border bg-surface p-5 shadow-sm md:col-span-2"><Building2 className="h-5 w-5 text-primary" /><p className="mt-4 text-sm text-muted-foreground">Branding</p><p className="font-semibold">{branding.data?.displayName ?? "Department branding is ready to configure."}</p><p className="mt-1 text-sm text-muted-foreground">No event mutation or attendance-control actions are available in this workspace.</p></div></div></div>;
}

export function DepartmentAdminPage() {
  const { pathname } = useLocation();
  if (pathname === "/department/events") return <DepartmentEventsPage />;
  if (pathname === "/department/students") return <DepartmentStudentsPage />;
  if (pathname === "/department/attendance") return <DepartmentAttendancePage />;
  if (pathname === "/department/analytics") return <DepartmentAnalyticsPage />;
  if (pathname === "/department/reports") return <DepartmentReportsPage />;
  if (pathname === "/department/audit-logs") return <DepartmentAuditLogsPage />;
  if (pathname === "/department/branding") return <DepartmentBrandingPage />;
  return <DepartmentOverviewPage />;
}
