import type {
  AdminProfile,
  AttendanceAttempt,
  AttendanceRecord,
  AttendanceSession,
  AuditLog,
  Class,
  ClassRoster,
  CorrectionRequest,
  Department,
  Event,
  EventParticipant,
  FacultyProfile,
  MlPrediction,
  Notification,
  OrganizerProfile,
  Program,
  Report,
  Semester,
  Student,
  SystemSettings,
  User
} from "@/types/domain";

const now = "2026-06-26T08:00:00.000Z";

export const userFixtures: User[] = [
  { id: "user-admin-1", role: "admin", email: "admin.one@plpass.test", displayName: "Admin One", isActive: true, createdAt: now },
  { id: "user-faculty-1", role: "faculty", email: "faculty.one@plpass.test", displayName: "Faculty One", isActive: true, createdAt: now },
  { id: "user-faculty-2", role: "faculty", email: "faculty.two@plpass.test", displayName: "Faculty Two", isActive: true, createdAt: now },
  { id: "user-organizer-1", role: "organizer", email: "organizer.one@plpass.test", displayName: "Organizer One", isActive: true, createdAt: now },
  { id: "user-organizer-2", role: "organizer", email: "organizer.two@plpass.test", displayName: "Organizer Two", isActive: true, createdAt: now },
  ...Array.from({ length: 12 }, (_, index) => {
    const number = index + 1;
    return {
      id: `user-student-${number}`,
      role: "student" as const,
      email: `student.${number}@plpass.test`,
      displayName: `Student ${String(number).padStart(2, "0")}`,
      isActive: true,
      createdAt: now
    };
  })
];

export const departmentFixtures: Department[] = [
  { id: "dept-ccs", code: "CCS", name: "College of Computer Studies" },
  { id: "dept-cba", code: "CBA", name: "College of Business Administration" },
  { id: "dept-cte", code: "CTE", name: "College of Teacher Education" },
  { id: "dept-hm", code: "HM", name: "Hospitality Management" }
];

export const programFixtures: Program[] = [
  { id: "program-bsit", departmentId: "dept-ccs", code: "BSIT", name: "Bachelor of Science in Information Technology" },
  { id: "program-bscs", departmentId: "dept-ccs", code: "BSCS", name: "Bachelor of Science in Computer Science" },
  { id: "program-bsa", departmentId: "dept-cba", code: "BSA", name: "Bachelor of Science in Accountancy" },
  { id: "program-bsed", departmentId: "dept-cte", code: "BSED", name: "Bachelor of Secondary Education" },
  { id: "program-bshm", departmentId: "dept-hm", code: "BSHM", name: "Bachelor of Science in Hospitality Management" }
];

export const semesterFixtures: Semester[] = [
  { id: "sem-2026-1", label: "First Semester", schoolYear: "2026-2027", startsAt: "2026-06-01", endsAt: "2026-10-31", isActive: true },
  { id: "sem-2026-2", label: "Second Semester", schoolYear: "2026-2027", startsAt: "2026-11-01", endsAt: "2027-03-31", isActive: false }
];

export const studentFixtures: Student[] = Array.from({ length: 12 }, (_, index) => {
  const number = index + 1;
  const programId = number <= 3 ? "program-bsit" : number <= 6 ? "program-bscs" : number <= 9 ? "program-bsa" : number <= 10 ? "program-bsed" : "program-bshm";
  const departmentId = programId === "program-bsit" || programId === "program-bscs" ? "dept-ccs" : programId === "program-bsa" ? "dept-cba" : programId === "program-bsed" ? "dept-cte" : "dept-hm";
  return {
    id: `student-${number}`,
    userId: `user-student-${number}`,
    studentNumber: `2026-${String(number).padStart(4, "0")}`,
    status: number === 10 ? "loa" : number === 11 ? "dropped" : number === 12 ? "archived" : "enrolled",
    programId,
    departmentId,
    yearLevel: number <= 4 ? 1 : number <= 8 ? 2 : 3,
    section: number % 2 === 0 ? "B" : "A",
    createdAt: now
  };
});

export const facultyProfileFixtures: FacultyProfile[] = [
  { id: "faculty-1", userId: "user-faculty-1", employeeNumber: "F-1001", departmentId: "dept-ccs", employmentStatus: "active", title: "Assistant Professor" },
  { id: "faculty-2", userId: "user-faculty-2", employeeNumber: "F-1002", departmentId: "dept-cba", employmentStatus: "part_time", title: "Lecturer" }
];

