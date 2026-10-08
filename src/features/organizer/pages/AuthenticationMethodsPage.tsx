import { useMemo, useState } from "react";
import { CheckCircle2, Search, XCircle } from "lucide-react";
import { toast } from "sonner";
import { ErrorState } from "@/components/feedback/ErrorState";
import { LoadingState } from "@/components/feedback/LoadingState";
import { PageHeader } from "@/components/shared/PageHeader";
import { Button } from "@/components/ui/button";
import { useDevelopmentSession } from "@/hooks/useDevelopmentSession";
import { useStudentCredentialMutations, useStudentCredentialStatuses, useStudents } from "@/hooks/useRepositoryQueries";

export function AuthenticationMethodsPage() {
  const { session } = useDevelopmentSession();
  const context = session ? { actorUserId: session.userId, actorRole: session.role } : undefined;
  const students = useStudents({ pageSize: 100 }, context);
  const statuses = useStudentCredentialStatuses(context, undefined, true);
  const mutations = useStudentCredentialMutations(context);
  const [search, setSearch] = useState("");
  const statusByStudent = useMemo(() => new Map((statuses.data ?? []).map((item) => [item.studentId, item])), [statuses.data]);
  const rows = useMemo(() => (students.data?.items ?? []).map((student) => {
    const credential = statusByStudent.get(student.id)?.qrCredential;
    return { student, credential };
  }).filter(({ student }) => !search.trim() || `${student.fullName} ${student.studentNumber}`.toLowerCase().includes(search.toLowerCase())), [search, statusByStudent, students.data?.items]);

  if (students.isLoading || statuses.isLoading) return <LoadingState label="Loading QR credentials" />;
  if (students.isError || statuses.isError) return <ErrorState title="Unable to load QR credentials" message="Please refresh the page and try again." />;

  async function issue(studentId: string, name: string) {
    try { await mutations.issueQrCredentialMutation.mutateAsync({ studentId }); toast.success(`QR credential issued for ${name}.`); }
    catch { toast.error("QR credential could not be issued."); }
  }

  async function toggle(studentId: string, name: string, active: boolean) {
    try { await mutations.setCredentialStatusMutation.mutateAsync({ studentId, credentialType: "qr", status: active ? "inactive" : "activated" }); toast.success(`QR credential ${active ? "deactivated" : "reactivated"} for ${name}.`); }
    catch { toast.error("QR credential status could not be changed."); }
  }

   return <div className="space-y-6"><PageHeader title="Authentication Methods" description="Issue, review, and manage student QR attendance credentials." /><section className="rounded-2xl border bg-surface p-5 shadow-sm"><label className="relative block max-w-xl"><Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" aria-hidden="true" /><input className="h-10 w-full rounded-lg border bg-background pl-9 pr-3 text-sm" placeholder="Search students" value={search} onChange={(event) => setSearch(event.target.value)} /></label><div className="mt-5 overflow-x-auto"><table className="w-full text-sm"><thead className="border-b text-left text-muted-foreground"><tr><th className="px-3 py-3">Student</th><th className="px-3 py-3">Status</th><th className="px-3 py-3">Issued</th><th className="px-3 py-3 text-right">Action</th></tr></thead><tbody>{rows.map(({ student, credential }) => { const active = credential?.status === "activated" || credential?.status === "active"; return <tr key={student.id} className="border-b last:border-0"><td className="px-3 py-3"><div className="font-medium">{student.fullName || student.studentNumber}</div><div className="text-xs text-muted-foreground">{student.studentNumber}</div></td><td className="px-3 py-3">{active ? <span className="inline-flex items-center gap-1 text-emerald-700"><CheckCircle2 className="h-4 w-4" />Active</span> : <span className="inline-flex items-center gap-1 text-muted-foreground"><XCircle className="h-4 w-4" />{credential ? "Inactive" : "Not issued"}</span>}</td><td className="px-3 py-3 text-muted-foreground">{credential?.issuedAt ? new Date(credential.issuedAt).toLocaleDateString() : "-"}</td><td className="px-3 py-3 text-right"><Button type="button" size="sm" variant="outline" onClick={() => credential ? void toggle(student.id, student.fullName || student.studentNumber, active) : void issue(student.id, student.fullName || student.studentNumber)}>{credential ? active ? "Deactivate" : "Reactivate" : "Issue QR"}</Button></td></tr>; })}</tbody></table></div></section></div>;
}
