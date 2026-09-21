import { useEffect, useState } from "react";
import { useLocation } from "react-router-dom";
import { Activity, AlertTriangle, BarChart3, Building2, CalendarDays, CheckCircle2, ClipboardList, Download, RefreshCw, Save, ShieldCheck, Users, UserCheck, Filter, Search, CalendarCheck } from "lucide-react";
import { NavLink } from "react-router-dom";
import type { ColDef } from "ag-grid-community";
import { Bar, BarChart, CartesianGrid, Cell, Pie, PieChart, ResponsiveContainer, Tooltip, XAxis, YAxis } from "recharts";
import { PLPassDataGrid } from "@/components/data-display/PLPassDataGrid";
import { Button } from "@/components/ui/button";
import { PageHeader } from "@/components/shared/PageHeader";
import { LoadingState } from "@/components/feedback/LoadingState";
import { ErrorState } from "@/components/feedback/ErrorState";
import { useDevelopmentSession } from "@/hooks/useDevelopmentSession";
import { useAttendanceRecords, useAttendanceSessions, useAuditLogs, useDepartmentBranding, useEvents, useOrganizerProfiles, useReports, useStudents } from "@/hooks/useRepositoryQueries";
import { AuthenticationMethodsPage } from "@/features/organizer/pages/AuthenticationMethodsPage";
import { hasCapability } from "@/lib/auth/permissions";
import { exportTabularReport } from "@/features/organizer/utils/exportUtils";
import { formatDisplayDate, formatDisplayTime } from "@/lib/utils/date";
import type { Event as EventType } from "@/types/domain";

function useDepartmentContext() {
  const { session } = useDevelopmentSession();
  return session ? { actorUserId: session.userId, actorRole: session.role, departmentId: session.departmentId } : undefined;
}

export function DepartmentEventsPage() {
  const context = useDepartmentContext();
  const [search, setSearch] = useState("");
  const [status, setStatus] = useState("all");
  const [selectedEvent, setSelectedEvent] = useState<(EventType | null)>(null);
  const query = useEvents({ pageIndex: 0, pageSize: 100, sortBy: "starts_at", sortDirection: "desc" }, context);
  const allEvents = query.data?.items ?? [];
  const visibleEvents = allEvents.filter((event) => `${event.title} ${event.code} ${event.venue}`.toLowerCase().includes(search.trim().toLowerCase()) && (status === "all" || event.status === status));
  const columns: ColDef<(typeof allEvents)[number]>[] = [
    { field: "code", headerName: "Event ID", minWidth: 140 },
    { field: "title", headerName: "Event", minWidth: 220, flex: 1 },
    { field: "category", headerName: "Category", minWidth: 140 },
    { field: "venue", headerName: "Venue", minWidth: 160 },
    { field: "startsAt", headerName: "Date", minWidth: 170, valueFormatter: (p) => p.value ? new Date(p.value).toLocaleString() : "—" },
    { field: "status", headerName: "Status", minWidth: 120, valueFormatter: (p) => String(p.value ?? "").replace(/_/g, " ") }
  ];
  if (query.isLoading) return <LoadingState label="Loading department events…" />;
  return <div className="space-y-5"><PageHeader eyebrow="Department" title="Events" description="Review events associated with your assigned department. Event ownership and attendance controls remain with organizers." actions={<Button variant="outline" onClick={() => void query.refetch()} disabled={query.isFetching}><RefreshCw className={`mr-2 h-4 w-4 ${query.isFetching ? "animate-spin" : ""}`} />Refresh</Button>} />
    {query.isError ? <ErrorState title="Department events could not be loaded" message="The event list is unavailable right now. Your access remains limited to your assigned department." /> : null}
    <section className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">{[
      { label: "Events in scope", value: query.data?.total ?? 0, icon: CalendarDays },
      { label: "Active (loaded)", value: allEvents.filter((event) => event.status === "ongoing").length, icon: Activity },
      { label: "Upcoming (loaded)", value: allEvents.filter((event) => new Date(event.startsAt).getTime() > Date.now()).length, icon: CalendarCheck },
      { label: "Completed (loaded)", value: allEvents.filter((event) => event.status === "completed").length, icon: CheckCircle2 }
    ].map(({ label, value, icon: Icon }) => <article key={label} className="rounded-lg border bg-surface p-4 shadow-sm"><div className="flex items-center justify-between"><p className="text-[11px] font-semibold uppercase tracking-wide text-muted-foreground">{label}</p><Icon className="h-4 w-4 text-primary" /></div><p className="mt-2 text-3xl font-semibold">{value}</p></article>)}</section>
    <section className="rounded-lg border bg-surface p-4 shadow-sm">
      <div className="flex flex-wrap items-center justify-between gap-3"><div><h2 className="text-sm font-semibold">Department event directory</h2><p className="mt-0.5 text-xs text-muted-foreground">{query.data?.total ?? 0} events in your department scope.</p></div><div className="flex flex-wrap gap-2"><label className="relative"><Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground"/><input aria-label="Search department events" value={search} onChange={(event) => setSearch(event.target.value)} placeholder="Search events…" className="h-9 rounded-md border bg-background pl-9 pr-3 text-sm" /></label><label className="relative"><Filter className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground"/><select aria-label="Filter event status" value={status} onChange={(event) => setStatus(event.target.value)} className="h-9 rounded-md border bg-background pl-9 pr-3 text-sm"><option value="all">All statuses</option>{[...new Set(allEvents.map((event) => event.status))].map((item) => <option key={item} value={item}>{item.replace(/_/g, " ")}</option>)}</select></label></div></div>
      <div className="mt-4"><PLPassDataGrid data={visibleEvents} columns={columns} label="Department events" isError={query.isError} isLoading={query.isFetching} emptyTitle="No department events found" emptyDescription="Try changing the search or status filter." onRowClick={(event) => setSelectedEvent(event)} /></div>
      <p className="mt-3 text-xs text-muted-foreground">Read-only view. No event creation, approval, or attendance-control actions are available to department admins.</p>
    </section>{selectedEvent ? <div role="dialog" aria-modal="true" aria-labelledby="department-event-detail-title" className="fixed inset-0 z-50 flex items-center justify-center bg-black/35 p-4" onClick={() => setSelectedEvent(null)}><section className="w-full max-w-2xl rounded-xl border bg-surface p-5 shadow-xl" onClick={(event) => event.stopPropagation()}><div className="flex items-start justify-between gap-3"><div><p className="text-xs font-semibold uppercase tracking-wide text-primary">Department event · {selectedEvent.code}</p><h2 id="department-event-detail-title" className="mt-1 text-xl font-semibold">{selectedEvent.title}</h2></div><Button variant="outline" onClick={() => setSelectedEvent(null)}>Close</Button></div><div className="mt-5 grid gap-3 sm:grid-cols-2">{[{ label: "Category", value: selectedEvent.category }, { label: "Venue", value: selectedEvent.venue }, { label: "Starts", value: new Date(selectedEvent.startsAt).toLocaleString() }, { label: "Status", value: selectedEvent.status.replace(/_/g, " ") }].map((item) => <div key={item.label} className="rounded-lg border bg-background p-3"><p className="text-xs text-muted-foreground">{item.label}</p><p className="mt-1 font-medium">{item.value || "—"}</p></div>)}</div><p className="mt-4 text-xs text-muted-foreground">Read-only details. Event operations remain with the organizer.</p></section></div> : null}</div>;
}

