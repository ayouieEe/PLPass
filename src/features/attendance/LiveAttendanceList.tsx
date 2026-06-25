import { StatusBadge } from "@/components/feedback/StatusBadge";
import type { AttendanceStatus, LiveAttendanceRecord } from "@/features/attendance/types";

type LiveAttendanceListProps = {
  records: LiveAttendanceRecord[];
};

const statusTone: Record<AttendanceStatus, "success" | "warning" | "danger" | "info"> = {
  present: "success",
  late: "warning",
  absent: "danger",
  manual: "info"
};

export function LiveAttendanceList({ records }: LiveAttendanceListProps) {
  return (
    <section className="rounded-lg border bg-surface">
      <div className="border-b p-4">
        <h2 className="font-semibold">Live attendance</h2>
      </div>
      <ul className="divide-y">
        {records.map((record) => (
          <li key={record.id} className="flex items-center justify-between gap-4 p-4">
            <div>
              <p className="font-medium">{record.studentName}</p>
              <p className="text-xs text-muted-foreground">{record.identifier}</p>
            </div>
            <div className="text-right">
              <StatusBadge label={record.status} tone={statusTone[record.status]} />
              <p className="mt-1 text-xs text-muted-foreground">{record.timestamp}</p>
            </div>
          </li>
        ))}
      </ul>
    </section>
  );
}
