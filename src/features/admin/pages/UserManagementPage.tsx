import { useMemo, useState } from "react";
import type { ColumnDef } from "@tanstack/react-table";
import { StatusBadge } from "@/components/feedback/StatusBadge";
import { LoadingState } from "@/components/feedback/LoadingState";
import { PLPassDataGrid } from "@/components/data-display/PLPassDataGrid";
import type { PLPassDataGridProps } from "@/components/data-display/plpassDataGridTypes";
import { Button } from "@/components/ui/button";
import {
  AdminContextBar,
  AdminFrame,
  AdminPageHeader,
  AdminTabs,
  AdminTableExportActions,
  AdminToolbar,
  DetailPanel,
  compactProgram,
  departmentName,
  formatStatus,
  programLabel,
  statusTone,
  useAdminScope,
  userName
} from "@/features/admin/components/AdminPage";
import { useAttendanceRecords, useClasses, useNfcCredentials, useOrganizerProfiles, useStudents, useUsers } from "@/hooks/useRepositoryQueries";
import type { OrganizerProfile, Student } from "@/types/domain";

type UserTab = "students" | "organizers";
type ActiveUserGrid = Pick<PLPassDataGridProps<object>, "label" | "data" | "columns" | "emptyTitle" | "emptyDescription">;

export function UserManagementPage() {
  const scope = useAdminScope();
  const [tab, setTab] = useState<UserTab>("students");
  const [search, setSearch] = useState("");
  const [status, setStatus] = useState("all");
  const [selectedDetail, setSelectedDetail] = useState<string | null>(null);

  const users = useUsers({ pageSize: 100 }, scope.context);
  const students = useStudents({ pageSize: 100, search }, scope.context);
  const organizers = useOrganizerProfiles({ pageSize: 100, search }, scope.context);
  const detailPageSize = selectedDetail ? 100 : 1;
  const classes = useClasses({ pageSize: detailPageSize, departmentId: scope.department?.id }, scope.context);
  const records = useAttendanceRecords({ pageSize: detailPageSize }, scope.context);
  const credentials = useNfcCredentials({ pageSize: detailPageSize }, scope.context);

  const visibleStudents = (students.data?.items ?? []).filter((student) => status === "all" || student.status === status);
  const visibleOrganizers = organizers.data?.items ?? [];

  const studentColumns = useMemo<ColumnDef<Student>[]>(() => [
    { header: "Full Name", cell: ({ row }) => userName(users.data?.items ?? [], row.original.userId) },
    { header: "Student ID", cell: ({ row }) => row.original.studentNumber },
    { header: "Email", cell: ({ row }) => users.data?.items.find((user) => user.id === row.original.userId)?.email ?? "No email" },
    { header: "Department", cell: ({ row }) => departmentName(scope.departments, row.original.departmentId) },
    { header: "Program", cell: ({ row }) => compactProgram(scope.programs, row.original.programId) },
    { header: "Year Level", accessorKey: "yearLevel" },
    { header: "Section", accessorKey: "section" },
    { header: "Enrollment Status", cell: ({ row }) => <StatusBadge label={formatStatus(row.original.status)} tone={statusTone(row.original.status)} /> },
    { header: "View Details", cell: ({ row }) => <Button type="button" size="sm" variant="outline" onClick={() => setSelectedDetail(row.original.id)}>View</Button> }
  ], [scope.departments, scope.programs, users.data?.items]);

  const organizerColumns = useMemo<ColumnDef<OrganizerProfile>[]>(() => [
    { header: "Full Name", cell: ({ row }) => userName(users.data?.items ?? [], row.original.userId) },
    { header: "Organizer Type", cell: () => "Event organizer" },
    { header: "Employee ID", accessorKey: "employeeNumber" },
    { header: "Department", cell: ({ row }) => departmentName(scope.departments, row.original.departmentId) },
    { header: "Position", accessorKey: "position" },
    { header: "Status", cell: ({ row }) => <StatusBadge label={formatStatus(row.original.employmentStatus)} tone={statusTone(row.original.employmentStatus)} /> },
    { header: "View Details", cell: ({ row }) => <Button type="button" size="sm" variant="outline" onClick={() => setSelectedDetail(row.original.id)}>View</Button> }
  ], [scope.departments, users.data?.items]);

  const activeQuery = tab === "students" ? students : organizers;
  const loading = scope.isLoading || users.isLoading || activeQuery.isLoading;
  const activeGrid: ActiveUserGrid =
    tab === "students"
      ? {
          label: "Student users",
          data: visibleStudents as object[],
          columns: studentColumns as PLPassDataGridProps<object>["columns"],
          emptyTitle: "No students found",
          emptyDescription: "No student records match the selected Dean scope and filters."
        }
      : {
          label: "Organizer users",
          data: visibleOrganizers as object[],
          columns: organizerColumns as PLPassDataGridProps<object>["columns"],
          emptyTitle: "No organizers found",
          emptyDescription: "No organizer records match the assigned department scope."
        };

  const selectedStudent = visibleStudents.find((student) => student.id === selectedDetail);

  return (
    <AdminFrame>
      <AdminPageHeader title="User Management" accessibleTitle="User management" description="Dean-scoped student and organizer directory." />
      <AdminContextBar department={scope.department} semester={scope.activeSemester} />
      <AdminTabs
        label="User management tabs"
        selected={tab}
        onSelect={(value) => {
          setTab(value);
          setSelectedDetail(null);
        }}
        tabs={[
          { label: "Students", value: "students" },
          { label: "Organizers", value: "organizers" }
        ]}
      />
      <AdminToolbar
        search={search}
        searchPlaceholder="Search users"
        onSearchChange={setSearch}
        selectedFilter={status}
        filters={tab === "students" ? [
          { label: "All", value: "all" },
          { label: "Enrolled", value: "enrolled" },
          { label: "LOA", value: "loa" },
          { label: "Dropped", value: "dropped" },
          { label: "Archived", value: "archived" }
        ] : undefined}
        onFilterChange={setStatus}
      />
      {loading ? <LoadingState label="Loading user management records" /> : null}
      <PLPassDataGrid
        label={activeGrid.label}
        data={activeGrid.data}
        columns={activeGrid.columns}
        emptyTitle={activeGrid.emptyTitle}
        emptyDescription={activeGrid.emptyDescription}
        toolbarActions={<AdminTableExportActions />}
      />
      <div className="sr-only" aria-label="Visible user record identifiers">
        {tab === "students" ? visibleStudents.map((student) => <span key={student.id}>{student.studentNumber}</span>) : null}
        {tab === "organizers" ? visibleOrganizers.map((profile) => <span key={profile.id}>{profile.organizationName}</span>) : null}
      </div>
      {selectedDetail ? (
        <DetailPanel title="Details">
          {selectedStudent ? (
          <div className="grid gap-2 md:grid-cols-2">
            <p>Student: {userName(users.data?.items ?? [], selectedStudent.userId)}</p>
            <p>Program: {programLabel(scope.programs, selectedStudent.programId)}</p>
            <p>Current class enrollments: {classes.data?.items.filter((item) => item.departmentId === selectedStudent.departmentId).length ?? 0}</p>
            <p>Recent attendance records: {records.data?.items.filter((item) => item.studentId === selectedStudent.id).length ?? 0}</p>
            <p>Credential status: {credentials.data?.items.find((item) => item.studentId === selectedStudent.id)?.status ?? "No credential on file"}</p>
          </div>
        ) : (
          <p>Selected record: {selectedDetail}. Detailed editing is available only where repository mutations currently exist.</p>
        )}
        </DetailPanel>
      ) : null}
    </AdminFrame>
  );
}
