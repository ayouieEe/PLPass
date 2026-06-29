import { useMemo, useState } from "react";
import type { ColumnDef } from "@tanstack/react-table";
import { CreditCard, QrCode, ScanFace, ShieldCheck } from "lucide-react";
import { StatusBadge } from "@/components/feedback/StatusBadge";
import { LoadingState } from "@/components/feedback/LoadingState";
import { StatCard } from "@/components/shared/StatCard";
import { PLPassDataGrid } from "@/components/data-display/PLPassDataGrid";
import { Button } from "@/components/ui/button";
import {
  AdminContextBar,
  AdminFrame,
  AdminPageHeader,
  AdminTabs,
  AdminToolbar,
  UnavailablePanel,
  compactProgram,
  formatDate,
  formatStatus,
  maskIdentifier,
  statusTone,
  useAdminScope,
  userName
} from "@/features/admin/components/AdminPage";
import { useNfcCredentialRequests, useNfcCredentials, useStudents, useUsers } from "@/hooks/useRepositoryQueries";
import type { NfcCredential, Student } from "@/types/domain";

type AuthTab = "nfc" | "qr" | "face";

type PlaceholderCredentialRow = Student & {
  credentialStatus: string;
};

export function NfcCredentialsPage() {
  const scope = useAdminScope();
  const [tab, setTab] = useState<AuthTab>("nfc");
  const [search, setSearch] = useState("");
  const [status, setStatus] = useState("all");
  const users = useUsers({ pageSize: 100 }, scope.context);
  const students = useStudents({ pageSize: 100, departmentId: scope.department?.id }, scope.context);
  const credentials = useNfcCredentials({ pageSize: 100, credentialStatus: status === "all" ? undefined : status as NfcCredential["status"] }, scope.context);
  const requests = useNfcCredentialRequests({ pageSize: 100 }, scope.context);

  const visibleCredentials = (credentials.data?.items ?? []).filter((credential) => {
    const student = students.data?.items.find((item) => item.id === credential.studentId);
    const haystack = [credential.status, credential.id, student?.studentNumber, userName(users.data?.items ?? [], student?.userId)].join(" ").toLowerCase();
    return haystack.includes(search.toLowerCase());
  });

  const nfcColumns = useMemo<ColumnDef<NfcCredential>[]>(() => [
    { header: "Student Name", cell: ({ row }) => userName(users.data?.items ?? [], students.data?.items.find((student) => student.id === row.original.studentId)?.userId) },
    { header: "Student ID", cell: ({ row }) => students.data?.items.find((student) => student.id === row.original.studentId)?.studentNumber ?? row.original.studentId },
    { header: "Program", cell: ({ row }) => compactProgram(scope.programs, students.data?.items.find((student) => student.id === row.original.studentId)?.programId) },
    { header: "Section", cell: ({ row }) => students.data?.items.find((student) => student.id === row.original.studentId)?.section ?? "Section" },
    { header: "Credential Reference", cell: ({ row }) => maskIdentifier(row.original.nfcUid) },
    { header: "Date Issued", cell: ({ row }) => formatDate(row.original.issuedAt) },
    { header: "Status", cell: ({ row }) => <StatusBadge label={formatStatus(row.original.status)} tone={statusTone(row.original.status)} /> },
    { header: "Replacement Request Status", cell: ({ row }) => requests.data?.items.find((request) => request.credentialId === row.original.id)?.status ?? "None" },
    { header: "View Details", cell: () => <Button type="button" size="sm" variant="outline">View</Button> }
  ], [requests.data?.items, scope.programs, students.data?.items, users.data?.items]);

  const placeholderColumns = useMemo<ColumnDef<PlaceholderCredentialRow>[]>(() => [
    { header: "Student Name", cell: ({ row }) => userName(users.data?.items ?? [], row.original.userId) },
    { header: "Student ID", accessorKey: "studentNumber" },
    { header: "Program", cell: ({ row }) => compactProgram(scope.programs, row.original.programId) },
    { header: "Section", accessorKey: "section" },
    { header: "Credential Reference", cell: () => "Not issued by current backend" },
    { header: "Date Created", cell: () => "Unavailable" },
    { header: "Status", cell: ({ row }) => <StatusBadge label={row.original.credentialStatus} tone="muted" /> },
    { header: "View Details", cell: () => <Button type="button" size="sm" variant="outline" disabled>View</Button> }
  ], [scope.programs, users.data?.items]);

  const activeNfcCount = (credentials.data?.items ?? []).filter((credential) => credential.status === "activated").length;
  const pendingRequests = (requests.data?.items ?? []).filter((request) => request.status === "pending").length;

  return (
    <AdminFrame>
      <AdminPageHeader title="Authentication Methods" accessibleTitle="Authentication methods" description="Dean-scoped credential status review without exposing token secrets or biometric data." />
      <AdminContextBar department={scope.department} semester={scope.activeSemester} />
      <section className="grid gap-4 md:grid-cols-2 xl:grid-cols-4">
        <StatCard title="Students with active NFC credentials" value={String(activeNfcCount)} icon={ShieldCheck} />
        <StatCard title="Students with QR credentials" value="0" icon={QrCode} description="No QR credential repository is available yet." />
        <StatCard title="Students with facial enrollment" value="0" icon={ScanFace} description="No biometric repository is available." />
        <StatCard title="Pending replacements" value={String(pendingRequests)} icon={CreditCard} />
      </section>
      <AdminTabs
        label="Authentication methods tabs"
        selected={tab}
        onSelect={setTab}
        tabs={[
          { label: "NFC Credentials", value: "nfc" },
          { label: "QR Credentials", value: "qr" },
          { label: "Facial Recognition", value: "face" }
        ]}
      />
      <AdminToolbar
        search={search}
        onSearchChange={setSearch}
        searchPlaceholder="Search credential records"
        selectedFilter={status}
        filters={[
          { label: "All", value: "all" },
          { label: "Active", value: "activated" },
          { label: "Damaged", value: "damaged" },
          { label: "Blocked", value: "blocked" },
          { label: "Inactive", value: "inactive" }
        ]}
        onFilterChange={setStatus}
      />
      {scope.isLoading || credentials.isLoading || students.isLoading || users.isLoading ? <LoadingState label="Loading authentication methods" /> : null}
      {tab === "nfc" ? <PLPassDataGrid label="NFC credentials" data={visibleCredentials} columns={nfcColumns} emptyTitle="No NFC credentials found" emptyDescription="No NFC credential records match the selected filters." /> : null}
      {tab === "qr" ? (
        <>
          <UnavailablePanel title="QR Credentials" message="QR attendance fallback will be implemented in Phase 11. QR credential storage and generation are not supported by the current repository. No QR token secrets are displayed or generated in the browser." />
          <p className="text-sm text-muted-foreground">QR attendance fallback will be implemented in Phase 11.</p>
          <PLPassDataGrid label="QR credentials" data={[]} columns={placeholderColumns} emptyTitle="No QR credentials available" emptyDescription="QR credentials require backend support before records can appear." />
        </>
      ) : null}
      {tab === "face" ? (
        <>
          <UnavailablePanel title="Facial Enrollment" message="Facial Recognition is outside the PLPass MVP and will not be implemented in the current version. Facial biometric storage is not part of the current backend. No templates, embeddings, or private media are stored or displayed." />
          <p className="text-sm text-muted-foreground">Facial Recognition is outside the PLPass MVP and will not be implemented in the current version.</p>
          <PLPassDataGrid label="Facial enrollment" data={[]} columns={placeholderColumns} emptyTitle="No facial enrollment records" emptyDescription="Facial enrollment requires an approved secure backend before records can appear." />
        </>
      ) : null}
    </AdminFrame>
  );
}
