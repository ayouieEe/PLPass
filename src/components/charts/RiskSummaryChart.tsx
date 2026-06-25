import { Bar, BarChart, CartesianGrid, ResponsiveContainer, Tooltip, XAxis, YAxis } from "recharts";
import { ChartFrame } from "@/components/charts/ChartFrame";
import type { RiskSummaryPoint } from "@/components/charts/chartTypes";

type RiskSummaryChartProps = {
  data: RiskSummaryPoint[];
};

export function RiskSummaryChart({ data }: RiskSummaryChartProps) {
  return (
    <ChartFrame title="Risk Summary" description="Students needing attention by period.">
      <ResponsiveContainer width="100%" height="100%">
        <BarChart data={data}>
          <CartesianGrid strokeDasharray="3 3" />
          <XAxis dataKey="label" />
          <YAxis />
          <Tooltip />
          <Bar dataKey="watchlist" stackId="risk" fill="hsl(var(--chart-4))" radius={[6, 6, 0, 0]} />
          <Bar dataKey="atRisk" stackId="risk" fill="hsl(var(--danger))" radius={[6, 6, 0, 0]} />
        </BarChart>
      </ResponsiveContainer>
    </ChartFrame>
  );
}