export const organizerProfileFixtures: OrganizerProfile[] = [
  { id: "organizer-1", userId: "user-organizer-1", employeeNumber: "O-2001", organizationName: "PLP Student Affairs", departmentId: "dept-ccs", position: "University Events Coordinator", employmentStatus: "active" },
  { id: "organizer-2", userId: "user-organizer-2", employeeNumber: "O-2002", organizationName: "PLP Academic Events", departmentId: "dept-cba", position: "Program Organizer", employmentStatus: "part_time" }
];

export const adminProfileFixtures: AdminProfile[] = [
  { id: "admin-1", userId: "user-admin-1", employeeNumber: "A-0001", departmentId: "dept-ccs", officeName: "Dean's Office" }
];

export const classFixtures: Class[] = [
  { id: "class-1", facultyId: "faculty-1", programId: "program-bsit", departmentId: "dept-ccs", semesterId: "sem-2026-1", subjectCode: "IT 204", subjectTitle: "Event Driven Programming", room: "Room 302", section: "A", yearLevel: 2, scheduleLabel: "MWF 08:00-09:00", status: "active", rosterId: "roster-class-1" },
  { id: "class-2", facultyId: "faculty-1", programId: "program-bsit", departmentId: "dept-ccs", semesterId: "sem-2026-1", subjectCode: "IT 301", subjectTitle: "Systems Integration", room: "Room 305", section: "B", yearLevel: 3, scheduleLabel: "TTh 10:00-11:30", status: "active", rosterId: "roster-class-2" },
  { id: "class-3", facultyId: "faculty-2", programId: "program-bsa", departmentId: "dept-cba", semesterId: "sem-2026-1", subjectCode: "ACC 101", subjectTitle: "Fundamentals of Accounting", room: "Room 201", section: "A", yearLevel: 1, scheduleLabel: "MWF 13:00-14:00", status: "active", rosterId: "roster-class-3" },
  { id: "class-4", facultyId: "faculty-2", programId: "program-bsed", departmentId: "dept-cte", semesterId: "sem-2026-2", subjectCode: "ED 210", subjectTitle: "Assessment of Learning", room: "Room 110", section: "B", yearLevel: 2, scheduleLabel: "TTh 14:00-15:30", status: "archived", rosterId: "roster-class-4" }
];

export const classRosterFixtures: ClassRoster[] = [
  ...studentFixtures.slice(0, 6).map((student) => ({ id: `roster-class-1-${student.id}`, classId: "class-1", studentId: student.id, enrolledAt: now })),
  ...studentFixtures.slice(3, 9).map((student) => ({ id: `roster-class-2-${student.id}`, classId: "class-2", studentId: student.id, enrolledAt: now })),
  ...studentFixtures.slice(6, 10).map((student) => ({ id: `roster-class-3-${student.id}`, classId: "class-3", studentId: student.id, enrolledAt: now })),
  ...studentFixtures.slice(8, 12).map((student) => ({ id: `roster-class-4-${student.id}`, classId: "class-4", studentId: student.id, enrolledAt: now }))
];

export const eventFixtures: Event[] = [
  { id: "event-1", code: "EVT-2026-001", organizerId: "organizer-1", departmentId: "dept-ccs", category: "Career Development", title: "PLP Career & Leadership Orientation", venue: "PLP Pasig Gymnasium", startsAt: "2026-02-10T00:00:00.000Z", endsAt: "2026-02-10T04:00:00.000Z", status: "completed" },
  { id: "event-2", code: "EVT-2026-002", organizerId: "organizer-2", departmentId: "dept-cba", category: "Skills Training", title: "PLP Business & Innovation Forum", venue: "PLP Multi-Purpose Laboratory", startsAt: "2026-02-24T05:00:00.000Z", endsAt: "2026-02-24T09:00:00.000Z", status: "completed" },
  { id: "event-3", code: "EVT-2026-003", organizerId: "organizer-1", departmentId: "dept-ccs", category: "General Assembly", title: "PLP Student General Assembly", venue: "PLP Pasig Auditorium", startsAt: "2026-03-05T01:00:00.000Z", endsAt: "2026-03-05T03:00:00.000Z", status: "completed" },
  { id: "event-4", code: "EVT-2026-004", organizerId: "organizer-2", departmentId: "dept-ccs", category: "Skills Training", title: "PLP Tech & Leadership Simulation Day", venue: "PLP AVR Auditorium", startsAt: "2026-03-19T00:30:00.000Z", endsAt: "2026-03-19T07:30:00.000Z", status: "completed" },
  { id: "event-5", code: "EVT-2026-005", organizerId: "organizer-1", departmentId: "dept-cte", category: "Seminar", title: "PLP Campus Sustainability Series", venue: "PLP Multi-Purpose Hall", startsAt: "2026-04-02T05:30:00.000Z", endsAt: "2026-04-02T08:00:00.000Z", status: "completed" },
  { id: "event-6", code: "EVT-2026-006", organizerId: "organizer-1", departmentId: "dept-hm", category: "Competition", title: "PLP Inter-College Skills & Talent Showcase", venue: "PLP Main Activity Center", startsAt: "2026-04-18T01:00:00.000Z", endsAt: "2026-04-18T08:00:00.000Z", status: "completed" }
].map((event) => ({
  ...event,
  status: event.status as Event["status"],
  priorityLevel: "Flexible",
  impactScore: null,
  predictedTurnout: null
}));

