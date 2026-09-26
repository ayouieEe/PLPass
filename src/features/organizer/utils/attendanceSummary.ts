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

export type FinalizedAttendanceSummaryRow = AttendanceSummaryIdentityRow & {
  isUnverifiedWalkIn?: boolean;
};

/**
 * Merge the two server read sources without allowing a walk-in to disappear
 * or render twice after it is verified. The raw source rows remain untouched.
 */
export function mergeOrganizerAttendanceRows(rows: OrganizerAttendanceRow[]): OrganizerAttendanceRow[] {
  const verifiedScanUuids = new Set(
    rows
      .filter((row) => row.verificationLabel === "Verified" && row.localScanUuid)
      .map((row) => row.localScanUuid as string)
  );
  const byIdentity = new Map<string, OrganizerAttendanceRow>();
  for (const row of rows) {
    if (row.verificationLabel === "Unverified walk-in" && row.localScanUuid && verifiedScanUuids.has(row.localScanUuid)) continue;
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

/**
 * A walk-in is additional attendance, not a replacement for a registered
 * participant who did not arrive. Keep those populations separate until the
 * final totals are combined so live-session and event-record summaries agree.
 */
export function summarizeFinalizedAttendance(
  rows: FinalizedAttendanceSummaryRow[],
  registeredCount: number
): UniqueAttendanceSummary {
  const registered = summarizeUniqueAttendance(
    rows.filter((row) => !row.isUnverifiedWalkIn),
    registeredCount,
    true
  );
  const walkIns = summarizeUniqueAttendance(
    rows.filter((row) => row.isUnverifiedWalkIn),
    0
  );
  const present = registered.present + walkIns.present;
  const late = registered.late + walkIns.late;
  const absent = registered.absent + walkIns.absent;
  const population = registered.population + walkIns.population;
  const attendanceRate = population === 0
    ? 0
    : Math.min(100, Math.round(((present + late) / population) * 1000) / 10);

  return {
    rows: [...registered.rows, ...walkIns.rows],
    present,
    late,
    absent,
    population,
    attendanceRate
  };
}
