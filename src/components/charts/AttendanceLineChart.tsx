import { CartesianGrid, Line, LineChart, ResponsiveContainer, Tooltip, XAxis, YAxis } from "recharts";
import { ChartFrame } from "@/components/charts/ChartFrame";
import type { AttendanceTrendPoint } from "@/components/charts/chartTypes";

type AttendanceLineChartProps = {
  data: AttendanceTrendPoint[];
};

export function AttendanceLineChart({ data }: AttendanceLineChartProps) {
  return (
    <ChartFrame title="Attendance Line" description="Present, late, and absent counts over time.">
      <ResponsiveContainer width="100%" height="100%">
        <LineChart data={data}>
          <CartesianGrid strokeDasharray="3 3" />
          <XAxis dataKey="label" />
          <YAxis />
          <Tooltip />
          <Line type="monotone" dataKey="present" stroke="hsl(var(--chart-1))" strokeWidth={2} />
          <Line type="monotone" dataKey="late" stroke="hsl(var(--chart-4))" strokeWidth={2} />
          <Line type="monotone" dataKey="absent" stroke="hsl(var(--danger))" strokeWidth={2} />
        </LineChart>
      </ResponsiveContainer>
    </ChartFrame>
  );
}
