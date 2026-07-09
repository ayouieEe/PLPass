import { useState, useEffect } from "react";
import { createPortal } from "react-dom";
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
import { compareDateValues, formatDisplayDate, formatDisplayTime } from "@/lib/utils/date";
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
  return formatDisplayDate(value, "N/A");
}

function formatTime(value: string | undefined) {
  return formatDisplayTime(value, "N/A");
}

function getStatusTone(status: AttendanceStatus) {
  if (status === "present") return "success";
  if (status === "late") return "warning";
  if (status === "absent") return "danger";
  return "muted";
}

function PaginationControls({
  currentPage,
  totalPages,
  onPageChange
}: {
  currentPage: number;
  totalPages: number;
  onPageChange: (page: number) => void;
}) {
  if (totalPages <= 1) return null;

  return (
    <div className="flex justify-center items-center gap-2 pt-4">
      <Button
        variant="outline"
        size="sm"
        disabled={currentPage === 1}
        onClick={() => onPageChange(currentPage - 1)}
        className="student-btn-secondary px-3 text-xs h-9"
      >
        Previous
      </Button>
      <span className="text-xs text-muted-foreground font-medium px-2">
        Page {currentPage} of {totalPages}
      </span>
      <Button
        variant="outline"
        size="sm"
        disabled={currentPage === totalPages}
        onClick={() => onPageChange(currentPage + 1)}
        className="student-btn-secondary px-3 text-xs h-9"
      >
        Next
      </Button>
    </div>
  );
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
  const [filterDate, setFilterDate] = useState("");
  const [listPage, setListPage] = useState(1);
  const [calendarPage, setCalendarPage] = useState(1);

  useEffect(() => {
    setListPage(1);
    setCalendarPage(1);
  }, [tab, search, statusFilter, filterDate]);

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
    const profProfile = faculties.find((f) => f.id === c.facultyId);
    const prof = profProfile?.displayName ?? profProfile?.title ?? "Professor";
    const classSessions = sessions.filter((s) => {
      if (s.classId !== c.id) return false;
      if (filterDate) {
        const logDate = new Date(s.startsAt);
        const [year, month, day] = filterDate.split("-").map(Number);
        if (
          logDate.getFullYear() !== year ||
          logDate.getMonth() !== month - 1 ||
          logDate.getDate() !== day
        ) {
          return false;
        }
      }
      return true;
    });
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
    const eventSessions = sessions.filter((s) => {
      if (s.eventId !== e.id) return false;
      if (filterDate) {
        const logDate = new Date(s.startsAt);
        const [year, month, day] = filterDate.split("-").map(Number);
        if (
          logDate.getFullYear() !== year ||
          logDate.getMonth() !== month - 1 ||
          logDate.getDate() !== day
        ) {
          return false;
        }
      }
      return true;
    });
    const sessionIds = eventSessions.map((s) => s.id);
    const eventRecords = records.filter((r) => sessionIds.includes(r.sessionId));
    if (eventRecords.length === 0 && eventSessions.length === 0) {
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
  function fileCorrection(record: AttendanceRecord | undefined, code: string, name: string) {
    navigate(
      `${APP_ROUTES.studentCorrections}?category=${tab}&recordId=${record?.id ?? ""}&code=${code}&name=${name}`
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

  // Group all check-in logs for calendar sequential agenda view
  const calendarItems = (tab === "class" ? filteredClasses : filteredEvents).flatMap((item) => {
    return item.records
      .filter((r) => {
        if (filterDate) {
          const sess = sessions.find((s) => s.id === r.sessionId);
          const logDate = new Date(sess?.startsAt ?? r.recordedAt);
          const [year, month, day] = filterDate.split("-").map(Number);
          if (
            logDate.getFullYear() !== year ||
            logDate.getMonth() !== month - 1 ||
            logDate.getDate() !== day
          ) {
            return false;
          }
        }
        return true;
      })
      .map((r) => {
        const sess = sessions.find((s) => s.id === r.sessionId);
        return {
          recordId: r.id,
          sessionId: r.sessionId,
          startsAt: sess?.startsAt ?? r.recordedAt,
          code: item.code,
          title: item.title,
          status: r.status,
          verificationMethod: r.verificationMethod,
          record: r
        };
      });
  });

  calendarItems.sort((a, b) => new Date(b.startsAt).getTime() - new Date(a.startsAt).getTime());

  // Pagination for List view
  const itemsPerPage = 5;
  const totalListItems = tab === "class" ? filteredClasses.length : filteredEvents.length;
  const totalListPages = Math.ceil(totalListItems / itemsPerPage) || 1;
  const paginatedListClasses = filteredClasses.slice((listPage - 1) * itemsPerPage, listPage * itemsPerPage);
  const paginatedListEvents = filteredEvents.slice((listPage - 1) * itemsPerPage, listPage * itemsPerPage);

  // Pagination for Calendar view
  const totalCalendarItems = calendarItems.length;
  const totalCalendarPages = Math.ceil(totalCalendarItems / itemsPerPage) || 1;
  const paginatedCalendarItems = calendarItems.slice((calendarPage - 1) * itemsPerPage, calendarPage * itemsPerPage);

  const groupedByDate: { [dateStr: string]: typeof calendarItems } = {};
  paginatedCalendarItems.forEach((item) => {
    const dateStr = formatDate(item.startsAt);
    if (!groupedByDate[dateStr]) {
      groupedByDate[dateStr] = [];
    }
    groupedByDate[dateStr].push(item);
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
              tab === "class" ? "bg-primary text-white shadow-sm hover:bg-primary-hover" : "text-muted-foreground hover:bg-card/40"
            }`}
          >
            <BookOpen className="h-4 w-4" />
            <span className={tab === "class" ? "text-white" : "text-muted-foreground"}>Classes</span>
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
              tab === "event" ? "bg-primary text-white shadow-sm hover:bg-primary-hover" : "text-muted-foreground hover:bg-card/40"
            }`}
          >
            <PartyPopper className="h-4 w-4" />
            <span className={tab === "event" ? "text-white" : "text-muted-foreground"}>Events</span>
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
      <section className="student-glass-card p-6 grid gap-4 grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 items-end">
        <div className="relative w-full">
          <label className="block text-[10px] font-semibold uppercase text-muted-foreground mb-1.5 pl-1">Search Records</label>
          <div className="relative">
            <Search className="absolute left-3 top-3.5 h-4 w-4 text-muted-foreground" />
            <input
              type="text"
              className="student-input pl-9 h-11 w-full px-3 text-sm focus:outline-none"
              placeholder={tab === "class" ? "Search subject, code..." : "Search event, organizer..."}
              value={search}
              onChange={(e) => setSearch(e.target.value)}
            />
          </div>
        </div>
        <div className="relative w-full">
          <label className="block text-[10px] font-semibold uppercase text-muted-foreground mb-1.5 pl-1">Status Filter</label>
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
        </div>
        <div className="relative w-full">
          <div className="flex justify-between items-center mb-1.5 pl-1">
            <label className="block text-[10px] font-semibold uppercase text-muted-foreground">Filter by Date</label>
            {filterDate && (
              <button
                type="button"
                onClick={() => setFilterDate("")}
                className="text-[10px] text-primary hover:underline font-semibold"
              >
                Clear
              </button>
            )}
          </div>
          <input
            type="date"
            aria-label="Filter Date"
            className="student-input h-11 w-full px-3 text-xs focus:outline-none"
            value={filterDate}
            onChange={(e) => setFilterDate(e.target.value)}
          />
        </div>

        {/* Generate Report Buttons */}
        <div className="flex gap-3 justify-end items-center w-full">
          <Button
            variant="outline"
            disabled={isGenerating !== null}
            onClick={() => generateReport("xlsx", tab === "class" ? "classes" : "events")}
            className="student-btn-secondary gap-2 text-xs flex-1 border-primary/20 text-primary hover:bg-primary/5 h-11"
          >
            <FileSpreadsheet className="h-4 w-4 text-primary" />
            <span>Generate XLSX</span>
          </Button>
          <Button
            variant="outline"
            disabled={isGenerating !== null}
            onClick={() => generateReport("pdf", tab === "class" ? "classes" : "events")}
            className="student-btn-secondary gap-2 text-xs flex-1 border-destructive/20 text-destructive hover:bg-destructive/5 h-11"
          >
            <FileText className="h-4 w-4 text-destructive" />
            <span>Generate PDF</span>
          </Button>
        </div>
      </section>

      {/* LIST VIEW RENDER */}
      {view === "list" && (
        <div className="space-y-6">
          <div className="grid gap-6">
            {tab === "class" ? (
              paginatedListClasses.length > 0 ? (
                paginatedListClasses.map((item) => (
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
            ) : paginatedListEvents.length > 0 ? (
              paginatedListEvents.map((item) => (
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
          <PaginationControls
            currentPage={listPage}
            totalPages={totalListPages}
            onPageChange={setListPage}
          />
        </div>
      )}

      {/* CALENDAR VIEW RENDER */}
      {view === "calendar" && (
        <div className="space-y-6">
          <section className="space-y-6" aria-label="Attendance calendar agenda">
            {Object.entries(groupedByDate).length > 0 ? (
              Object.entries(groupedByDate).map(([dateStr, items]) => {
                const firstItem = items[0];
                const dateObj = new Date(firstItem.startsAt);
                const dayNum = dateObj.getDate();
                const dayName = dateObj.toLocaleDateString("en-US", { weekday: "short" });
                const monthName = dateObj.toLocaleDateString("en-US", { month: "short" });

                return (
                  <div key={dateStr} className="flex flex-col md:flex-row gap-4 items-start pb-6 border-b border-border/20 last:border-b-0">
                    {/* Calendar Tear-off Card */}
                    <div className="flex md:flex-col items-center justify-center bg-card border border-border/60 w-full md:w-20 p-3 md:py-4 rounded-2xl shadow-sm shrink-0 gap-2 md:gap-0">
                      <span className="text-[10px] font-bold text-primary uppercase tracking-wider">{monthName}</span>
                      <span className="text-2xl md:text-3xl font-black text-foreground md:-mt-1">{dayNum}</span>
                      <span className="text-[10px] text-muted-foreground uppercase font-medium">{dayName}</span>
                    </div>

                    {/* Sessions Stack */}
                    <div className="flex-1 w-full space-y-3">
                      {items.map((log) => (
                        <div key={log.recordId} className="student-glass-card p-5 flex flex-col sm:flex-row sm:items-center justify-between gap-4 hover:shadow-md transition-all">
                          <div>
                            <div className="flex items-center gap-2">
                              <span className="text-[10px] bg-secondary text-secondary-foreground px-2 py-0.5 rounded font-mono font-semibold">
                                {log.code}
                              </span>
                              <span className="text-[11px] text-muted-foreground">
                                {formatTime(log.startsAt)}
                              </span>
                            </div>
                            <h4 className="font-semibold text-base text-foreground mt-1.5">{log.title}</h4>
                            <p className="text-xs text-muted-foreground mt-1">
                              Verification: <span className="font-medium text-foreground uppercase">{log.verificationMethod}</span>
                            </p>
                          </div>
                          <div className="flex items-center justify-between sm:justify-end gap-3 shrink-0">
                            <StatusBadge label={log.status} tone={getStatusTone(log.status)} />
                            <Button
                              variant="outline"
                              size="sm"
                              onClick={() => fileCorrection(log.record, log.code, log.title)}
                              className="student-btn-secondary px-4 text-xs h-9 gap-1.5 shrink-0 border border-primary/20 hover:bg-primary/5"
                            >
                              <ExternalLink className="h-3 w-3" />
                              <span>Correction Request</span>
                            </Button>
                          </div>
                        </div>
                      ))}
                    </div>
                  </div>
                );
              })
            ) : (
              <EmptyState title="No logs found for the selected filter" />
            )}
          </section>
          <PaginationControls
            currentPage={calendarPage}
            totalPages={totalCalendarPages}
            onPageChange={setCalendarPage}
          />
        </div>
      )}

      {/* VIEW MORE / DETAILS SESSIONS MODAL */}
      {selectedItem && createPortal(
        <section
          className="fixed inset-0 z-[9999] grid place-items-center bg-black/40 p-4 backdrop-blur-md animate-in fade-in-30"
          role="dialog"
          aria-modal="true"
        >
          <div className="w-full max-w-3xl rounded-[28px] border border-border bg-card/90 p-6 shadow-2xl space-y-5 backdrop-blur-xl animate-in zoom-in-95">
            <div className="flex justify-between items-start border-b border-border pb-4">
              <div>
                <span className="text-xs font-mono font-bold uppercase text-primary tracking-wider">
                  {selectedItem.code}
                </span>
                <h2 className="text-xl font-bold text-foreground mt-1">{selectedItem.title}</h2>
                <div className="flex flex-wrap gap-x-4 gap-y-1 mt-1 text-xs text-muted-foreground">
                  <p>Schedule: {selectedItem.sched} | {selectedItem.time}</p>
                  <p className="font-semibold text-primary">
                    {selectedItem.kind === "class" ? `Teacher: ${selectedItem.facultyName}` : `Organizer: ${selectedItem.organizerName}`}
                  </p>
                </div>
              </div>
              <Button variant="ghost" size="sm" onClick={() => setSelectedItem(null)} className="text-foreground hover:bg-secondary">
                ✕ Close
              </Button>
            </div>

            <div className="space-y-4">
              <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 bg-muted/40 p-4 rounded-2xl border border-border/30">
                <h3 className="font-bold text-sm text-foreground">Previous Sessions and Attendance Log</h3>
                <div className="flex flex-wrap gap-2 text-[11px]">
                  <span className="bg-success/15 text-success px-2.5 py-1 rounded-lg border border-success/30 font-semibold uppercase">
                    {selectedRecords.filter((r) => r.status === "present").length} Present
                  </span>
                  <span className="bg-warning/15 text-warning px-2.5 py-1 rounded-lg border border-warning/30 font-semibold uppercase">
                    {selectedRecords.filter((r) => r.status === "late").length} Late
                  </span>
                  <span className="bg-danger/15 text-danger px-2.5 py-1 rounded-lg border border-danger/30 font-semibold uppercase">
                    {selectedRecords.filter((r) => r.status === "absent").length} Absent
                  </span>
                </div>
              </div>

              <div className="space-y-3 max-h-[320px] overflow-y-auto pr-1">
                {selectedSessionRows.length > 0 ? (
                  selectedSessionRows.map((row) => (
                    <div
                      key={row.id}
                      className="flex flex-col sm:flex-row sm:items-center justify-between p-4 rounded-2xl border border-border/30 bg-card/45 hover:bg-card/75 transition-all gap-4"
                    >
                      <div className="flex items-center gap-3">
                        <div className={`p-2.5 rounded-xl shrink-0 ${
                          row.status === "present" ? "bg-success/10 text-success" :
                          row.status === "late" ? "bg-warning/10 text-warning" :
                          "bg-danger/10 text-danger"
                        }`}>
                          <Clock className="h-5 w-5" />
                        </div>
                        <div>
                          <p className="font-semibold text-sm text-foreground">{row.dateTime}</p>
                          <p className="text-[11px] text-muted-foreground mt-0.5">
                            Method: <span className="font-medium text-foreground uppercase">{row.verificationMethod}</span>
                          </p>
                        </div>
                      </div>
                      <div className="flex items-center justify-between sm:justify-end gap-3 shrink-0">
                        <StatusBadge label={row.status} tone={getStatusTone(row.status)} />
                        <Button
                          variant="outline"
                          size="sm"
                          onClick={() => fileCorrection(row.record, selectedItem?.code ?? "", selectedItem?.title ?? "")}
                          className="student-btn-secondary px-4 text-xs h-9 gap-1.5 shrink-0 border border-primary/20 hover:bg-primary/5"
                        >
                          <ExternalLink className="h-3 w-3" />
                          <span>Correction Request</span>
                        </Button>
                      </div>
                    </div>
                  ))
                ) : (
                  <EmptyState title="No session entries recorded" />
                )}
              </div>
            </div>

            <div className="flex justify-end pt-2 border-t border-border">
              <Button onClick={() => setSelectedItem(null)} className="student-btn-primary px-6">Done</Button>
            </div>
          </div>
        </section>,
        document.body
      )}
    </div>
  );
}
