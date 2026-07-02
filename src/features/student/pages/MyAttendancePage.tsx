import { useState } from "react";
import { useNavigate } from "react-router-dom";
import { toast } from "sonner";
import type { ColDef } from "ag-grid-community";
import {
  Calendar,
  FileSpreadsheet,
  FileText,
  Search,
  BookOpen,
  PartyPopper,
  Clock,
  User,
  ExternalLink,
  ChevronRight,
  Filter,
  CheckCircle
} from "lucide-react";
import { PageHeader } from "@/components/shared/PageHeader";
import { StatusBadge } from "@/components/feedback/StatusBadge";
import { Button } from "@/components/ui/button";
import { StudentSelect } from "@/components/forms/StudentSelect";
import { LoadingState } from "@/components/feedback/LoadingState";
import { ErrorState } from "@/components/feedback/ErrorState";
import { EmptyState } from "@/components/feedback/EmptyState";
import { PLPassDataGrid } from "@/components/data-display/PLPassDataGrid";
import { useDevelopmentSession } from "@/hooks/useDevelopmentSession";
import {
  useStudents,
  useClasses,
  useEvents,
  useAttendanceSessions,
  useAttendanceRecords,
  useFacultyProfiles,
  useOrganizerProfiles
} from "@/hooks/useRepositoryQueries";
import { APP_ROUTES } from "@/lib/constants/routes";
import type { RepositoryContext } from "@/services/mock/mockRepositoryUtils";
import type {
  AttendanceRecord,
  Student
} from "@/types/domain";
import type { AttendanceStatus } from "@/types/enums";

type StudentScope = {
  context: RepositoryContext;
  student?: Student;
  studentName: string;
  isLoading: boolean;
  isError: boolean;
};

type SessionLogRow = {
  id: string;
  dateTime: string;
  status: AttendanceStatus;
  verificationMethod: string;
  record?: AttendanceRecord;
};

const dateFormatter = new Intl.DateTimeFormat("en-US", { month: "short", day: "numeric", year: "numeric" });
const timeFormatter = new Intl.DateTimeFormat("en-US", { hour: "2-digit", minute: "2-digit" });

function useStudentScope(): StudentScope {
  const { session } = useDevelopmentSession();
  const context = session ? { actorUserId: session.userId, actorRole: session.role } : undefined;
  const studentQuery = useStudents({ pageSize: 1 }, context);
  return {
    context: context ?? { actorUserId: "", actorRole: "student" },
    student: studentQuery.data?.items[0],
    studentName: session?.displayName ?? "Student",
    isLoading: studentQuery.isLoading,
    isError: studentQuery.isError
  };
}

function formatDate(value: string | undefined) {
  return value ? dateFormatter.format(new Date(value)) : "N/A";
}

function formatTime(value: string | undefined) {
  return value ? timeFormatter.format(new Date(value)) : "N/A";
}

function getStatusTone(status: AttendanceStatus) {
  if (status === "present") return "success";
  if (status === "late") return "warning";
  if (status === "absent") return "danger";
  return "muted";
}

