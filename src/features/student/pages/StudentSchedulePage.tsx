import type { ColDef } from "ag-grid-community";
import { ErrorState } from "@/components/feedback/ErrorState";
import { LoadingState } from "@/components/feedback/LoadingState";
import { StatusBadge } from "@/components/feedback/StatusBadge";
import { PLPassDataGrid } from "@/components/data-display/PLPassDataGrid";
import { PageHeader } from "@/components/shared/PageHeader";
import { useDevelopmentSession } from "@/hooks/useDevelopmentSession";
import {
  useClasses,
  useEvents,
  useFacultyProfiles,
  useOrganizerProfiles,
  useStudents
} from "@/hooks/useRepositoryQueries";
import type { RepositoryContext } from "@/services/mock/mockRepositoryUtils";
import type { Class, Event, FacultyProfile, OrganizerProfile, Student } from "@/types/domain";

type StudentScope = {
  context: RepositoryContext;
  student?: Student;
  isLoading: boolean;
  isError: boolean;
};

type ScheduleRow = {
  id: string;
  kind: "class" | "event";
  code: string;
  title: string;
  owner: string;
  venue: string;
  schedule: string;
  status: Class["status"] | Event["status"];
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
    isLoading: studentQuery.isLoading,
    isError: studentQuery.isError
  };
}

function formatEventSchedule(event: Event) {
  return `${dateFormatter.format(new Date(event.startsAt))} ${timeFormatter.format(new Date(event.startsAt))} - ${timeFormatter.format(new Date(event.endsAt))}`;
}

function buildRows(
  classes: Class[],
  events: Event[],
  faculty: FacultyProfile[],
  organizers: OrganizerProfile[]
): ScheduleRow[] {
  const classRows: ScheduleRow[] = classes.map((classRecord) => ({
    id: classRecord.id,
    kind: "class",
    code: classRecord.subjectCode,
    title: classRecord.subjectTitle,
    owner: faculty.find((profile) => profile.id === classRecord.facultyId)?.title ?? "Faculty",
    venue: classRecord.room,
    schedule: classRecord.scheduleLabel,
    status: classRecord.status
  }));

  const eventRows: ScheduleRow[] = events.map((event) => ({
    id: event.id,
    kind: "event",
    code: event.code,
    title: event.title,
    owner: organizers.find((profile) => profile.id === event.organizerId)?.organizationName ?? "Organizer",
    venue: event.venue,
    schedule: formatEventSchedule(event),
    status: event.status
  }));

  return [...classRows, ...eventRows].sort((a, b) => a.code.localeCompare(b.code));
}

const columns: ColDef<ScheduleRow>[] = [
  { field: "kind", headerName: "Type", minWidth: 120 },
  { field: "code", headerName: "Code", minWidth: 130 },
  { field: "title", headerName: "Title", minWidth: 220 },
  { field: "owner", headerName: "Faculty / Organizer", minWidth: 220 },
  { field: "venue", headerName: "Room / Venue", minWidth: 170 },
  { field: "schedule", headerName: "Schedule", minWidth: 230 },
  {
    field: "status",
    headerName: "Status",
    minWidth: 140,
    cellRenderer: ({ data }: { data?: ScheduleRow }) => (data ? <StatusBadge label={data.status} tone="muted" /> : null)
  }
];

export function StudentSchedulePage() {
  const scope = useStudentScope();
  const classesQuery = useClasses({ pageSize: 100 }, scope.context);
  const eventsQuery = useEvents({ pageSize: 100 }, scope.context);
  const facultyQuery = useFacultyProfiles({ pageSize: 100 }, scope.context);
  const organizerQuery = useOrganizerProfiles({ pageSize: 100 }, scope.context);

  if (scope.isLoading) {
    return <LoadingState label="Loading student workspace" />;
  }

  if (scope.isError || !scope.student) {
    return <ErrorState title="Student profile unavailable" message="The signed-in mock account does not have a student profile fixture." />;
  }

  if (classesQuery.isLoading || eventsQuery.isLoading || facultyQuery.isLoading || organizerQuery.isLoading) {
    return <LoadingState label="Loading student schedule" />;
  }

  const rows = buildRows(
    classesQuery.data?.items ?? [],
    eventsQuery.data?.items ?? [],
    facultyQuery.data?.items ?? [],
    organizerQuery.data?.items ?? []
  );

  return (
    <div className="space-y-6">
      <PageHeader
        eyebrow="Student"
        title="Schedule"
        description="Review your student-scoped class and event schedule."
      />
      <PLPassDataGrid
        label="Student schedule"
        data={rows}
        columns={columns}
        emptyTitle="No schedule items"
        emptyDescription="No classes or events are currently scoped to this student account."
      />
    </div>
  );
}
