import type { AttendanceStatus } from "@/features/organizer/utils/eventManagement";
import type { OrganizerAttendanceRow } from "@/features/organizer/data/organizerUiStore";

export type AttendanceSummaryIdentityRow = {
  identity: string;
  attendanceStatus: AttendanceStatus;
};

export type UniqueAttendanceSummary = {
  rows: AttendanceSummaryIdentityRow[];
  present: number;
  late: number;
  absent: number;
  population: number;
  attendanceRate: number;
};

/**
 * Merge duplicate server read rows without allowing one attendance identity to
 * render twice. Accepted walk-ins are now normal attendance rows.
 */
export function mergeOrganizerAttendanceRows(rows: OrganizerAttendanceRow[]): OrganizerAttendanceRow[] {
  const byIdentity = new Map<string, OrganizerAttendanceRow>();
  for (const row of rows) {
    const identity = row.localScanUuid ? `scan:${row.localScanUuid}` : `identity:${row.studentId}`;
    byIdentity.set(identity, row);
  }
  return [...byIdentity.values()];
}

/**
 * Summarize attendance by identity rather than by scan/record count. Raw
 * records remain untouched; this only creates the organizer read model.
 */
export function summarizeUniqueAttendance(
  rows: AttendanceSummaryIdentityRow[],
  registeredCount: number,
  inferMissingRegisteredAsAbsent = false
): UniqueAttendanceSummary {
  const unique = new Map<string, AttendanceSummaryIdentityRow>();
  rows.forEach((row) => unique.set(row.identity, row));

  const present = [...unique.values()].filter((row) => row.attendanceStatus === "present").length;
  const late = [...unique.values()].filter((row) => row.attendanceStatus === "late").length;
  const explicitAbsent = [...unique.values()].filter((row) => row.attendanceStatus === "absent").length;
  const population = Math.max(0, registeredCount, unique.size);
  const absent = inferMissingRegisteredAsAbsent
    ? Math.max(explicitAbsent, population - present - late)
    : explicitAbsent;
  const denominator = Math.max(population, present + late + absent);
  const attendanceRate = denominator === 0
    ? 0
    : Math.min(100, Math.round(((present + late) / denominator) * 1000) / 10);

  return {
    rows: [...unique.values()],
    present,
    late,
    absent,
    population: denominator,
    attendanceRate
  };
}