export function DepartmentStudentsPage() {
  const context = useDepartmentContext();
  const query = useStudents({ pageIndex: 0, pageSize: 100 }, context);
  if (query.isLoading) return <LoadingState label="Loading department students…" />;
  return <div className="space-y-6"><PageHeader title="Department Students" description="Review students assigned to your department. Full account management is available in User Management." />{query.isError ? <ErrorState title="Department students could not be loaded" message="Student data is temporarily unavailable." /> : null}<section className="rounded-2xl border border-border bg-surface p-5 shadow-sm">
    <h2 className="text-lg font-semibold">Department students</h2>
    <p className="mt-1 text-sm text-muted-foreground">Only students allowed by the department scope are returned.</p>
    <div className="mt-5 overflow-x-auto rounded-xl border"><table className="w-full text-left text-sm"><thead className="bg-muted/40"><tr><th className="px-4 py-3">Student</th><th className="px-4 py-3">Student ID</th><th className="px-4 py-3">Status</th></tr></thead><tbody className="divide-y divide-border">
      {(query.data?.items ?? []).map((student) => <tr key={student.id}><td className="px-4 py-3 font-medium">{student.fullName || "Unnamed student"}</td><td className="px-4 py-3">{student.studentNumber}</td><td className="px-4 py-3 capitalize">{student.status}</td></tr>)}
      {!query.data?.items.length ? <tr><td colSpan={3} className="p-6 text-sm text-muted-foreground">No students are visible.</td></tr> : null}
    </tbody></table></div>
  </section></div>;
}

