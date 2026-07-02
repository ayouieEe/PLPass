import { useState, useEffect } from "react";
import { AlertTriangle, CalendarCheck, ClipboardList, Nfc, UserCheck, AlertCircle, Calendar } from "lucide-react";
import { NavLink, useNavigate } from "react-router-dom";
import { EmptyState } from "@/components/feedback/EmptyState";
import { ErrorState } from "@/components/feedback/ErrorState";
import { LoadingState } from "@/components/feedback/LoadingState";
import { StatusBadge } from "@/components/feedback/StatusBadge";
import { PageHeader } from "@/components/shared/PageHeader";
import { StatCard } from "@/components/shared/StatCard";
import { Button } from "@/components/ui/button";
import { StudentSelect } from "@/components/forms/StudentSelect";
import { useDevelopmentSession } from "@/hooks/useDevelopmentSession";
import {
  useAcademicCatalog,
  useAttendanceRecords,
  useAttendanceSessions,
  useClasses,
  useEvents,
  useStudents,
  useNfcCredentialForStudent
} from "@/hooks/useRepositoryQueries";
import { APP_ROUTES } from "@/lib/constants/routes";
import type { RepositoryContext } from "@/services/mock/mockRepositoryUtils";
import type {
  AttendanceRecord,
  Event,
  Student
} from "@/types/domain";

type StudentScope = {
  context: RepositoryContext;
  student?: Student;
  studentName: string;
  isLoading: boolean;
  isError: boolean;
};

type ScheduleRow = {
  id: string;
  kind: "class" | "event";
  name: string;
  code: string;
  venue: string;
  startsAt: string;
  endsAt?: string;
  owner: string;
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
  return value ? dateFormatter.format(new Date(value)) : "Not scheduled";
}

function formatTime(value: string | undefined) {
  return value ? timeFormatter.format(new Date(value)) : "Not set";
}

function attendanceRate(records: AttendanceRecord[]) {
  if (records.length === 0) return 0;
  const attended = records.filter((r) => r.status === "present" || r.status === "late").length;
  return Math.round((attended / records.length) * 100);
}

