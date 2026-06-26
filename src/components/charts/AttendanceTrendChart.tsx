import { Area, AreaChart, CartesianGrid, ResponsiveContainer, Tooltip, XAxis, YAxis } from "recharts";
import { ChartFrame } from "@/components/charts/ChartFrame";
import type { AttendanceTrendPoint } from "@/components/charts/chartTypes";

type AttendanceTrendChartProps = {
  data: AttendanceTrendPoint[];
};

export function AttendanceTrendChart({ data }: AttendanceTrendChartProps) {
  return (
    <ChartFrame title="Attendance Trend" description="Stacked attendance outcomes across recent sessions.">
      <ResponsiveContainer width="100%" height="100%">
        <AreaChart data={data}>
          <CartesianGrid strokeDasharray="3 3" />
          <XAxis dataKey="label" />
          <YAxis />
          <Tooltip />
          <Area type="monotone" dataKey="present" stackId="1" fill="hsl(var(--chart-present))" stroke="hsl(var(--chart-present))" />
          <Area type="monotone" dataKey="late" stackId="1" fill="hsl(var(--chart-late))" stroke="hsl(var(--chart-late))" />
          <Area type="monotone" dataKey="absent" stackId="1" fill="hsl(var(--chart-absent))" stroke="hsl(var(--chart-absent))" />
        </AreaChart>
      </ResponsiveContainer>
    </ChartFrame>
  );
}