export function DepartmentBrandingPage() {
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

export function DepartmentAttendancePage() {
  const context = useDepartmentContext();
  const isRecordsPage = useLocation().pathname === "/department/records";
  const [eventFilter, setEventFilter] = useState("all");
  const [statusFilter, setStatusFilter] = useState("all");
  const query = useAttendanceRecords({ pageIndex: 0, pageSize: 100, sortBy: "recorded_at", sortDirection: "desc" }, context);
  const eventsQuery = useEvents({ pageIndex: 0, pageSize: 100 }, context);
  const sessionsQuery = useAttendanceSessions({ pageIndex: 0, pageSize: 200 }, context);
  const eventById = new Map((eventsQuery.data?.items ?? []).map((event) => [event.id, event]));
  const sessionById = new Map((sessionsQuery.data?.items ?? []).map((session) => [session.id, session]));
  const allRecords = query.data?.items ?? [];
  const scopedRecords = allRecords.filter((record) => {
    const session = sessionById.get(record.sessionId);
    return (eventFilter === "all" || session?.eventId === eventFilter) && (statusFilter === "all" || record.status === statusFilter);
  });
  const countByStatus = (status: string) => allRecords.filter((record) => record.status === status).length;
  const columns: ColDef<(typeof allRecords)[number]>[] = [
    { colId: "event", headerName: "Event", minWidth: 180, flex: 1, valueGetter: (p) => { const session = sessionById.get(p.data?.sessionId ?? ""); return eventById.get(session?.eventId ?? "")?.title ?? session?.title ?? "Event"; } },
    { colId: "student", headerName: "Participant", minWidth: 200, valueGetter: (p) => p.data?.studentId ?? "—" },
    { field: "status", headerName: "Attendance", minWidth: 130, valueFormatter: (p) => String(p.value ?? "").replace(/_/g, " ") },
    { field: "verificationMethod", headerName: "Method", minWidth: 130, valueFormatter: (p) => String(p.value ?? "").replace(/_/g, " ") },
    { field: "recordedAt", headerName: "Recorded", minWidth: 175, valueFormatter: (p) => p.value ? new Date(p.value).toLocaleString() : "—" }
  ];
  if (query.isLoading) return <LoadingState label="Loading department attendance…" />;
  return <div className="space-y-5"><PageHeader eyebrow="Department" title={isRecordsPage ? "Event Records" : "Attendance Records"} description="Attendance and participants for events associated with your assigned department. Invited guests are included; unrelated events are not." actions={<Button variant="outline" onClick={() => void Promise.all([query.refetch(), eventsQuery.refetch(), sessionsQuery.refetch()])} disabled={query.isFetching || eventsQuery.isFetching || sessionsQuery.isFetching}><RefreshCw className={`mr-2 h-4 w-4 ${query.isFetching ? "animate-spin" : ""}`} />Refresh</Button>} />
    {query.isError ? <ErrorState title="Attendance records could not be loaded" message="Department-scoped attendance data is temporarily unavailable." /> : null}
    <section className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">{[
      { label: "Records loaded", value: allRecords.length, icon: ClipboardList },
      { label: "Present", value: countByStatus("present"), icon: CheckCircle2 },
      { label: "Late", value: countByStatus("late"), icon: Activity },
      { label: "Absent", value: countByStatus("absent"), icon: AlertTriangle }
    ].map(({ label, value, icon: Icon }) => <article key={label} className="rounded-lg border bg-surface p-4 shadow-sm"><div className="flex items-center justify-between"><p className="text-[11px] font-semibold uppercase tracking-wide text-muted-foreground">{label}</p><Icon className="h-4 w-4 text-primary" /></div><p className="mt-2 text-3xl font-semibold">{value}</p></article>)}</section>
    <section className="rounded-lg border bg-surface p-4 shadow-sm"><div className="flex flex-wrap items-center justify-between gap-3"><div><h2 className="text-sm font-semibold">Department attendance directory</h2><p className="mt-0.5 text-xs text-muted-foreground">Showing up to 100 recent records; counts reflect this loaded page.</p></div><div className="flex gap-2"><label className="sr-only" htmlFor="department-record-event-filter">Filter by event</label><select id="department-record-event-filter" value={eventFilter} onChange={(event) => setEventFilter(event.target.value)} className="h-9 max-w-56 rounded-md border bg-background px-3 text-sm"><option value="all">All department events</option>{(eventsQuery.data?.items ?? []).map((event) => <option key={event.id} value={event.id}>{event.title}</option>)}</select><label className="sr-only" htmlFor="department-record-status-filter">Filter by attendance</label><select id="department-record-status-filter" value={statusFilter} onChange={(event) => setStatusFilter(event.target.value)} className="h-9 rounded-md border bg-background px-3 text-sm"><option value="all">All statuses</option>{["present", "late", "absent", "excused"].map((item) => <option key={item} value={item}>{item}</option>)}</select></div></div>
    <div className="mt-4"><PLPassDataGrid data={scopedRecords} columns={columns} label="Department attendance records" isError={query.isError || eventsQuery.isError || sessionsQuery.isError} isLoading={query.isFetching || eventsQuery.isFetching || sessionsQuery.isFetching} emptyTitle="No attendance records found" emptyDescription="No records match the selected event and attendance filters." /></div>
  </section></div>;
}

