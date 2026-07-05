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
  AdminTableExportActions,
  AdminToolbar,
  DetailPanel,
  formatDate,
  formatStatus,
  formatTimeRange,
  statusTone,
  useAdminScope
} from "@/features/admin/components/AdminPage";
import { useEventStatusMutation, useEvents } from "@/hooks/useRepositoryQueries";
import type { Event } from "@/types/domain";

type EventQueue = "approved" | "pending";

export function AcademicManagementPage() {
  const scope = useAdminScope();
  const [queue, setQueue] = useState<EventQueue>("approved");
  const [search, setSearch] = useState("");
  const [declineReason, setDeclineReason] = useState("");
  const [selectedEventId, setSelectedEventId] = useState<string | null>(null);

  const events = useEvents({ pageSize: 100, search, departmentId: scope.department?.id }, scope.context);
  const updateEventStatus = useEventStatusMutation(scope.context);

  const eventRows = useMemo(
    () => (events.data?.items ?? []).filter((event) => event.status === queue),
    [events.data?.items, queue]
  );
  const selectedEvent = eventRows.find((event) => event.id === selectedEventId);

  const eventColumns = useMemo<ColumnDef<Event>[]>(() => [
    { header: "Event Code", accessorKey: "code" },
    { header: "Event Name", cell: ({ row }) => row.original.title },
    { header: "Category", accessorKey: "category" },
    { header: "Venue", accessorKey: "venue" },
    { header: "Date", cell: ({ row }) => formatDate(row.original.startsAt) },
    { header: "Time", cell: ({ row }) => formatTimeRange(row.original.startsAt, row.original.endsAt) },
    { header: "Participant Scope", cell: ({ row }) => row.original.departmentId ? "Department" : "Campus-wide" },
    { header: "Approval Status", cell: ({ row }) => <StatusBadge label={formatStatus(row.original.status)} tone={statusTone(row.original.status)} /> },
    {
      header: "Actions",
      cell: ({ row }) => (
        <div className="flex flex-wrap gap-2">
          <Button type="button" size="sm" variant="outline" onClick={() => setSelectedEventId(row.original.id)}>
            View
          </Button>
          {row.original.status === "pending" ? (
            <>
              <Button
                size="sm"
                type="button"
                onClick={() => updateEventStatus.mutate({ eventId: row.original.id, status: "approved" })}
              >
                Approve
              </Button>
              <Button
                size="sm"
                variant="outline"
                type="button"
                disabled={!declineReason.trim()}
                onClick={() => updateEventStatus.mutate({ eventId: row.original.id, status: "rejected", reason: declineReason })}
              >
                Decline
              </Button>
            </>
          ) : null}
        </div>
      )
    }
  ], [declineReason, updateEventStatus]);

  return (
    <AdminFrame>
      <AdminPageHeader title="Event Management" accessibleTitle="Event management" description="Review, approve, and monitor department event sessions." />
      <AdminContextBar department={scope.department} semester={scope.activeSemester} />
      <AdminToolbar search={search} onSearchChange={setSearch} searchPlaceholder="Search events">
        <StatusBadge label="List view" tone="info" />
      </AdminToolbar>
      <AdminTabs
        label="Event approval queues"
        selected={queue}
        onSelect={(value) => {
          setQueue(value);
          setSelectedEventId(null);
        }}
        tabs={[
          { label: "Approved Events", value: "approved" },
          { label: "Pending Events", value: "pending" }
        ]}
      />
      {queue === "pending" ? (
        <label className="block max-w-xl space-y-2 text-sm font-medium">
          <span>Decline reason</span>
          <input
            className="plpass-field h-10 w-full rounded-md border px-3"
            value={declineReason}
            onChange={(event) => setDeclineReason(event.target.value)}
            placeholder="Required before declining an event"
          />
        </label>
      ) : null}
      {scope.isLoading || events.isLoading ? <LoadingState label="Loading event records" /> : null}
      <PLPassDataGrid
        label={queue === "approved" ? "Approved events" : "Pending events"}
        data={eventRows}
        columns={eventColumns}
        emptyTitle={`No ${queue} events found`}
        emptyDescription="Events submitted by organizers will appear here when they match the selected Dean scope."
        toolbarActions={<AdminTableExportActions />}
      />
      <div className="sr-only" aria-label="Visible event record names">
        {eventRows.map((event) => <span key={event.id}>Event record {event.title}</span>)}
      </div>
      {selectedEvent ? (
        <DetailPanel title="Event details">
          <div className="grid gap-2 md:grid-cols-2">
            <p>Event: {selectedEvent.title}</p>
            <p>Category: {selectedEvent.category}</p>
            <p>Venue: {selectedEvent.venue}</p>
            <p>Schedule: {formatDate(selectedEvent.startsAt)} / {formatTimeRange(selectedEvent.startsAt, selectedEvent.endsAt)}</p>
            <p>Participant scope: {selectedEvent.departmentId ? "Department" : "Campus-wide"}</p>
            <p>Status: {formatStatus(selectedEvent.status)}</p>
          </div>
        </DetailPanel>
      ) : null}
    </AdminFrame>
  );
}
