import { Cell, Pie, PieChart, ResponsiveContainer, Tooltip } from "recharts";
import { ChartFrame } from "@/components/charts/ChartFrame";
import type { AttendanceSlice } from "@/components/charts/chartTypes";

const sliceColors = ["hsl(var(--chart-present))", "hsl(var(--chart-late))", "hsl(var(--chart-absent))"];

type PresentLateAbsentPieChartProps = {
  data: AttendanceSlice[];
};

export function PresentLateAbsentPieChart({ data }: PresentLateAbsentPieChartProps) {
  return (
    <ChartFrame title="Present / Late / Absent" description="Attendance outcome distribution.">
      <ResponsiveContainer width="100%" height="100%">
        <PieChart>
          <Pie data={data} dataKey="value" nameKey="name" innerRadius={55} outerRadius={90} paddingAngle={3}>
            {data.map((entry, index) => (
              <Cell key={entry.name} fill={sliceColors[index % sliceColors.length]} />
            ))}
          </Pie>
          <Tooltip />
        </PieChart>
      </ResponsiveContainer>
    </ChartFrame>
  );
}
