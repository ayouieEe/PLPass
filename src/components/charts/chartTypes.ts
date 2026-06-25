export type AttendanceTrendPoint = {
  label: string;
  present: number;
  late: number;
  absent: number;
};

export type AttendanceSlice = {
  name: string;
  value: number;
};

export type ParticipationPoint = {
  label: string;
  participation: number;
};

export type RiskSummaryPoint = {
  label: string;
  atRisk: number;
  watchlist: number;
};
