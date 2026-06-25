import { CheckCircle2, Clock3, UserX, Users } from "lucide-react";
import { StatCard } from "@/components/shared/StatCard";

type SessionSummaryCardsProps = {
  present: number;
  late: number;
  absent: number;
  total: number;
};

export function SessionSummaryCards({ present, late, absent, total }: SessionSummaryCardsProps) {
  return (
    <div className="grid gap-3 md:grid-cols-4">
      <StatCard title="Present" value={String(present)} tone="success" icon={CheckCircle2} />
      <StatCard title="Late" value={String(late)} tone="warning" icon={Clock3} />
      <StatCard title="Absent" value={String(absent)} tone="danger" icon={UserX} />
      <StatCard title="Expected" value={String(total)} icon={Users} />
    </div>
  );
}