export function DepartmentAnalyticsPage() {
  const context = useDepartmentContext();
  const [eventFilter, setEventFilter] = useState("all");
  const [rangeFilter, setRangeFilter] = useState("all");
  const query = useAttendanceRecords({ pageIndex: 0, pageSize: 250, sortBy: "recorded_at", sortDirection: "desc" }, context);
  const eventsQuery = useEvents({ pageIndex: 0, pageSize: 100 }, context);
  const sessionsQuery = useAttendanceSessions({ pageIndex: 0, pageSize: 200 }, context);
  if (query.isLoading) return <LoadingState label="Loading department analytics…" />;
  const sessionById = new Map((sessionsQuery.data?.items ?? []).map((session) => [session.id, session]));
  const eventById = new Map((eventsQuery.data?.items ?? []).map((event) => [event.id, event]));
  const now = Date.now();
  const rangeMs = rangeFilter === "30d" ? 30 * 86400000 : rangeFilter === "90d" ? 90 * 86400000 : undefined;
  const records = (query.data?.items ?? []).filter((record) => {
    const eventId = sessionById.get(record.sessionId)?.eventId;
    const withinRange = !rangeMs || now - new Date(record.recordedAt).getTime() <= rangeMs;
    return (eventFilter === "all" || eventId === eventFilter) && withinRange;
  });
  const counts = records.reduce<Record<string, number>>((result, record) => { result[record.status] = (result[record.status] ?? 0) + 1; return result; }, {});
  const present = (counts.present ?? 0) + (counts.late ?? 0);
  const rate = records.length ? Math.round((present / records.length) * 100) : 0;
  const eventRows = [...new Set(records.map((record) => sessionById.get(record.sessionId)?.eventId).filter((id): id is string => Boolean(id)))].map((eventId) => {
    const eventRecords = records.filter((record) => sessionById.get(record.sessionId)?.eventId === eventId);
    const attended = eventRecords.filter((record) => record.status === "present" || record.status === "late").length;
    return { name: eventById.get(eventId)?.code ?? "Event", title: eventById.get(eventId)?.title ?? "Department event", records: eventRecords.length, attendanceRate: eventRecords.length ? Math.round(attended / eventRecords.length * 100) : 0 };
  }).slice(0, 12);
  const statusChart = ["present", "late", "absent", "excused"].map((name) => ({ name, value: counts[name] ?? 0 })).filter((item) => item.value > 0);
  return <div className="space-y-5"><PageHeader eyebrow="Department Insights" title="Analytics Insights" description="Attendance and event trends for your assigned department and its event participants." actions={<Button variant="outline" onClick={() => void Promise.all([query.refetch(), eventsQuery.refetch(), sessionsQuery.refetch()])} disabled={query.isFetching || eventsQuery.isFetching || sessionsQuery.isFetching}><RefreshCw className="mr-2 h-4 w-4"/>Refresh</Button>} />
    {query.isError ? <ErrorState title="Department analytics could not be loaded" message="The scoped attendance summary is temporarily unavailable." /> : null}
    <section className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">{[
      { label: "Attendance records", value: records.length, icon: ClipboardList }, { label: "Present or late", value: present, icon: UserCheck },
      { label: "Attendance rate", value: `${rate}%`, icon: BarChart3 }, { label: "Events represented", value: new Set(records.map((record) => sessionById.get(record.sessionId)?.eventId).filter(Boolean)).size, icon: CalendarDays }
    ].map(({ label, value, icon: Icon }) => <article key={label} className="rounded-lg border bg-surface p-4 shadow-sm"><div className="flex items-center justify-between"><p className="text-[11px] font-semibold uppercase tracking-wide text-muted-foreground">{label}</p><Icon className="h-4 w-4 text-primary" /></div><p className="mt-2 text-3xl font-semibold">{value}</p></article>)}</section>
    <section className="flex flex-wrap items-center gap-2 rounded-lg border bg-surface p-3"><Filter className="h-4 w-4 text-muted-foreground"/><select aria-label="Filter analytics by event" value={eventFilter} onChange={(event) => setEventFilter(event.target.value)} className="h-9 rounded-md border bg-background px-3 text-sm"><option value="all">All department events</option>{(eventsQuery.data?.items ?? []).map((event) => <option key={event.id} value={event.id}>{event.title}</option>)}</select><select aria-label="Filter analytics by date range" value={rangeFilter} onChange={(event) => setRangeFilter(event.target.value)} className="h-9 rounded-md border bg-background px-3 text-sm"><option value="all">All dates in recent sample</option><option value="30d">Last 30 days</option><option value="90d">Last 90 days</option></select><span className="text-xs text-muted-foreground">Bounded to the 250 most recent scoped records; no background polling.</span></section>
    <div className="grid gap-4 xl:grid-cols-2"><section className="rounded-lg border bg-surface p-4 shadow-sm"><h2 className="text-sm font-semibold">Attendance status</h2><p className="mt-0.5 text-xs text-muted-foreground">Distribution for the selected department event scope.</p><div className="mt-3 h-64">{statusChart.length ? <ResponsiveContainer width="100%" height="100%"><PieChart><Pie data={statusChart} dataKey="value" nameKey="name" innerRadius={48} outerRadius={84} paddingAngle={3}>{statusChart.map((entry, index) => <Cell key={entry.name} fill={["#16a34a", "#d97706", "#dc2626", "#64748b"][index]} />)}</Pie><Tooltip/></PieChart></ResponsiveContainer> : <div className="grid h-full place-items-center rounded-md border border-dashed text-sm text-muted-foreground">No attendance records for this selection.</div>}</div></section><section className="rounded-lg border bg-surface p-4 shadow-sm"><h2 className="text-sm font-semibold">Attendance by event</h2><p className="mt-0.5 text-xs text-muted-foreground">Events are limited to your department; guest attendance is included.</p><div className="mt-3 h-64">{eventRows.length ? <ResponsiveContainer width="100%" height="100%"><BarChart data={eventRows} margin={{ left: -18, right: 8, bottom: 28 }}><CartesianGrid strokeDasharray="3 3" vertical={false}/><XAxis dataKey="name" angle={-25} textAnchor="end" interval={0} fontSize={10}/><YAxis allowDecimals={false}/><Tooltip labelFormatter={(_, payload) => payload?.[0]?.payload?.title ?? "Event"}/><Bar dataKey="attendanceRate" name="Attendance rate %" fill="#3f7a44" radius={[4,4,0,0]}/></BarChart></ResponsiveContainer> : <div className="grid h-full place-items-center rounded-md border border-dashed text-sm text-muted-foreground">No event attendance trends available yet.</div>}</div></section></div>
  </div>;
}

