import { Button } from "@/components/ui/button";

type ManualLookupPanelProps = {
  studentId: string;
  reason: string;
  remarks: string;
  students: Array<{ id: string; label: string }>;
  disabled?: boolean;
  onStudentChange: (value: string) => void;
  onReasonChange: (value: string) => void;
  onRemarksChange: (value: string) => void;
  onSubmit: () => void;
};

const manualReasons = ["NFC sticker damaged", "NFC reader issue", "Student forgot ID", "System issue", "Approved by faculty", "Other"];

export function ManualLookupPanel({ studentId, reason, remarks, students, disabled, onStudentChange, onReasonChange, onRemarksChange, onSubmit }: ManualLookupPanelProps) {
  return (
    <section className="rounded-lg border bg-surface p-4" aria-label="Manual attendance entry">
      <h2 className="font-semibold">Manual entry</h2>
      <p className="mt-1 text-sm text-muted-foreground">Development Simulation override for approved staff use only.</p>
      <div className="mt-4 space-y-3">
        <label className="block text-sm font-medium">
          Student
          <select className="plpass-field mt-1 h-10 w-full rounded-md border px-3 text-sm" value={studentId} disabled={disabled} onChange={(event) => onStudentChange(event.target.value)}>
            <option value="">Select student</option>
            {students.map((student) => <option key={student.id} value={student.id}>{student.label}</option>)}
          </select>
        </label>
        <label className="block text-sm font-medium">
          Manual reason
          <select className="plpass-field mt-1 h-10 w-full rounded-md border px-3 text-sm" value={reason} disabled={disabled} onChange={(event) => onReasonChange(event.target.value)}>
            <option value="">Select reason</option>
            {manualReasons.map((item) => <option key={item} value={item}>{item}</option>)}
          </select>
        </label>
        <label className="block text-sm font-medium">
          Remarks
          <textarea className="plpass-field mt-1 min-h-20 w-full rounded-md border px-3 py-2 text-sm" value={remarks} disabled={disabled} onChange={(event) => onRemarksChange(event.target.value)} />
        </label>
        <Button type="button" disabled={disabled} onClick={onSubmit}>
          Save manual attendance
        </Button>
      </div>
    </section>
  );
}