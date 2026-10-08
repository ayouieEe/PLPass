import { useMemo, useState } from "react";
import type { ColDef, ICellRendererParams } from "ag-grid-community";
import type { ReactNode } from "react";
import { Download, Filter, QrCode, Search, UserCheck, X, XCircle } from "lucide-react";
import { toast } from "sonner";
import { StatusBadge } from "@/components/feedback/StatusBadge";
import { ConfirmModal } from "@/components/modals/ConfirmModal";
import { PLPassDataGrid } from "@/components/data-display/PLPassDataGrid";
import { PageHeader } from "@/components/shared/PageHeader";
import { Button } from "@/components/ui/button";
import { useDevelopmentSession } from "@/hooks/useDevelopmentSession";
import { useStudentCredentialMutations, useStudentCredentialStatuses, useStudents } from "@/hooks/useRepositoryQueries";
import { exportQrCredentialsPdf, exportQrCredentialsXlsx } from "@/features/organizer/utils/exportUtils";

type QrStatus = "Active" | "Deactivated" | "Not issued";
type QrRow = { studentId: string; studentName: string; studentNumber: string; credentialId: string; status: QrStatus; dateGenerated: string; lastUsed: string };

function CredentialMetric({ label, value, icon, tone = "default" }: { label: string; value: number; icon: ReactNode; tone?: "default" | "success" | "danger" }) {
  const colors = { default: "bg-primary/10 text-primary", success: "bg-success-muted text-success", danger: "bg-danger-muted text-danger" };
  return <article className="group relative overflow-hidden rounded-xl border bg-surface p-4 shadow-sm transition hover:-translate-y-0.5 hover:shadow-md"><div className="absolute inset-x-0 top-0 h-0.5 bg-primary/35" /><div className="flex items-start justify-between gap-3"><div><p className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">{label}</p><p className="mt-2 text-2xl font-semibold tracking-tight text-foreground">{value}</p></div><span className={`grid h-9 w-9 place-items-center rounded-lg ${colors[tone]}`}>{icon}</span></div></article>;
}

function qrTone(status: QrStatus) { return status === "Active" ? "success" as const : status === "Deactivated" ? "danger" as const : "warning" as const; }
function formatDate(value?: string | null) { return value ? new Date(value).toLocaleDateString() : "-"; }