export function DepartmentReportsPage() {
  const context = useDepartmentContext();
  const { session } = useDevelopmentSession();
  const [search, setSearch] = useState("");
  const query = useReports({ pageIndex: 0, pageSize: 50, sortBy: "created_at", sortDirection: "desc" }, context);
  const canExport = Boolean(session && hasCapability(session.role, "reports.export.department"));
  const items = query.data?.items ?? [];
  const filtered = items.filter((report) => `${report.title} ${report.scope} ${report.status}`.toLowerCase().includes(search.trim().toLowerCase()));
  const columns: ColDef<(typeof items)[number]>[] = [
    { field: "title", headerName: "Report", minWidth: 240, flex: 1 },
    { field: "scope", headerName: "Scope", minWidth: 180 },
    { field: "status", headerName: "Status", minWidth: 130 },
    { field: "generatedAt", headerName: "Generated", minWidth: 190, valueFormatter: (p) => p.value ? new Date(p.value).toLocaleString() : "Not generated" }
  ];
  async function exportReports() {
    await exportTabularReport("Department Reports", filtered.map((report) => ({ Report: report.title, Scope: report.scope, Status: report.status, "Generated at": report.generatedAt ?? "" })));
  }
  if (query.isLoading) return <LoadingState label="Loading department reports…" />;
  return <div className="space-y-5"><PageHeader eyebrow="Department Insights" title="Reports" description="Review reports associated with your department’s events and users." actions={<div className="flex gap-2"><Button variant="outline" onClick={() => void query.refetch()} disabled={query.isFetching}><RefreshCw className={`mr-2 h-4 w-4 ${query.isFetching ? "animate-spin" : ""}`} />Refresh</Button>{canExport ? <Button onClick={() => void exportReports()} disabled={!filtered.length}><Download className="mr-2 h-4 w-4"/>Export</Button> : null}</div>} />{query.isError ? <ErrorState title="Department reports could not be loaded" message="Scoped report data is temporarily unavailable." /> : null}<section className="grid gap-3 sm:grid-cols-3">{[{ label: "Reports in scope", value: query.data?.total ?? 0 }, { label: "Ready", value: items.filter((item) => item.status === "ready").length }, { label: "Needs attention", value: items.filter((item) => item.status === "failed").length }].map((metric) => <article key={metric.label} className="rounded-lg border bg-surface p-4 shadow-sm"><p className="text-[11px] font-semibold uppercase tracking-wide text-muted-foreground">{metric.label}</p><p className="mt-2 text-3xl font-semibold">{metric.value}</p></article>)}</section><section className="rounded-lg border bg-surface p-4 shadow-sm"><div className="mb-4 flex flex-wrap items-center justify-between gap-3"><div><h2 className="text-sm font-semibold">Department report directory</h2><p className="mt-0.5 text-xs text-muted-foreground">Showing at most 50 recent scoped reports per request.</p></div><label className="relative"><Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground"/><input aria-label="Search department reports" value={search} onChange={(event) => setSearch(event.target.value)} placeholder="Search reports…" className="h-9 rounded-md border bg-background pl-9 pr-3 text-sm"/></label></div><PLPassDataGrid data={filtered} columns={columns} label="Department reports" isError={query.isError} isLoading={query.isFetching} emptyTitle="No department reports found" emptyDescription="Reports will appear here when they are generated for department-scoped activity."/></section></div>;
}