export const eventParticipantFixtures: EventParticipant[] = [
  ...eventFixtures.flatMap((event, eventIndex) =>
    studentFixtures.slice(eventIndex, eventIndex + 6).map((student) => ({
      id: `participant-${event.id}-${student.id}`,
      eventId: event.id,
      studentId: student.id,
      registeredAt: now
    }))
  ),
  ...eventFixtures.map((event) => ({
    id: `participant-live-student-${event.id}`,
    eventId: event.id,
    studentId: "student-1",
    registeredAt: now
  }))
].filter((participant, index, list) =>
  list.findIndex((entry) => entry.eventId === participant.eventId && entry.studentId === participant.studentId) === index
);

export const attendanceSessionFixtures: AttendanceSession[] = [
  { id: "session-1", type: "class", classId: "class-1", title: "IT 204 Week 1", mode: "required", status: "completed", startsAt: "2026-06-24T00:00:00.000Z", endsAt: "2026-06-24T01:00:00.000Z", lateCutoffAt: "2026-06-24T00:15:00.000Z", attendanceWindowStartAt: "2026-06-23T23:55:00.000Z", attendanceWindowEndAt: "2026-06-24T01:00:00.000Z", createdByUserId: "user-faculty-1" },
  { id: "session-2", type: "class", classId: "class-2", title: "IT 301 Live Session", mode: "required", status: "active", startsAt: "2026-06-26T00:00:00.000Z", endsAt: "2026-06-26T01:30:00.000Z", lateCutoffAt: "2026-06-26T00:15:00.000Z", attendanceWindowStartAt: "2026-06-25T23:55:00.000Z", attendanceWindowEndAt: "2026-06-26T01:30:00.000Z", createdByUserId: "user-faculty-1" },
  { id: "session-3", type: "event", eventId: "event-1", title: "PLP Career & Leadership Orientation Attendance", mode: "required", status: "completed", startsAt: "2026-02-10T00:00:00.000Z", endsAt: "2026-02-10T04:00:00.000Z", lateCutoffAt: "2026-02-10T00:15:00.000Z", attendanceWindowStartAt: "2026-02-09T23:55:00.000Z", attendanceWindowEndAt: "2026-02-10T04:00:00.000Z", createdByUserId: "user-organizer-1" },
  { id: "session-4", type: "event", eventId: "event-2", title: "PLP Business & Innovation Forum Attendance", mode: "required", status: "completed", startsAt: "2026-02-24T05:00:00.000Z", endsAt: "2026-02-24T09:00:00.000Z", lateCutoffAt: "2026-02-24T05:15:00.000Z", attendanceWindowStartAt: "2026-02-24T04:55:00.000Z", attendanceWindowEndAt: "2026-02-24T09:00:00.000Z", createdByUserId: "user-organizer-1" },
  { id: "session-5", type: "event", eventId: "event-3", title: "PLP Student General Assembly & Orientation Attendance", mode: "required", status: "completed", startsAt: "2026-03-05T01:00:00.000Z", endsAt: "2026-03-05T03:00:00.000Z", lateCutoffAt: "2026-03-05T01:15:00.000Z", attendanceWindowStartAt: "2026-03-05T00:55:00.000Z", attendanceWindowEndAt: "2026-03-05T03:00:00.000Z", createdByUserId: "user-organizer-1" },
  { id: "session-6", type: "event", eventId: "event-4", title: "PLP Tech & Leadership Simulation Day Attendance", mode: "required", status: "completed", startsAt: "2026-03-19T00:30:00.000Z", endsAt: "2026-03-19T07:30:00.000Z", lateCutoffAt: "2026-03-19T00:45:00.000Z", attendanceWindowStartAt: "2026-03-19T00:25:00.000Z", attendanceWindowEndAt: "2026-03-19T07:30:00.000Z", createdByUserId: "user-organizer-1" },
  { id: "session-7", type: "event", eventId: "event-5", title: "PLP Campus Sustainability Series Attendance", mode: "required", status: "completed", startsAt: "2026-04-02T05:30:00.000Z", endsAt: "2026-04-02T08:00:00.000Z", lateCutoffAt: "2026-04-02T05:45:00.000Z", attendanceWindowStartAt: "2026-04-02T05:25:00.000Z", attendanceWindowEndAt: "2026-04-02T08:00:00.000Z", createdByUserId: "user-organizer-1" },
  { id: "session-8", type: "event", eventId: "event-6", title: "PLP Inter-College Skills & Talent Showcase Attendance", mode: "required", status: "completed", startsAt: "2026-04-18T01:00:00.000Z", endsAt: "2026-04-18T08:00:00.000Z", lateCutoffAt: "2026-04-18T01:15:00.000Z", attendanceWindowStartAt: "2026-04-18T00:55:00.000Z", attendanceWindowEndAt: "2026-04-18T08:00:00.000Z", createdByUserId: "user-organizer-1" }
];

