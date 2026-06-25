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
          <Area type="monotone" dataKey="present" stackId="1" fill="hsl(var(--chart-1))" stroke="hsl(var(--chart-1))" />
          <Area type="monotone" dataKey="late" stackId="1" fill="hsl(var(--chart-4))" stroke="hsl(var(--chart-4))" />
          <Area type="monotone" dataKey="absent" stackId="1" fill="hsl(var(--danger))" stroke="hsl(var(--danger))" />
        </AreaChart>
      </ResponsiveContainer>
    </ChartFrame>
  );
}
