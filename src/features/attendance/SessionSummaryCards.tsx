import { CheckCircle2, Clock3, UserPlus, UserX, Users } from "lucide-react";
import { StatCard } from "@/components/shared/StatCard";

type SessionSummaryCardsProps = {
  present: number;
  late: number;
  absent: number;
  total: number;
  walkIns?: number;
};

export function SessionSummaryCards({ present, late, absent, total, walkIns }: SessionSummaryCardsProps) {
  return (
    <div className="grid gap-3 md:grid-cols-4">
      <StatCard title="Present" value={String(present)} tone="success" icon={CheckCircle2} />
      <StatCard title="Late" value={String(late)} tone="warning" icon={Clock3} />
      <StatCard title="Absent" value={String(absent)} tone="danger" icon={UserX} />
      <StatCard title="Expected" value={String(total)} icon={Users} />
      {walkIns !== undefined ? <StatCard title="Walk-ins" value={String(walkIns)} icon={UserPlus} /> : null}
    </div>
  );
}