export function MyAttendancePage() {
  const scope = useStudentScope();
  const navigate = useNavigate();
  const [tab, setTab] = useState<"class" | "event">("class");
  const [view, setView] = useState<"list" | "calendar">("list");
  const [search, setSearch] = useState("");
  const [statusFilter, setStatusFilter] = useState("all");
  const [selectedItem, setSelectedItem] = useState<{
    id: string;
    code: string;
    title: string;
    kind: "class" | "event";
    facultyName?: string;
    organizerName?: string;
    sched: string;
    time: string;
  } | null>(null);
  const [isGenerating, setIsGenerating] = useState<"xlsx" | "pdf" | null>(null);

  const classesQuery = useClasses({ pageSize: 100 }, scope.context);
  const eventsQuery = useEvents({ pageSize: 100 }, scope.context);
  const sessionsQuery = useAttendanceSessions({ pageSize: 100 }, scope.context);
  const recordsQuery = useAttendanceRecords({ pageSize: 500 }, scope.context);
  const facultyQuery = useFacultyProfiles({ pageSize: 100 }, scope.context);
  const organizerQuery = useOrganizerProfiles({ pageSize: 100 }, scope.context);

  if (scope.isLoading) {
    return <LoadingState label="Loading student workspace" />;
  }

  if (scope.isError || !scope.student) {
    return <ErrorState title="Student profile unavailable" message="The signed-in mock account does not have a student profile fixture." />;
  }

  if (
    classesQuery.isLoading ||
    eventsQuery.isLoading ||
    sessionsQuery.isLoading ||
    recordsQuery.isLoading ||
    facultyQuery.isLoading ||
    organizerQuery.isLoading
  ) {
    return <LoadingState label="Loading attendance records" />;
  }

  const classes = classesQuery.data?.items ?? [];
  const events = eventsQuery.data?.items ?? [];
  const sessions = sessionsQuery.data?.items ?? [];
  const records = recordsQuery.data?.items ?? [];
  const faculties = facultyQuery.data?.items ?? [];
  const organizers = organizerQuery.data?.items ?? [];

  // Group classes with calculations
  const classItems = classes.map((c) => {
    const prof = faculties.find((f) => f.id === c.facultyId)?.title ?? "Professor";
    const classSessions = sessions.filter((s) => s.classId === c.id);
    const sessionIds = classSessions.map((s) => s.id);
    const classRecords = records.filter((r) => sessionIds.includes(r.sessionId));

    // Mock schedule days / times
    const dayMap = ["MWF", "TTh", "Saturday"];
    const schedText = dayMap[Math.abs(c.id.charCodeAt(0) ?? 0) % dayMap.length];
    const timeText = "09:00 AM - 10:30 AM";

    return {
      id: c.id,
      code: c.subjectCode,
      title: c.subjectTitle,
      sched: schedText,
      time: timeText,
      facultyName: prof,
      records: classRecords,
      sessions: classSessions
    };
  });

  // Group events with calculations
  const eventItems = events.flatMap((e) => {
    const org = organizers.find((o) => o.id === e.organizerId)?.organizationName ?? "Campus Organizer";
    const eventSessions = sessions.filter((s) => s.eventId === e.id);
    const sessionIds = eventSessions.map((s) => s.id);
    const eventRecords = records.filter((r) => sessionIds.includes(r.sessionId));
    if (eventRecords.length === 0) {
      return [];
    }

    return [{
      id: e.id,
      code: e.code,
      title: e.title,
      sched: formatDate(e.startsAt),
      time: `${formatTime(e.startsAt)} - ${formatTime(e.endsAt)}`,
      organizerName: org,
      records: eventRecords,
      sessions: eventSessions
    }];
  });

  // Filter based on search and status filters
  const filteredClasses = classItems.filter((item) => {
    const matchesSearch =
      item.code.toLowerCase().includes(search.toLowerCase()) ||
      item.title.toLowerCase().includes(search.toLowerCase()) ||
      item.facultyName.toLowerCase().includes(search.toLowerCase());
    const matchesStatus =
      statusFilter === "all" || item.records.some((r) => r.status === statusFilter);
    return matchesSearch && matchesStatus;
  });

  const filteredEvents = eventItems.filter((item) => {
    const matchesSearch =
      item.code.toLowerCase().includes(search.toLowerCase()) ||
      item.title.toLowerCase().includes(search.toLowerCase()) ||
      item.organizerName.toLowerCase().includes(search.toLowerCase());
    const matchesStatus =
      statusFilter === "all" || item.records.some((r) => r.status === statusFilter);
    return matchesSearch && matchesStatus;
  });

  // Trigger report generation simulate
  function generateReport(type: "xlsx" | "pdf", category: "classes" | "events") {
    setIsGenerating(type);
    setTimeout(() => {
      setIsGenerating(null);
      toast.success(`${type.toUpperCase()} Attendance report for ${category} generated successfully and ready for download!`);
    }, 1500);
  }

  // File correction route
  function fileCorrection(record: AttendanceRecord, code: string, name: string) {
    navigate(
      `${APP_ROUTES.studentCorrections}?category=${tab}&recordId=${record.id}&code=${code}&name=${name}`
    );
  }

  // Selected item sessions list for detail view
  const selectedSessions = selectedItem
    ? selectedItem.kind === "class"
      ? classItems.find((c) => c.id === selectedItem.id)?.sessions ?? []
      : eventItems.find((e) => e.id === selectedItem.id)?.sessions ?? []
    : [];

  const selectedRecords = selectedItem
    ? selectedItem.kind === "class"
      ? classItems.find((c) => c.id === selectedItem.id)?.records ?? []
      : eventItems.find((e) => e.id === selectedItem.id)?.records ?? []
    : [];

  const selectedSessionRows: SessionLogRow[] = selectedSessions.map((session) => {
    const record = selectedRecords.find((entry) => entry.sessionId === session.id);
    return {
      id: session.id,
      dateTime: `${formatDate(session.startsAt)} at ${formatTime(session.startsAt)}`,
      status: record?.status ?? "absent",
      verificationMethod: record?.verificationMethod ?? "N/A",
      record
    };
  });

  const sessionLogColumns: ColDef<SessionLogRow>[] = [
    { field: "dateTime", headerName: "Date & Time", minWidth: 190 },
    {
      field: "status",
      headerName: "Status",
      minWidth: 140,
      cellRenderer: ({ data }: { data?: SessionLogRow }) =>
        data ? <StatusBadge label={data.status} tone={getStatusTone(data.status)} /> : null
    },
    { field: "verificationMethod", headerName: "Verification Method", minWidth: 190 },
    {
      colId: "action",
      headerName: "Action",
      minWidth: 180,
      cellRenderer: ({ data }: { data?: SessionLogRow }) => {
        if (!data) return null;
        if ((data.status === "absent" || data.status === "late") && data.record) {
          return (
            <Button
              variant="outline"
              size="sm"
              onClick={() => fileCorrection(data.record as AttendanceRecord, selectedItem?.code ?? "", selectedItem?.title ?? "")}
              className="student-btn-secondary px-4 text-xs h-9 gap-1.5"
            >
              <ExternalLink className="h-3 w-3" />
              <span>File Correction</span>
            </Button>
          );
        }
        return (
          <span className="text-xs text-success font-semibold flex items-center gap-1">
            <CheckCircle className="h-4 w-4 text-success" />
            Verified
          </span>
        );
      }
    }
  ];

  return (
    <div className="space-y-8 p-1">
      <PageHeader
        eyebrow="Records"
        title="Attendance Records"
        description="Verify and browse your class and event log details."
      />

      {/* Main Tabs (Classes vs Events) & Views Toggles */}
      <div className="flex flex-col sm:flex-row gap-4 items-start sm:items-center justify-between">
        <div className="flex gap-2 rounded-[24px] border border-border/40 bg-card/50 p-2 shadow-sm backdrop-blur-md" role="tablist" aria-label="Attendance category">
          <Button
            role="tab"
            aria-selected={tab === "class"}
            variant={tab === "class" ? "default" : "ghost"}
            size="sm"
            onClick={() => {
              setTab("class");
              setSelectedItem(null);
            }}
            className={`rounded-xl gap-2 font-semibold px-5 ${
              tab === "class" ? "bg-primary text-primary-foreground shadow-sm hover:bg-primary-hover" : "text-muted-foreground hover:bg-card/40"
            }`}
          >
            <BookOpen className="h-4 w-4" />
            <span>Classes</span>
          </Button>
          <Button
            role="tab"
            aria-selected={tab === "event"}
            variant={tab === "event" ? "default" : "ghost"}
            size="sm"
            onClick={() => {
              setTab("event");
              setSelectedItem(null);
            }}
            className={`rounded-xl gap-2 font-semibold px-5 ${
              tab === "event" ? "bg-primary text-primary-foreground shadow-sm hover:bg-primary-hover" : "text-muted-foreground hover:bg-card/40"
            }`}
          >
            <PartyPopper className="h-4 w-4" />
            <span>Events</span>
          </Button>
        </div>

        <div className="flex gap-3 rounded-[24px] border border-border/40 bg-card/50 p-2 shadow-sm backdrop-blur-md">
          <Button
            variant={view === "list" ? "default" : "ghost"}
            size="sm"
            onClick={() => setView("list")}
            className={`rounded-xl px-4 ${
              view === "list" ? "bg-primary text-primary-foreground shadow-sm hover:bg-primary-hover" : "text-muted-foreground hover:bg-card/40"
            }`}
          >
            List view
          </Button>
          <Button
            variant={view === "calendar" ? "default" : "ghost"}
            size="sm"
            onClick={() => setView("calendar")}
            className={`rounded-xl px-4 ${
              view === "calendar" ? "bg-primary text-primary-foreground shadow-sm hover:bg-primary-hover" : "text-muted-foreground hover:bg-card/40"
            }`}
          >
            Calendar view
          </Button>
        </div>
      </div>

      {/* Search & Filter Bar */}
      <section className="student-glass-card p-6 grid gap-4 md:grid-cols-3">
        <div className="relative">
          <Search className="absolute left-3 top-3.5 h-4 w-4 text-muted-foreground" />
          <input
            type="text"
            className="student-input pl-9 h-11 w-full px-3 text-sm focus:outline-none"
            placeholder={tab === "class" ? "Search by subject, code, professor..." : "Search event, organizer..."}
            value={search}
            onChange={(e) => setSearch(e.target.value)}
          />
        </div>
        <div className="relative flex items-center gap-2 w-full">
          <Filter className="h-4 w-4 text-muted-foreground shrink-0" />
          <StudentSelect
            value={statusFilter}
            onChange={setStatusFilter}
            options={[
              { label: "All Attendance Statuses", value: "all" },
              { label: "Present", value: "present" },
              { label: "Late", value: "late" },
              { label: "Absent", value: "absent" },
              { label: "Excused", value: "excused" }
            ]}
            placeholder="All Attendance Statuses"
            className="w-full"
          />
        </div>

        {/* Generate Report Buttons */}
        <div className="flex gap-3 justify-end items-center">
          <Button
            variant="outline"
            disabled={isGenerating !== null}
            onClick={() => generateReport("xlsx", tab === "class" ? "classes" : "events")}
            className="student-btn-secondary gap-2 text-xs flex-1 md:flex-initial border-primary/20 text-primary hover:bg-primary/5"
          >
            <FileSpreadsheet className="h-4 w-4 text-primary" />
            <span>Generate XLSX</span>
          </Button>
          <Button
            variant="outline"
            disabled={isGenerating !== null}
            onClick={() => generateReport("pdf", tab === "class" ? "classes" : "events")}
            className="student-btn-secondary gap-2 text-xs flex-1 md:flex-initial border-destructive/20 text-destructive hover:bg-destructive/5"
          >
            <FileText className="h-4 w-4 text-destructive" />
            <span>Generate PDF</span>
          </Button>
        </div>
      </section>

      {/* LIST VIEW RENDER */}
      {view === "list" && (
        <div className="grid gap-6">
          {tab === "class" ? (
            filteredClasses.length > 0 ? (
              filteredClasses.map((item) => (
                <article
                  key={item.id}
                  className="student-glass-card p-6 space-y-4 hover:shadow-xl transition-all"
                >
                  <div className="flex flex-col sm:flex-row justify-between gap-2 border-b border-border pb-4">
                    <div>
                      <span className="text-xs font-mono font-bold uppercase text-primary tracking-wider">
                        {item.code}
                      </span>
                      <h3 className="font-semibold text-xl text-foreground mt-1">{item.title}</h3>
                    </div>
                    <div className="text-right sm:text-right text-left">
                      <p className="text-xs text-foreground flex items-center gap-1.5 sm:justify-end">
                        <Clock className="h-3.5 w-3.5 text-primary" />
                        {item.sched} | {item.time}
                      </p>
                      <p className="text-xs text-muted-foreground flex items-center gap-1.5 sm:justify-end mt-1.5">
                        <User className="h-3.5 w-3.5" />
                        {item.facultyName}
                      </p>
                    </div>
                  </div>

                  <div className="flex flex-wrap items-center justify-between gap-4 pt-1">
                    <div className="flex items-center gap-2 text-xs text-muted-foreground">
                      <span className="font-semibold text-foreground">{item.records.length} Sessions Logged:</span>
                      <span className="bg-success/10 text-success px-2 py-0.5 rounded-lg border border-success/20">
                        {item.records.filter((r) => r.status === "present").length} Present
                      </span>
                      <span className="bg-warning/10 text-warning px-2 py-0.5 rounded-lg border border-warning/20">
                        {item.records.filter((r) => r.status === "late").length} Late
                      </span>
                      <span className="bg-danger/10 text-danger px-2 py-0.5 rounded-lg border border-danger/20">
                        {item.records.filter((r) => r.status === "absent").length} Absent
                      </span>
                    </div>

                    <Button
                      variant="ghost"
                      size="sm"
                      onClick={() =>
                        setSelectedItem({
                          id: item.id,
                          code: item.code,
                          title: item.title,
                          kind: "class",
                          facultyName: item.facultyName,
                          sched: item.sched,
                          time: item.time
                        })
                      }
                      className="text-primary hover:text-primary-hover hover:bg-primary/5 gap-1 text-xs font-semibold"
                    >
                      <span>View More</span>
                      <ChevronRight className="h-4 w-4" />
                    </Button>
                  </div>
                </article>
              ))
            ) : (
              <EmptyState title="No classes found matching filters" />
            )
          ) : filteredEvents.length > 0 ? (
            filteredEvents.map((item) => (
              <article
                key={item.id}
                className="student-glass-card p-6 space-y-4 hover:shadow-xl transition-all"
              >
                <div className="flex flex-col sm:flex-row justify-between gap-2 border-b border-border pb-4">
                  <div>
                    <span className="text-xs font-mono font-bold uppercase text-primary tracking-wider">
                      {item.code}
                    </span>
                    <h3 className="font-semibold text-xl text-foreground mt-1">{item.title}</h3>
                  </div>
                  <div className="text-right sm:text-right text-left">
                    <p className="text-xs text-foreground flex items-center gap-1.5 sm:justify-end">
                      <Calendar className="h-3.5 w-3.5 text-primary" />
                      {item.sched}
                    </p>
                    <p className="text-xs text-muted-foreground flex items-center gap-1.5 sm:justify-end mt-1.5">
                      <User className="h-3.5 w-3.5" />
                      Organizer: {item.organizerName}
                    </p>
                  </div>
                </div>

                <div className="flex flex-wrap items-center justify-between gap-4 pt-1">
                  <div className="flex items-center gap-2 text-xs text-muted-foreground">
                    <span className="font-semibold text-foreground">Status: </span>
                    {item.records.length > 0 ? (
                      <StatusBadge
                        label={item.records[0].status}
                        tone={getStatusTone(item.records[0].status)}
                      />
                    ) : (
                      <span className="text-muted-foreground">Not Registered</span>
                    )}
                  </div>

                  <Button
                    variant="ghost"
                    size="sm"
                    onClick={() =>
                      setSelectedItem({
                        id: item.id,
                        code: item.code,
                        title: item.title,
                        kind: "event",
                        organizerName: item.organizerName,
                        sched: item.sched,
                        time: item.time
                      })
                    }
                    className="text-primary hover:text-primary-hover hover:bg-primary/5 gap-1 text-xs font-semibold"
                  >
                    <span>View More</span>
                    <ChevronRight className="h-4 w-4" />
                  </Button>
                </div>
              </article>
            ))
          ) : (
            <EmptyState title="No events found matching filters" />
          )}
        </div>
      )}

      {/* CALENDAR VIEW RENDER */}
      {view === "calendar" && (
        <section className="grid gap-6 md:grid-cols-2 lg:grid-cols-3" aria-label="Attendance calendar items">
          {tab === "class"
            ? filteredClasses.flatMap((c) =>
                c.records.map((r) => {
                  const sess = sessions.find((s) => s.id === r.sessionId);
                  return (
                    <article key={r.id} className="student-glass-card p-5 space-y-4">
                      <div className="flex justify-between items-start">
                        <span className="text-[10px] bg-secondary text-secondary-foreground px-2.5 py-1 rounded font-mono font-semibold">
                          {c.code}
                        </span>
                        <StatusBadge label={r.status} tone={getStatusTone(r.status)} />
                      </div>
                      <div>
                        <h4 className="font-semibold text-sm text-foreground">{c.title}</h4>
                        <p className="text-[11px] text-muted-foreground mt-1.5">
                          Session Date: {formatDate(sess?.startsAt)}
                        </p>
                      </div>
                    </article>
                  );
                })
              )
            : filteredEvents.flatMap((e) =>
                e.records.map((r) => {
                  const sess = sessions.find((s) => s.id === r.sessionId);
                  return (
                    <article key={r.id} className="student-glass-card p-5 space-y-4">
                      <div className="flex justify-between items-start">
                        <span className="text-[10px] bg-secondary text-secondary-foreground px-2.5 py-1 rounded font-mono font-semibold">
                          {e.code}
                        </span>
                        <StatusBadge label={r.status} tone={getStatusTone(r.status)} />
                      </div>
                      <div>
                        <h4 className="font-semibold text-sm text-foreground">{e.title}</h4>
                        <p className="text-[11px] text-muted-foreground mt-1.5">
                          Event Date: {formatDate(sess?.startsAt)}
                        </p>
                      </div>
                    </article>
                  );
                })
              )}
        </section>
      )}

      {/* VIEW MORE / DETAILS SESSIONS MODAL */}
      {selectedItem && (
        <section
          className="fixed inset-0 z-50 grid place-items-center bg-primary/25 p-4 backdrop-blur-md animate-in fade-in-30"
          role="dialog"
          aria-modal="true"
        >
          <div className="w-full max-w-3xl rounded-[28px] border border-border bg-card/75 p-6 shadow-2xl space-y-5 backdrop-blur-xl animate-in zoom-in-95">
            <div className="flex justify-between items-start border-b border-border pb-4">
              <div>
                <span className="text-xs font-mono font-bold uppercase text-primary tracking-wider">
                  {selectedItem.code}
                </span>
                <h2 className="text-xl font-bold text-foreground mt-1">{selectedItem.title}</h2>
                <p className="text-xs text-muted-foreground mt-1">
                  Schedule: {selectedItem.sched} | {selectedItem.time}
                </p>
              </div>
              <Button variant="ghost" size="sm" onClick={() => setSelectedItem(null)} className="text-foreground hover:bg-secondary">
                ✕ Close
              </Button>
            </div>

            <div className="space-y-3">
              <h3 className="font-semibold text-sm text-foreground">Previous Sessions and Attendance Log</h3>
              <PLPassDataGrid
                data={selectedSessionRows}
                columns={sessionLogColumns}
                label="Previous sessions and attendance log"
                emptyTitle="No session entries recorded"
                enableQuickFilter={false}
                enableColumnVisibility={false}
                height={280}
              />
            </div>

            <div className="flex justify-end pt-2 border-t border-border">
              <Button onClick={() => setSelectedItem(null)} className="student-btn-primary px-6">Done</Button>
            </div>
          </div>
        </section>
      )}
    </div>
  );
}