export function StudentDashboardPage() {
  const scope = useStudentScope();
  const navigate = useNavigate();
  const [semesterId, setSemesterId] = useState("");
  const [isFaceEnrolled, setIsFaceEnrolled] = useState(false);
  const [isQrGenerated, setIsQrGenerated] = useState(false);

  useEffect(() => {
    setIsFaceEnrolled(localStorage.getItem("plpass-face-enrolled") === "true");
    setIsQrGenerated(localStorage.getItem("plpass-qr-generated") === "true");
  }, []);

  const catalog = useAcademicCatalog({ pageSize: 50 }, scope.context);
  const classesQuery = useClasses({ pageSize: 100, semesterId: semesterId || undefined }, scope.context);
  const eventsQuery = useEvents({ pageSize: 100 }, scope.context);
  const sessionsQuery = useAttendanceSessions({ pageSize: 100 }, scope.context);
  const recordsQuery = useAttendanceRecords({ pageSize: 500 }, scope.context);
  const nfcCredentialQuery = useNfcCredentialForStudent(scope.student?.id, scope.context);

  if (scope.isLoading) {
    return <LoadingState label="Loading student workspace" />;
  }

  if (scope.isError || !scope.student) {
    return (
      <ErrorState
        title="Student profile unavailable"
        message="The signed-in account does not have an active student profile."
      />
    );
  }

  if (
    classesQuery.isLoading ||
    eventsQuery.isLoading ||
    sessionsQuery.isLoading ||
    recordsQuery.isLoading ||
    catalog.semesters.isLoading ||
    nfcCredentialQuery.isLoading
  ) {
    return <LoadingState label="Loading student dashboard" />;
  }

  if (classesQuery.isError || eventsQuery.isError || recordsQuery.isError) {
    return (
      <ErrorState
        title="Unable to load dashboard data"
        message="An error occurred while loading student record items."
      />
    );
  }

  const classes = classesQuery.data?.items ?? [];
  const events = eventsQuery.data?.items ?? [];
  const sessions = sessionsQuery.data?.items ?? [];
  const records = recordsQuery.data?.items ?? [];
  const nfcStatus = nfcCredentialQuery.data?.status ?? "Not Issued";

  // Filter records matching the active classes (which are filtered by semester)
  const classIds = new Set(classes.map((c) => c.id));
  const classSessions = sessions.filter((s) => s.type === "class" && s.classId && classIds.has(s.classId));
  const classSessionIds = new Set(classSessions.map((s) => s.id));
  const classRecords = records.filter((r) => classSessionIds.has(r.sessionId));

  // Events attended
  const eventSessions = sessions.filter((s) => s.type === "event");
  const eventSessionIds = new Set(eventSessions.map((s) => s.id));
  const eventRecords = records.filter(
    (r) => eventSessionIds.has(r.sessionId) && (r.status === "present" || r.status === "late")
  );

  // Compute Today's Schedule and Upcoming Events
  const today = new Date();
  const scheduleRows: ScheduleRow[] = [];
  const upcomingEvents: Event[] = [];

  classes.forEach((c) => {
    scheduleRows.push({
      id: c.id,
      kind: "class",
      name: c.subjectTitle,
      code: c.subjectCode,
      venue: c.room || "Room TBA",
      startsAt: new Date(today.setHours(9, 0, 0, 0)).toISOString(),
      endsAt: new Date(today.setHours(10, 30, 0, 0)).toISOString(),
      owner: "Professor"
    });
  });

  events.forEach((e) => {
    const isFuture = new Date(e.startsAt) >= new Date();
    if (isFuture) {
      upcomingEvents.push(e);
    }
    // Add to schedule if happening soon
    scheduleRows.push({
      id: e.id,
      kind: "event",
      name: e.title,
      code: e.code,
      venue: e.venue || "Campus Venue",
      startsAt: e.startsAt,
      endsAt: e.endsAt,
      owner: e.organizerId || "Organizer"
    });
  });

  // Sorting schedule items by start time
  scheduleRows.sort((a, b) => a.startsAt.localeCompare(b.startsAt));

  // Determine Alerts / Reminders
  const alerts: { title: string; desc: string; type: "danger" | "warning" | "info" }[] = [];
  const absentRecordsCount = classRecords.filter((r) => r.status === "absent").length;

  if (absentRecordsCount > 0) {
    alerts.push({
      title: `${absentRecordsCount} Unresolved Absences Detected`,
      desc: "Please file an Excused/Correction request to update your attendance records.",
      type: "danger"
    });
  }

  if (nfcStatus !== "activated") {
    alerts.push({
      title: "NFC Credential Issue",
      desc: `Your physical student ID sticker status is current: ${nfcStatus}. Report lost/damaged stickers in verification methods.`,
      type: "warning"
    });
  }

  if (!isFaceEnrolled) {
    alerts.push({
      title: "Biometric Setup Required",
      desc: "You have not enrolled your face for facial recognition attendance. Visit verification methods to register.",
      type: "warning"
    });
  }

  if (!isQrGenerated) {
    alerts.push({
      title: "QR Code Inactive",
      desc: "Generate your secure QR verification token to enable fallback scanner check-ins.",
      type: "info"
    });
  }

  return (
    <div className="space-y-8 p-1">
      <PageHeader
        eyebrow="Student Portal"
        title="Student dashboard"
        description="Monitor your class attendance, view verification options, and verify upcoming events."
        actions={
          <Button asChild className="student-btn-primary px-6">
            <NavLink to={APP_ROUTES.studentCorrections}>Submit Correction</NavLink>
          </Button>
        }
      />

      {/* Semester Selector */}
      <section className="student-glass-card p-6">
        <div className="flex flex-col gap-4 md:flex-row md:items-center md:justify-between">
          <div>
            <h3 className="text-sm font-semibold uppercase tracking-wider text-foreground">Select Academic Term</h3>
            <p className="text-xs text-muted-foreground mt-0.5">Filtering stats, schedules, and class attendance.</p>
          </div>
          <div className="w-full max-w-xs">
            <StudentSelect
              value={semesterId}
              onChange={setSemesterId}
              options={[
                { label: "All Semesters", value: "" },
                ...(catalog.semesters.data?.items.map((sem) => ({
                  label: `${sem.label} (${sem.schoolYear})`,
                  value: sem.id
                })) ?? [])
              ]}
              placeholder="All Semesters"
            />
          </div>
        </div>
      </section>

      {/* Main KPI Stat Cards */}
      <section className="grid gap-6 sm:grid-cols-2 lg:grid-cols-3">
        <StatCard
          className="student-glass-card border-none hover:shadow-lg"
          title="Classes Attendance"
          value={String(classRecords.length)}
          description="Total sessions logged"
          icon={CalendarCheck}
        />
        <StatCard
          className="student-glass-card border-none hover:shadow-lg"
          title="Attendance rate (classes)"
          value={`${attendanceRate(classRecords)}%`}
          description="Enrolled courses check-in rate"
          icon={ClipboardList}
          tone={attendanceRate(classRecords) < 80 ? "warning" : "success"}
        />
        <StatCard
          className="student-glass-card border-none hover:shadow-lg"
          title="Events Attended"
          value={String(eventRecords.length)}
          description="Co-curricular participation logs"
          icon={UserCheck}
        />
      </section>

      {/* Bottom Dashboard Layout: Schedule/Events on Left, Alerts on Right */}
      <section className="grid gap-6 lg:grid-cols-3 items-stretch">
        {/* Left Column: Today's Schedule & Upcoming Campus Events */}
        <div className="lg:col-span-2 flex flex-col gap-6">
          {/* Today's Schedule Card */}
          <div className="student-glass-card p-6 flex flex-col flex-1">
            <div className="flex items-center justify-between mb-4 shrink-0">
              <div className="flex items-center gap-2">
                <Calendar className="h-5 w-5 text-primary" />
                <h3 className="font-semibold text-foreground">Today's Schedule</h3>
              </div>
              <Button
                variant="outline"
                size="sm"
                onClick={() => navigate(`${APP_ROUTES.studentAttendance}?view=calendar`)}
                className="student-btn-secondary px-4 h-9 text-xs"
              >
                View Calendar
              </Button>
            </div>

            <div className="flex-1 overflow-y-auto">
              {scheduleRows.length > 0 ? (
                <div className="space-y-3">
                  {scheduleRows.slice(0, 4).map((item) => (
                    <div
                      key={`${item.kind}-${item.id}`}
                      className="flex items-center justify-between border-b last:border-0 pb-3 last:pb-0 border-border"
                    >
                      <div>
                        <h4 className="font-medium text-sm text-foreground">
                          {item.code} - {item.name}
                        </h4>
                        <p className="text-xs text-muted-foreground mt-1">
                          {formatTime(item.startsAt)} - {formatTime(item.endsAt)} | {item.venue}
                        </p>
                      </div>
                      <StatusBadge label={item.kind} tone={item.kind === "class" ? "info" : "success"} />
                    </div>
                  ))}
                </div>
              ) : (
                <EmptyState title="No classes or events scheduled for today" />
              )}
            </div>
          </div>

          {/* Upcoming Events Card */}
          <div className="student-glass-card p-6 flex flex-col flex-1">
            <div className="flex items-center gap-2 mb-4 shrink-0">
              <Nfc className="h-5 w-5 text-primary" />
              <h3 className="font-semibold text-foreground">Upcoming Campus Events</h3>
            </div>

            <div className="flex-1 overflow-y-auto">
              {upcomingEvents.length > 0 ? (
                <div className="space-y-3">
                  {upcomingEvents.slice(0, 4).map((event) => (
                    <div
                      key={event.id}
                      className="flex items-center justify-between border-b last:border-0 pb-3 last:pb-0 border-border"
                    >
                      <div>
                        <h4 className="font-medium text-sm text-foreground">{event.title}</h4>
                        <p className="text-xs text-muted-foreground mt-1">
                          {formatDate(event.startsAt)} at {formatTime(event.startsAt)} | {event.venue}
                        </p>
                      </div>
                      <span className="text-xs font-semibold px-2.5 py-0.5 rounded-full bg-secondary text-secondary-foreground border border-border">
                        {event.code}
                      </span>
                    </div>
                  ))}
                </div>
              ) : (
                <EmptyState title="No upcoming co-curricular events listed" />
              )}
            </div>
          </div>
        </div>

        {/* Right Column: Alerts & Reminders */}
        <div className="lg:col-span-1">
          <div className="student-glass-card p-6 border-l-4 border-l-primary h-full flex flex-col">
            <div className="flex items-center gap-2 mb-4 shrink-0">
              <AlertTriangle className="h-5 w-5 text-primary" />
              <h3 className="font-semibold text-foreground">Alerts & Reminders</h3>
            </div>

            {alerts.length > 0 ? (
              <div className="space-y-3 flex-1 overflow-y-auto">
                {alerts.map((alert, idx) => {
                  let alertClass = "";
                  if (alert.type === "danger") {
                    alertClass = "border-danger/30 bg-danger-muted/40 text-danger";
                  } else if (alert.type === "warning") {
                    alertClass = "border-warning/30 bg-warning-muted/40 text-warning";
                  } else {
                    alertClass = "border-info/30 bg-info-muted/40 text-info";
                  }
                  return (
                    <div
                      key={idx}
                      className={`flex gap-3 rounded-2xl border p-4 text-sm leading-relaxed ${alertClass}`}
                    >
                      <AlertCircle className="h-5 w-5 shrink-0 mt-0.5" />
                      <div>
                        <h4 className="font-semibold">{alert.title}</h4>
                        <p className="mt-1 text-xs opacity-90">{alert.desc}</p>
                      </div>
                    </div>
                  );
                })}
              </div>
            ) : (
              <div className="flex-1 flex flex-col items-center justify-center text-center p-6 border border-dashed border-border rounded-2xl bg-white/30">
                <div className="h-12 w-12 rounded-full bg-primary/10 flex items-center justify-center text-primary mb-3 shadow-inner">
                  <svg
                    className="h-6 w-6 text-primary"
                    fill="none"
                    viewBox="0 0 24 24"
                    stroke="currentColor"
                    strokeWidth={2}
                  >
                    <path strokeLinecap="round" strokeLinejoin="round" d="M5 13l4 4L19 7" />
                  </svg>
                </div>
                <h4 className="font-semibold text-sm text-foreground">All Caught Up</h4>
                <p className="text-xs text-muted-foreground mt-1 max-w-[200px]">
                  No pending alerts or required actions at this time.
                </p>
              </div>
            )}
          </div>
        </div>
      </section>
    </div>
  );
}