export function DepartmentAuditLogsPage() {
  const context = useDepartmentContext();
  const { session } = useDevelopmentSession();
  const [search, setSearch] = useState("");
  const query = useAuditLogs({ pageIndex: 0, pageSize: 100, sortBy: "created_at", sortDirection: "desc" }, context);
  const canExport = Boolean(session && hasCapability(session.role, "audit.export.department"));
  const items = query.data?.items ?? [];
  const filtered = items.filter((log) => `${log.action} ${log.targetType} ${log.targetId ?? ""} ${log.actorDisplayName ?? ""}`.toLowerCase().includes(search.trim().toLowerCase()));
  const columns: ColDef<(typeof items)[number]>[] = [
    { field: "timestamp", headerName: "Date & Time", minWidth: 190, valueFormatter: (p) => p.value ? `${formatDisplayDate(p.value)} ${formatDisplayTime(p.value)}` : "—" },
    { field: "actorDisplayName", headerName: "User", minWidth: 180, valueFormatter: (p) => p.value ?? "Account no longer available" },
    { field: "actorRole", headerName: "Role", minWidth: 140 },
    { field: "action", headerName: "Action", minWidth: 220, flex: 1 },
    { field: "targetType", headerName: "Target", minWidth: 150 },
    { field: "targetId", headerName: "Target ID", minWidth: 180 }
  ];
  async function exportLogs() {
    await exportTabularReport("Department Audit Logs", filtered.map((log) => ({ "Date & Time": `${formatDisplayDate(log.timestamp)} ${formatDisplayTime(log.timestamp)}`, User: log.actorDisplayName ?? "Unavailable", Role: log.actorRole ?? "", Action: log.action, "Target type": log.targetType, "Target ID": log.targetId ?? "" })));
  }
  if (query.isLoading) return <LoadingState label="Loading department audit logs…" />;
  return <div className="space-y-5"><PageHeader eyebrow="Department" title="Audit Logs" description="Review department-scoped organizer, student, event, and attendance activity." actions={<div className="flex gap-2"><Button variant="outline" onClick={() => void query.refetch()} disabled={query.isFetching}><RefreshCw className={`mr-2 h-4 w-4 ${query.isFetching ? "animate-spin" : ""}`} />Refresh</Button>{canExport ? <Button onClick={() => void exportLogs()} disabled={!filtered.length}><Download className="mr-2 h-4 w-4"/>Export</Button> : null}</div>} />{query.isError ? <ErrorState title="Department audit logs could not be loaded" message="Scoped audit data is temporarily unavailable." /> : null}<section className="grid gap-3 sm:grid-cols-3">{[{ label: "Entries loaded", value: items.length }, { label: "Organizers represented", value: new Set(items.map((log) => log.actorUserId).filter(Boolean)).size }, { label: "Actions represented", value: new Set(items.map((log) => log.action)).size }].map((metric) => <article key={metric.label} className="rounded-lg border bg-surface p-4 shadow-sm"><p className="text-[11px] font-semibold uppercase tracking-wide text-muted-foreground">{metric.label}</p><p className="mt-2 text-3xl font-semibold">{metric.value}</p></article>)}</section><section className="rounded-lg border bg-surface p-4 shadow-sm"><div className="mb-4 flex flex-wrap items-center justify-between gap-3"><div><h2 className="text-sm font-semibold">Department audit activity</h2><p className="mt-0.5 text-xs text-muted-foreground">At most 100 recent department-scoped entries are loaded.</p></div><label className="relative"><Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground"/><input aria-label="Search department audit logs" value={search} onChange={(event) => setSearch(event.target.value)} placeholder="Search activity…" className="h-9 rounded-md border bg-background pl-9 pr-3 text-sm"/></label></div><PLPassDataGrid data={filtered} columns={columns} label="Department audit logs" isError={query.isError} isLoading={query.isFetching} emptyTitle="No department audit activity found" emptyDescription="No entries match this search within the available department scope."/></section></div>;
}