export const attendanceRecordFixtures: AttendanceRecord[] = [
  { id: "record-1", sessionId: "session-1", studentId: "student-1", status: "present", verificationMethod: "qr", recordedAt: "2026-06-24T00:01:00.000Z" },
  { id: "record-2", sessionId: "session-1", studentId: "student-2", status: "late", verificationMethod: "qr", recordedAt: "2026-06-24T00:18:00.000Z" },
  { id: "record-3", sessionId: "session-1", studentId: "student-3", status: "absent", verificationMethod: "manual", recordedAt: "2026-06-24T01:00:00.000Z", note: "No check-in received" },
  { id: "record-4", sessionId: "session-1", studentId: "student-4", status: "excused", verificationMethod: "manual", recordedAt: "2026-06-24T01:00:00.000Z", note: "Approved excuse" },
  { id: "record-5", sessionId: "session-2", studentId: "student-5", status: "present", verificationMethod: "facial", recordedAt: "2026-06-26T00:02:00.000Z" },
  { id: "record-6", sessionId: "session-3", studentId: "student-1", status: "present", verificationMethod: "qr", recordedAt: "2026-02-10T00:04:00.000Z", note: "Feedback submitted" },
  { id: "record-7", sessionId: "session-4", studentId: "student-1", status: "absent", verificationMethod: "manual", recordedAt: "2026-02-24T09:00:00.000Z", note: "No attendance scan received" },
  { id: "record-8", sessionId: "session-5", studentId: "student-1", status: "late", verificationMethod: "manual", recordedAt: "2026-03-05T01:18:00.000Z", note: "Late reason: Traffic / Commute" },
  { id: "record-9", sessionId: "session-6", studentId: "student-1", status: "late", verificationMethod: "qr", recordedAt: "2026-03-19T00:57:00.000Z" },
  { id: "record-10", sessionId: "session-7", studentId: "student-1", status: "present", verificationMethod: "qr", recordedAt: "2026-04-02T05:34:00.000Z" },
  { id: "record-11", sessionId: "session-8", studentId: "student-1", status: "present", verificationMethod: "manual", recordedAt: "2026-04-18T01:07:00.000Z", note: "Feedback submitted" },
  { id: "record-12", sessionId: "session-5", studentId: "student-7", status: "present", verificationMethod: "qr", recordedAt: "2026-03-05T01:04:00.000Z" }
];

export const attendanceAttemptFixtures: AttendanceAttempt[] = [
  { id: "attempt-1", sessionId: "session-2", studentId: "student-1", accepted: false, attemptedAt: now, message: "Student not enrolled" },
  { id: "attempt-2", sessionId: "session-2", studentId: "student-2", accepted: false, attemptedAt: now, message: "Credential blocked" },
  { id: "attempt-3", sessionId: "session-2", accepted: false, attemptedAt: now, message: "Invalid credential" }
];