export function AuthenticationMethodsPage() {
  const { session } = useDevelopmentSession();
  const context = session ? { actorUserId: session.userId, actorRole: session.role } : undefined;
  const students = useStudents({ pageSize: 100 }, context);
  const statuses = useStudentCredentialStatuses(context, undefined, true);
  const mutations = useStudentCredentialMutations(context);
  const [searchQuery, setSearchQuery] = useState("");
  const [statusFilter, setStatusFilter] = useState<"All" | QrStatus>("All");
  const [selectedRow, setSelectedRow] = useState<QrRow | null>(null);
  const [exportOpen, setExportOpen] = useState(false);
  const [exporting, setExporting] = useState(false);
  const statusByStudent = useMemo(() => new Map((statuses.data ?? []).map((item) => [item.studentId, item])), [statuses.data]);
  const rows = useMemo<QrRow[]>(() => (students.data?.items ?? []).map((student) => {
    const credential = statusByStudent.get(student.id)?.qrCredential;
    const active = credential?.status === "activated" || credential?.status === "active";
    return { studentId: student.id, studentName: student.fullName || student.studentNumber, studentNumber: student.studentNumber, credentialId: credential?.id ?? "", status: credential ? (active ? "Active" : "Deactivated") : "Not issued", dateGenerated: formatDate(credential?.issuedAt), lastUsed: formatDate(credential?.lastSuccessfulCheckInAt) };
  }), [statusByStudent, students.data?.items]);
  const filteredRows = useMemo(() => rows.filter((row) => {
    const matchesSearch = !searchQuery.trim() || `${row.studentName} ${row.studentNumber}`.toLowerCase().includes(searchQuery.trim().toLowerCase());
    return matchesSearch && (statusFilter === "All" || row.status === statusFilter);
  }), [rows, searchQuery, statusFilter]);

  async function issue(studentId: string, name: string) {
    try { await mutations.issueQrCredentialMutation.mutateAsync({ studentId }); toast.success(`QR credential issued for ${name}.`); }
    catch { toast.error("QR credential could not be issued."); }
  }
  async function toggle(row: QrRow) {
    try { await mutations.setCredentialStatusMutation.mutateAsync({ studentId: row.studentId, credentialType: "qr", status: row.status === "Active" ? "inactive" : "activated" }); toast.success(`QR credential ${row.status === "Active" ? "deactivated" : "reactivated"} for ${row.studentName}.`); setSelectedRow(null); }
    catch { toast.error("QR credential status could not be changed."); }
  }
  async function exportRows(format: "xlsx" | "pdf") {
    if (!filteredRows.length) { toast.warning("No records match the selected filters."); return; }
    setExporting(true);
    try { const data = filteredRows.map((row) => ({ studentId: row.studentNumber, studentName: row.studentName, status: row.status, dateGenerated: row.dateGenerated, lastUsed: row.lastUsed })); if (format === "xlsx") await exportQrCredentialsXlsx(data); else await exportQrCredentialsPdf(data); toast.success(`Exported ${data.length} QR credential record(s) as ${format.toUpperCase()}.`); setExportOpen(false); }
    catch { toast.error("Unable to prepare the export."); }
    finally { setExporting(false); }
  }

  const columns: ColDef<QrRow>[] = [
    { headerName: "Student", colId: "student", minWidth: 260, flex: 1, valueGetter: ({ data }) => data ? `${data.studentName} ${data.studentNumber}` : "", cellRenderer: ({ data }: ICellRendererParams<QrRow>) => data ? <div className="py-1 leading-tight"><div className="font-medium text-foreground">{data.studentName}</div><div className="mt-1 font-mono text-xs text-muted-foreground">{data.studentNumber}</div></div> : null },
    { headerName: "Status", field: "status", minWidth: 145, cellRenderer: ({ value }: ICellRendererParams<QrRow, QrStatus>) => <StatusBadge label={value ?? "Not issued"} tone={qrTone(value ?? "Not issued")} /> },
    { headerName: "Date Generated", field: "dateGenerated", minWidth: 155 },
    { headerName: "Last Used", field: "lastUsed", minWidth: 145 },
    { headerName: "Action", colId: "action", minWidth: 150, sortable: false, cellRenderer: ({ data }: ICellRendererParams<QrRow>) => data ? <Button type="button" size="sm" variant="outline" onClick={(event) => { event.stopPropagation(); if (data.credentialId) setSelectedRow(data); else void issue(data.studentId, data.studentName); }}>{data.credentialId ? "Manage QR" : "Issue QR"}</Button> : null }
  ];

  if (students.isLoading || statuses.isLoading) return <div className="p-6 text-sm text-muted-foreground">Loading QR credentials...</div>;
  if (students.isError || statuses.isError) return <div className="p-6 text-sm text-destructive">Unable to load QR credentials. Please refresh the page.</div>;
  return <div className="space-y-6">
    <PageHeader title="Authentication Methods" description="Issue, review, and manage student QR attendance credentials." />
    <section className="grid gap-3 sm:grid-cols-3" aria-label="Credential overview"><CredentialMetric label="QR credentials" value={rows.filter((row) => row.credentialId).length} icon={<QrCode className="h-4 w-4" />} /><CredentialMetric label="Active" value={rows.filter((row) => row.status === "Active").length} icon={<UserCheck className="h-4 w-4" />} tone="success" /><CredentialMetric label="Deactivated" value={rows.filter((row) => row.status === "Deactivated").length} icon={<XCircle className="h-4 w-4" />} tone="danger" /></section>
    <section className="space-y-3 rounded-xl border bg-surface p-4 shadow-sm"><div className="flex flex-wrap items-center justify-between gap-3"><h2 className="text-base font-semibold text-foreground">Credential directory</h2><div className="flex items-center gap-2"><span className="inline-flex items-center gap-1.5 rounded-full border border-primary/20 bg-primary/5 px-3 py-1 text-xs font-medium text-primary"><Filter className="h-3 w-3" aria-hidden="true" />{filteredRows.length} results</span><Button type="button" size="sm" variant="outline" onClick={() => setExportOpen(true)}><Download className="mr-1.5 h-3.5 w-3.5" />Export</Button></div></div><div className="grid grid-cols-1 items-end gap-3 border-t border-border/50 pt-3 md:grid-cols-[minmax(0,1fr)_220px_auto]"><div className="relative w-full"><Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" aria-hidden="true" /><input type="text" value={searchQuery} onChange={(event) => setSearchQuery(event.target.value)} placeholder="Search by student name or Student ID..." className="h-9 w-full rounded-md border border-input bg-background pl-9 pr-9 text-xs shadow-xs transition focus:border-primary focus:outline-none focus:ring-1 focus:ring-primary" />{searchQuery ? <button type="button" aria-label="Clear search" onClick={() => setSearchQuery("")} className="absolute right-2.5 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground"><X className="h-3.5 w-3.5" /></button> : null}</div><div className="flex flex-col gap-1"><label htmlFor="credential-status-filter" className="text-[11px] font-medium text-muted-foreground">Credential status</label><select id="credential-status-filter" value={statusFilter} onChange={(event) => setStatusFilter(event.target.value as typeof statusFilter)} className="h-9 w-full rounded-md border bg-background px-2.5 text-xs outline-none transition focus:border-primary focus:ring-2 focus:ring-primary/20"><option value="All">All statuses</option><option value="Active">Active</option><option value="Deactivated">Deactivated</option><option value="Not issued">Not issued</option></select></div><div className="flex min-h-9 items-center md:justify-end">{searchQuery || statusFilter !== "All" ? <Button type="button" variant="ghost" size="sm" className="px-0 text-xs" onClick={() => { setSearchQuery(""); setStatusFilter("All"); }}>Clear filters</Button> : null}</div></div></section>
    <PLPassDataGrid label="Student QR Credentials" data={filteredRows} columns={columns} isLoading={students.isLoading} emptyTitle="No QR credentials found" emptyDescription="There are no student QR credentials matching your criteria." onRowClick={setSelectedRow} />
    <ConfirmModal open={Boolean(selectedRow)} title="QR credential details" description={selectedRow ? `Manage the QR attendance credential for ${selectedRow.studentName}.` : undefined} confirmLabel={selectedRow?.status === "Active" ? "Deactivate" : "Reactivate"} cancelLabel="Close" onConfirm={() => selectedRow ? void toggle(selectedRow) : undefined} onCancel={() => setSelectedRow(null)}>{selectedRow ? <div className="space-y-3 rounded-xl border border-primary/15 bg-primary/[0.04] p-4 text-sm text-muted-foreground"><div className="flex items-center justify-between"><div><p className="font-semibold text-foreground">QR credential preview</p><p className="mt-0.5 text-xs">Use this credential for event attendance.</p></div><StatusBadge label={selectedRow.status} tone={qrTone(selectedRow.status)} /></div><div className="flex h-40 items-center justify-center rounded-lg border border-dashed bg-background text-primary"><QrCode className="h-20 w-20" aria-hidden="true" /></div><p>Issued: {selectedRow.dateGenerated} · Last used: {selectedRow.lastUsed}</p><Button type="button" variant="outline" size="sm" disabled={exporting} onClick={() => void issue(selectedRow.studentId, selectedRow.studentName)}>Reissue QR</Button></div> : null}</ConfirmModal>
    <ConfirmModal open={exportOpen} title="Export QR credentials" description="Choose a format for the currently filtered credential directory." confirmLabel="Export XLSX" cancelLabel="Cancel" onConfirm={() => void exportRows("xlsx")} onCancel={() => setExportOpen(false)}><div className="flex gap-2"><Button type="button" variant="outline" disabled={exporting} onClick={() => void exportRows("xlsx")}>XLSX</Button><Button type="button" variant="outline" disabled={exporting} onClick={() => void exportRows("pdf")}>PDF</Button></div></ConfirmModal>
  </div>;
}