function DepartmentOverviewPage() {
  const context = useDepartmentContext();
  const events = useEvents({ pageIndex: 0, pageSize: 6, sortBy: "starts_at", sortDirection: "desc" }, context);
  const students = useStudents({ pageIndex: 0, pageSize: 1 }, context);
  const organizers = useOrganizerProfiles({ pageIndex: 0, pageSize: 1 }, context);
  const attendance = useAttendanceRecords({ pageIndex: 0, pageSize: 100, sortBy: "recorded_at", sortDirection: "desc" }, context);
  const branding = useDepartmentBranding(useDevelopmentSession().session?.departmentId, context);
  const queries = [events, students, organizers, attendance, branding];
  const loading = queries.some((query) => query.isLoading);
  const fetching = queries.some((query) => query.isFetching);
  const cards = [
    { title: "Department events", value: events.data?.total, detail: "Events associated with this department", icon: CalendarDays, to: "/department/events" },
    { title: "Department organizers", value: organizers.data?.total, detail: "Organizer accounts in this department", icon: Users, to: "/department/users" },
    { title: "Department students", value: students.data?.total, detail: "Students assigned to this department", icon: UserCheck, to: "/department/users" },
    { title: "Recent attendance records", value: attendance.data?.items.length, detail: "Latest records loaded for this department (up to 100)", icon: ShieldCheck, to: "/department/records" }
  ];
  async function refresh() { await Promise.all(queries.map((query) => query.refetch())); }
  return <div className="space-y-5">
    <PageHeader eyebrow="Department Workspace" title="Dashboard" description={`${branding.data?.displayName ?? "Department overview"}. Metrics and activity are limited to your assigned department and its events.`} actions={<Button variant="outline" onClick={() => void refresh()} disabled={fetching}><RefreshCw className={`mr-2 h-4 w-4 ${fetching ? "animate-spin" : ""}`} />Refresh</Button>} />
    {queries.some((query) => query.isError) ? <ErrorState title="Some department dashboard data could not be loaded" message="Institution-wide data is never substituted. Retry the department-scoped requests." /> : null}
    {loading ? <LoadingState label="Loading department dashboard…" /> : <>
      <section className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">{cards.map(({ title, value, detail, icon: Icon, to }) => <NavLink key={title} to={to} aria-label={`View ${title}`} className="rounded-lg border bg-surface p-4 shadow-sm transition-shadow hover:shadow-md"><div className="flex items-start justify-between gap-3"><div><p className="text-[11px] font-medium uppercase tracking-wide text-muted-foreground">{title}</p><p className="mt-2.5 text-3xl font-semibold leading-none">{value?.toLocaleString() ?? "—"}</p></div><span className="grid h-9 w-9 place-items-center rounded-md border border-primary/15 bg-primary/5 text-primary"><Icon className="h-4 w-4" aria-hidden="true" /></span></div><p className="mt-3 text-sm leading-5 text-muted-foreground">{detail}</p></NavLink>)}</section>
      <section className="grid gap-4 xl:grid-cols-[minmax(0,1fr)_minmax(280px,0.55fr)]">
        <section className="rounded-lg border bg-surface p-4 shadow-sm"><div className="flex flex-wrap items-start justify-between gap-3"><div><h2 className="text-sm font-semibold">Recent department events</h2><p className="mt-0.5 text-xs text-muted-foreground">Latest events visible within your assigned department.</p></div><NavLink to="/department/events" className="rounded-md border px-3 py-1.5 text-xs font-medium hover:bg-muted">View events</NavLink></div><div className="mt-4 divide-y divide-border rounded-md border">{(events.data?.items ?? []).map((event) => <div key={event.id} className="flex flex-wrap items-center justify-between gap-3 p-3"><div><p className="text-sm font-semibold">{event.title}</p><p className="text-xs text-muted-foreground">{event.code} · {event.venue} · {new Date(event.startsAt).toLocaleDateString()}</p></div><span className="rounded-full bg-primary/10 px-2.5 py-1 text-xs font-semibold capitalize">{event.status}</span></div>)}{!events.data?.items.length ? <p className="p-5 text-sm text-muted-foreground">No department events are currently visible.</p> : null}</div><p className="mt-3 text-xs text-muted-foreground">Read-only. Organizers retain event and attendance controls.</p></section>
        <section className="rounded-lg border bg-surface p-4 shadow-sm"><div className="flex items-start justify-between gap-3"><div><h2 className="text-sm font-semibold">Department workspace</h2><p className="mt-0.5 text-xs text-muted-foreground">Scoped overview and safe shortcuts.</p></div><Building2 className="h-4 w-4 text-primary" aria-hidden="true" /></div><div className="mt-4 rounded-md border bg-background p-3"><p className="text-xs uppercase tracking-wide text-muted-foreground">Department branding</p><p className="mt-1 font-semibold">{branding.data?.displayName ?? "Not configured"}</p><p className="mt-1 text-xs text-muted-foreground">Only your department’s presentation settings.</p></div><div className="mt-3 grid gap-2"><NavLink to="/department/analytics" className="rounded-md border px-3 py-2 text-sm hover:bg-muted">Open department analytics</NavLink><NavLink to="/department/audit-logs" className="rounded-md border px-3 py-2 text-sm hover:bg-muted">Review department audit logs</NavLink><NavLink to="/department/settings" className="rounded-md border px-3 py-2 text-sm hover:bg-muted">Manage department settings</NavLink></div></section>
      </section>
      <section className="grid gap-4 xl:grid-cols-2">
        <section className="rounded-lg border bg-surface p-4 shadow-sm"><div><h2 className="text-sm font-semibold">Department event status</h2><p className="mt-0.5 text-xs text-muted-foreground">Latest events associated with your department.</p></div><div className="mt-3 h-56">{events.data?.items.length ? <ResponsiveContainer width="100%" height="100%"><BarChart data={events.data.items.slice(0, 8).map((event) => ({ name: event.code, title: event.title, count: 1 }))} margin={{ left: -18, right: 8, bottom: 24 }}><CartesianGrid strokeDasharray="3 3" vertical={false}/><XAxis dataKey="name" angle={-20} textAnchor="end" interval={0} fontSize={10}/><YAxis hide allowDecimals={false}/><Tooltip labelFormatter={(_, payload) => payload?.[0]?.payload?.title ?? "Department event"}/><Bar dataKey="count" name="Event" fill="#3f7a44" radius={[4,4,0,0]}/></BarChart></ResponsiveContainer> : <div className="grid h-full place-items-center rounded-md border border-dashed text-sm text-muted-foreground">No department events are available to chart.</div>}</div></section>
        <section className="rounded-lg border bg-surface p-4 shadow-sm"><div><h2 className="text-sm font-semibold">Attendance overview</h2><p className="mt-0.5 text-xs text-muted-foreground">Latest 100 attendance records for department events; invited participants are included.</p></div><div className="mt-3 h-56">{attendance.data?.items.length ? <ResponsiveContainer width="100%" height="100%"><PieChart><Pie data={["present", "late", "absent", "excused"].map((name) => ({ name, value: attendance.data?.items.filter((record) => record.status === name).length ?? 0 })).filter((item) => item.value > 0)} dataKey="value" nameKey="name" innerRadius={45} outerRadius={82} paddingAngle={3}>{["#16a34a", "#d97706", "#dc2626", "#64748b"].map((color) => <Cell key={color} fill={color} />)}</Pie><Tooltip/></PieChart></ResponsiveContainer> : <div className="grid h-full place-items-center rounded-md border border-dashed text-sm text-muted-foreground">Attendance insights will appear when records exist.</div>}</div></section>
      </section>
    </>}
  </div>;
}