export const correctionRequestFixtures: CorrectionRequest[] = [
  { id: "correction-1", studentId: "student-2", attendanceRecordId: "record-2", classId: "class-1", requestedStatus: "present", reason: "Tapped before grace period ended.", status: "pending", requestedAt: now },
  { id: "correction-2", studentId: "student-3", attendanceRecordId: "record-3", classId: "class-1", requestedStatus: "excused", reason: "Medical appointment.", status: "approved", requestedAt: now, reviewedByUserId: "user-faculty-1", reviewedAt: now },
  { id: "correction-3", studentId: "student-7", attendanceRecordId: "record-12", eventId: "event-3", requestedStatus: "late", reason: "Wrong event time.", status: "rejected", requestedAt: now, reviewedByUserId: "user-organizer-1", reviewedAt: now },
  { id: "correction-4", studentId: "student-1", attendanceRecordId: "record-1", eventId: "event-1", requestedStatus: "present", reason: "Class conflict during check-in.", status: "pending", requestedAt: now }
];

export const reportFixtures: Report[] = [
  { id: "report-1", title: "Weekly Attendance", scope: "class-1", status: "ready", requestedByUserId: "user-faculty-1", generatedAt: now },
  { id: "report-2", title: "Event Participation", scope: "event-1", status: "processing", requestedByUserId: "user-organizer-1" },
  { id: "report-3", title: "Dean Summary", scope: "dept-ccs", status: "failed", requestedByUserId: "user-admin-1" },
  { id: "report-4", title: "Student Attendance History", scope: "student-1", status: "ready", requestedByUserId: "user-student-1", generatedAt: now }
];

export const notificationFixtures: Notification[] = [
  { id: "notification-1", userId: "user-student-1", type: "attendance", title: "Attendance recorded", body: "Your QR scan was accepted.", status: "unread", createdAt: now },
  { id: "notification-2", userId: "user-faculty-1", type: "correction", title: "Correction request", body: "A student submitted a correction.", status: "read", createdAt: now },
  { id: "notification-3", userId: "user-admin-1", type: "system", title: "Mock system notice", body: "Development repository layer is active.", status: "unread", createdAt: now },
  { id: "notification-4", userId: "user-organizer-1", type: "report", title: "Report ready", body: "Event participation report is ready.", status: "unread", createdAt: now },
  { id: "notification-5", userId: "user-student-1", type: "system", title: "Development reminder", body: "Review your latest attendance record.", status: "unread", createdAt: now }
];

export const auditLogFixtures: AuditLog[] = [
  { id: "audit-1", actorUserId: "user-admin-1", action: "user.invited", targetType: "user", targetId: "user-faculty-1", timestamp: now, metadata: { role: "faculty" } },
  { id: "audit-2", actorUserId: "user-faculty-1", action: "session.completed", targetType: "attendance_session", targetId: "session-1", timestamp: now, metadata: { records: 4 } },
  { id: "audit-3", actorUserId: "user-organizer-1", action: "event.approved", targetType: "event", targetId: "event-1", timestamp: now, metadata: { venue: "Main Hall" } }
];

export const mlPredictionFixtures: MlPrediction[] = [
  { id: "ml-1", type: "random_forest_risk", riskLevel: "high", studentId: "student-3", classId: "class-1", patternLabel: "Attendance risk", score: 0.82, generatedAt: now, explanation: "Random Forest risk result based on absences and late arrivals." }
];

export const systemSettingsFixture: SystemSettings = {
  id: "settings-1",
  institutionName: "Pamantasan ng Lungsod ng Pasig",
  currentSchoolYear: "2026-2027",
  currentSemesterId: "sem-2026-1",
  attendanceLateCutoffMinutes: 15,
  defaultSessionDurationMinutes: 90,
  readerPolicy: "Trusted USB keyboard-mode readers only",
  credentialStatusPolicy: "Blocked and lost credentials require admin review",
  notificationPreferencePlaceholder: "Development-only notification preferences",
  updatedAt: now
};

export const plpassFixtures = {
  users: userFixtures,
  students: studentFixtures,
  facultyProfiles: facultyProfileFixtures,
  organizerProfiles: organizerProfileFixtures,
  adminProfiles: adminProfileFixtures,
  departments: departmentFixtures,
  programs: programFixtures,
  semesters: semesterFixtures,
  classes: classFixtures,
  classRosters: classRosterFixtures,
  events: eventFixtures,
  eventParticipants: eventParticipantFixtures,
  attendanceSessions: attendanceSessionFixtures,
  attendanceRecords: attendanceRecordFixtures,
  attendanceAttempts: attendanceAttemptFixtures,
  correctionRequests: correctionRequestFixtures,
  reports: reportFixtures,
  notifications: notificationFixtures,
  auditLogs: auditLogFixtures,
  mlPredictions: mlPredictionFixtures,
  systemSettings: systemSettingsFixture
};
