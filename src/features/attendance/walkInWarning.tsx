import { useCallback, useRef, useState } from "react";
import { AlertTriangle, UserPlus } from "lucide-react";
import { ConfirmModal } from "@/components/modals/ConfirmModal";

type WalkInCandidate = { displayName?: string | null; studentNumber: string; offline?: boolean };

export function useWalkInWarning() {
  const [candidate, setCandidate] = useState<WalkInCandidate | null>(null);
  const resolveRef = useRef<((allowed: boolean) => void) | null>(null);
  const confirm = useCallback((next: WalkInCandidate) => new Promise<boolean>((resolve) => { resolveRef.current = resolve; setCandidate(next); }), []);
  const settle = useCallback((allowed: boolean) => { resolveRef.current?.(allowed); resolveRef.current = null; setCandidate(null); }, []);
  const name = candidate?.displayName?.trim() || (candidate ? `Student ${candidate.studentNumber}` : "Student");
  const source = candidate?.offline ? "is not in the downloaded roster" : "is not an invited participant";
  return {
    confirm,
    dialog: <ConfirmModal open={Boolean(candidate)} title="Uninvited student" description={`${name} ${source}.`} confirmLabel="Allow as Walk-in" cancelLabel="Reject" onCancel={() => settle(false)} onConfirm={() => settle(true)}>
      <div className="space-y-4">
        <div className="flex gap-3 rounded-lg border border-amber-200 bg-amber-50 p-3 text-amber-950"><AlertTriangle className="mt-0.5 h-5 w-5 shrink-0" aria-hidden="true" /><div><p className="font-medium">Review before admitting</p><p className="mt-1 text-sm">This student was not originally invited. Allowing entry records attendance with a Walk-in badge.</p></div></div>
        <dl className="grid grid-cols-[auto_1fr] gap-x-3 gap-y-1 rounded-lg border bg-surface p-3 text-sm"><dt className="text-muted-foreground">Student</dt><dd className="font-medium">{name}</dd><dt className="text-muted-foreground">Student number</dt><dd className="font-medium">{candidate?.studentNumber}</dd></dl>
        <p className="flex items-center gap-2 text-sm text-muted-foreground"><UserPlus className="h-4 w-4 text-primary" aria-hidden="true" />Rejecting records no attendance.</p>
      </div>
    </ConfirmModal>
  };
}
