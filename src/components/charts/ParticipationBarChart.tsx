import { Bar, BarChart, CartesianGrid, ResponsiveContainer, Tooltip, XAxis, YAxis } from "recharts";
import { ChartFrame } from "@/components/charts/ChartFrame";
import type { ParticipationPoint } from "@/components/charts/chartTypes";

type ParticipationBarChartProps = {
  data: ParticipationPoint[];
};

export function ParticipationBarChart({ data }: ParticipationBarChartProps) {
  return (
    <ChartFrame title="Participation" description="Participation rate by class or event.">
      <ResponsiveContainer width="100%" height="100%">
        <BarChart data={data}>
          <CartesianGrid strokeDasharray="3 3" />
          <XAxis dataKey="label" />
          <YAxis />
          <Tooltip />
          <Bar dataKey="participation" fill="hsl(var(--chart-2))" radius={[6, 6, 0, 0]} />
        </BarChart>
      </ResponsiveContainer>
    </ChartFrame>
  );
}
