import type {
  AttendanceStatus,
  NotificationStatus,
  NotificationType,
  SessionStatus,
  SortDirection
} from "@/types/enums";

export type PaginationQuery = {
  pageIndex: number;
  pageSize: number;
};

export type SearchQuery = {
  search?: string;
};

export type DateRangeQuery = {
  dateFrom?: string;
  dateTo?: string;
};

export type AcademicFilter = {
  semesterId?: string;
  schoolYear?: string;
  programId?: string;
  departmentId?: string;
  yearLevel?: number;
  section?: string;
};

export type EntityFilter = {
  classId?: string;
  eventId?: string;
  facultyId?: string;
  sectionId?: string;
  sessionId?: string;
};

export type AttendanceFilter = {
  attendanceStatus?: AttendanceStatus;
  sessionStatus?: SessionStatus;
};

export type NotificationFilter = {
  notificationStatus?: NotificationStatus;
  notificationType?: NotificationType;
};

export type SortQuery = {
  sortBy?: string;
  sortDirection?: SortDirection;
};

export type ListQuery = PaginationQuery &
  SearchQuery &
  DateRangeQuery &
  AcademicFilter &
  EntityFilter &
  AttendanceFilter &
  NotificationFilter &
  SortQuery;

export type PaginatedResult<T> = {
  items: T[];
  total: number;
  pageIndex: number;
  pageSize: number;
  pageCount: number;
};