export function DepartmentAuthenticationMethodsPage() {
  return <AuthenticationMethodsPage />;
}

export function DepartmentSystemHealthPage() {
  const context = useDepartmentContext();
  const events = useEvents({ pageIndex: 0, pageSize: 25, sortBy: "starts_at", sortDirection: "desc" }, context);
  const attendance = useAttendanceRecords({ pageIndex: 0, pageSize: 100, sortBy: "recorded_at", sortDirection: "desc" }, context);
  const students = useStudents({ pageIndex: 0, pageSize: 1 }, context);
  const loading = events.isLoading || attendance.isLoading || students.isLoading;
  const checks = [
    { label: "Department data", healthy: !events.isError && !students.isError, detail: events.isError || students.isError ? "Department records could not be loaded." : "Department-scoped records are responding." },
    { label: "Event visibility", healthy: !events.isError, detail: events.isError ? "Events are temporarily unavailable." : `${events.data?.total ?? 0} department event(s) are visible.` },
    { label: "Attendance visibility", healthy: !attendance.isError, detail: attendance.isError ? "Attendance records are temporarily unavailable." : `${attendance.data?.total ?? 0} recent attendance record(s) are visible.` }
  ];
  async function refresh() {
    await Promise.all([events.refetch(), attendance.refetch(), students.refetch()]);
  }
  return <div className="space-y-6"><PageHeader title="System Health" description="Check the availability of department-scoped data without exposing institution-wide operational controls." actions={<button type="button" onClick={() => void refresh()} disabled={events.isFetching || attendance.isFetching || students.isFetching} className="inline-flex items-center rounded-xl border border-border bg-surface px-4 py-2.5 text-sm font-semibold disabled:opacity-50"><RefreshCw className={`mr-2 h-4 w-4 ${(events.isFetching || attendance.isFetching || students.isFetching) ? "animate-spin" : ""}`} />Refresh checks</button>} />
    {loading ? <LoadingState label="Loading department health…" /> : <section className="grid gap-4 md:grid-cols-3">{checks.map((check) => <div key={check.label} className={`rounded-2xl border p-5 ${check.healthy ? "border-emerald-200 bg-emerald-50/50" : "border-amber-200 bg-amber-50/50"}`}><div className="flex items-center justify-between gap-3"><h2 className="font-semibold">{check.label}</h2>{check.healthy ? <CheckCircle2 className="h-5 w-5 text-emerald-700" /> : <AlertTriangle className="h-5 w-5 text-amber-700" />}</div><p className="mt-3 text-sm text-muted-foreground">{check.detail}</p></div>)}</section>}
    <section className="rounded-2xl border border-border bg-surface p-5"><div className="flex items-center gap-2"><Activity className="h-5 w-5 text-primary" /><h2 className="font-semibold">Department scope</h2></div><p className="mt-2 text-sm text-muted-foreground">These checks use the signed-in department-admin scope. They do not inspect or retry university-wide email jobs, global settings, or other departments.</p></section>
  </div>;
}

export function DepartmentSettingsPage() {
  return <div className="space-y-6"><PageHeader title="Settings" description="Manage presentation settings for your assigned department." /><DepartmentBrandingPage /></div>;
}

export function DepartmentAdminPage() {
  return <DepartmentOverviewPage />;
}
