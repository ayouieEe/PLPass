import { useMemo, useState } from "react";
import type { ColumnDef } from "@tanstack/react-table";
import { StatusBadge } from "@/components/feedback/StatusBadge";
import { LoadingState } from "@/components/feedback/LoadingState";
import { PLPassDataGrid } from "@/components/data-display/PLPassDataGrid";
import { Button } from "@/components/ui/button";
import {
  AdminContextBar,
  AdminFrame,
  AdminPageHeader,
  AdminTabs,
  AdminToolbar,
  DetailPanel,
  UnavailablePanel,
  compactProgram,
  formatDate,
  formatStatus,
  formatTimeRange,
  statusTone,
  useAdminScope,
  userName
} from "@/features/admin/components/AdminPage";
import { useClasses, useEventStatusMutation, useEvents, useFacultyProfiles, useStudents, useUsers } from "@/hooks/useRepositoryQueries";
import type { Class, Event } from "@/types/domain";

type AcademicTab = "classes" | "events";
type EventView = "approved" | "pending";

export function AcademicManagementPage() {
  const scope = useAdminScope();
  const [tab, setTab] = useState<AcademicTab>("classes");
  const [eventView, setEventView] = useState<EventView>("approved");
  const [search, setSearch] = useState("");
  const [selectedDetail, setSelectedDetail] = useState<string | null>(null);
  const [declineReason, setDeclineReason] = useState("");

  const users = useUsers({ pageSize: 100 }, scope.context);
  const faculty = useFacultyProfiles({ pageSize: 100 }, scope.context);
  const students = useStudents({ pageSize: 100 }, scope.context);
  const classes = useClasses({ pageSize: 100, search }, scope.context);
  const events = useEvents({ pageSize: 100, search }, scope.context);
  const updateEventStatus = useEventStatusMutation(scope.context);

  const visibleEvents = (events.data?.items ?? []).filter((event) => event.status === eventView);
  const classRows = classes.data?.items ?? [];

  const classColumns = useMemo<ColumnDef<Class>[]>(() => [
    { header: "Subject Code", accessorKey: "subjectCode" },
    { header: "Subject Name", cell: ({ row }) => `Class: ${row.original.subjectTitle}` },
    { header: "Assigned Faculty", cell: ({ row }) => {
      const profile = faculty.data?.items.find((item) => item.id === row.original.facultyId);
      return userName(users.data?.items ?? [], profile?.userId);
    } },
    { header: "Room", accessorKey: "room" },
    { header: "Schedule", accessorKey: "scheduleLabel" },
    { header: "Enrolled Students", cell: ({ row }) => students.data?.items.filter((student) => student.departmentId === row.original.departmentId).length ?? 0 },
    { header: "Class Status", cell: ({ row }) => <StatusBadge label={formatStatus(row.original.status)} tone={statusTone(row.original.status)} /> },
    { header: "View Details", cell: ({ row }) => <Button type="button" size="sm" variant="outline" onClick={() => setSelectedDetail(row.original.id)}>View</Button> }
  ], [faculty.data?.items, students.data?.items, users.data?.items]);

  const eventColumns = useMemo<ColumnDef<Event>[]>(() => [
    { header: "Event Code", accessorKey: "code" },
    { header: "Event Name", cell: ({ row }) => `Event: ${row.original.title}` },
    { header: "Category", accessorKey: "category" },
    { header: "Venue", accessorKey: "venue" },
    { header: "Date", cell: ({ row }) => formatDate(row.original.startsAt) },
    { header: "Time", cell: ({ row }) => formatTimeRange(row.original.startsAt, row.original.endsAt) },
    { header: "Participant Count", cell: () => "Repository detail" },
    { header: "Approval Status", cell: ({ row }) => <StatusBadge label={formatStatus(row.original.status)} tone={statusTone(row.original.status)} /> },
    {
      header: "Approval Action",
      cell: ({ row }) => (
        <div className="flex flex-wrap gap-2">
          <Button
            size="sm"
            type="button"
            disabled={row.original.status !== "pending"}
            onClick={() => updateEventStatus.mutate({ eventId: row.original.id, status: "approved" })}
          >
            Approve
          </Button>
          <Button
            size="sm"
            variant="outline"
            type="button"
            disabled={row.original.status !== "pending" || !declineReason.trim()}
            onClick={() => updateEventStatus.mutate({ eventId: row.original.id, status: "rejected", reason: declineReason })}
          >
            Decline
          </Button>
          <Button type="button" size="sm" variant="outline" onClick={() => setSelectedDetail(row.original.id)}>View Details</Button>
        </div>
      )
    }
  ], [declineReason, updateEventStatus]);

  return (
    <AdminFrame>
      <AdminPageHeader title="Academic Management" accessibleTitle="Academic management" description="Dean-scoped classes, rosters, and event approval queues." />
      <AdminContextBar department={scope.department} semester={scope.activeSemester} />
      <AdminTabs
        label="Academic management tabs"
        selected={tab}
        onSelect={(value) => {
          setTab(value);
          setSelectedDetail(null);
        }}
        tabs={[
          { label: "Classes", value: "classes" },
          { label: "Events", value: "events" }
        ]}
      />
      <AdminToolbar search={search} onSearchChange={setSearch} searchPlaceholder="Search academic records">
        <StatusBadge label={`Program filter: ${scope.programs.length ? "Available" : "No programs"}`} tone="muted" />
        <StatusBadge label="Year level filter: all" tone="muted" />
      </AdminToolbar>

      {tab === "classes" ? (
        <UnavailablePanel title="Class assignment actions" message="Class creation and roster add/remove actions depend on existing repository mutation support. Destructive roster changes should use confirmation in a supported detail workflow." />
      ) : (
        <div className="space-y-3">
          <AdminTabs
            label="Events review tabs"
            selected={eventView}
            onSelect={setEventView}
            tabs={[
              { label: "Approved Events", value: "approved" },
              { label: "Pending Events", value: "pending" }
            ]}
          />
          {eventView === "pending" ? (
            <label className="block max-w-xl space-y-2 text-sm font-medium">
              <span>Decline reason</span>
              <input className="plpass-field h-10 w-full rounded-md border px-3" value={declineReason} onChange={(event) => setDeclineReason(event.target.value)} placeholder="Required before declining an event" />
            </label>
          ) : null}
        </div>
      )}

      {scope.isLoading || classes.isLoading || events.isLoading || users.isLoading || faculty.isLoading ? <LoadingState label="Loading academic records" /> : null}
      {tab === "classes" ? <PLPassDataGrid label="Academic classes" data={classRows} columns={classColumns} emptyTitle="No classes found" emptyDescription="No classes match the selected semester and Dean scope." /> : null}
      {tab === "events" ? <PLPassDataGrid label="Academic events" data={visibleEvents} columns={eventColumns} emptyTitle={`No ${eventView} events found`} emptyDescription="No events match the selected review queue." /> : null}
      <div className="sr-only" aria-label="Visible academic record names">
        {tab === "classes" ? classRows.map((classRecord) => <span key={classRecord.id}>{classRecord.subjectTitle}</span>) : null}
        {tab === "events" ? visibleEvents.map((event) => <span key={event.id}>{event.title}</span>) : null}
      </div>

      <DetailPanel title="Academic details">
        {selectedDetail ? `Selected academic record: ${selectedDetail}. Details should show class information, faculty assignment, roster, sessions, attendance summary, and supported report actions.` : `Selected semester includes ${classRows.length} class records across ${scope.programs.map((program) => compactProgram(scope.programs, program.id)).join(", ") || "assigned programs"}.`}
      </DetailPanel>
    </AdminFrame>
  );
}
