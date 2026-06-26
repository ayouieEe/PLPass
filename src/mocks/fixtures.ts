import type {
  AdminProfile,
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
  NfcCredential,
  NfcReader,
  NfcTapAttempt,
  Notification,
  OrganizerProfile,
  Program,
  Report,
  Semester,
  Student,
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
  { id: "dept-cte", code: "CTE", name: "College of Teacher Education" }
];

export const programFixtures: Program[] = [
  { id: "program-bsit", departmentId: "dept-ccs", code: "BSIT", name: "Bachelor of Science in Information Technology" },
  { id: "program-bsa", departmentId: "dept-cba", code: "BSA", name: "Bachelor of Science in Accountancy" },
  { id: "program-bsed", departmentId: "dept-cte", code: "BSED", name: "Bachelor of Secondary Education" }
];

export const semesterFixtures: Semester[] = [
  { id: "sem-2026-1", label: "First Semester", schoolYear: "2026-2027", startsAt: "2026-06-01", endsAt: "2026-10-31", isActive: true },
  { id: "sem-2026-2", label: "Second Semester", schoolYear: "2026-2027", startsAt: "2026-11-01", endsAt: "2027-03-31", isActive: false }
];

export const studentFixtures: Student[] = Array.from({ length: 12 }, (_, index) => {
  const number = index + 1;
  const programId = number <= 6 ? "program-bsit" : number <= 9 ? "program-bsa" : "program-bsed";
  const departmentId = programId === "program-bsit" ? "dept-ccs" : programId === "program-bsa" ? "dept-cba" : "dept-cte";
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
  { id: "organizer-1", userId: "user-organizer-1", organizationName: "Student Affairs", departmentId: "dept-ccs" },
  { id: "organizer-2", userId: "user-organizer-2", organizationName: "Academic Events", departmentId: "dept-cba" }
];

export const adminProfileFixtures: AdminProfile[] = [
  { id: "admin-1", userId: "user-admin-1", officeName: "Dean's Office" }
];

export const classFixtures: Class[] = [
  { id: "class-1", facultyId: "faculty-1", programId: "program-bsit", departmentId: "dept-ccs", semesterId: "sem-2026-1", subjectCode: "IT 204", subjectTitle: "Event Driven Programming", section: "A", yearLevel: 2, scheduleLabel: "MWF 08:00-09:00", rosterId: "roster-class-1" },
  { id: "class-2", facultyId: "faculty-1", programId: "program-bsit", departmentId: "dept-ccs", semesterId: "sem-2026-1", subjectCode: "IT 301", subjectTitle: "Systems Integration", section: "B", yearLevel: 3, scheduleLabel: "TTh 10:00-11:30", rosterId: "roster-class-2" },
  { id: "class-3", facultyId: "faculty-2", programId: "program-bsa", departmentId: "dept-cba", semesterId: "sem-2026-1", subjectCode: "ACC 101", subjectTitle: "Fundamentals of Accounting", section: "A", yearLevel: 1, scheduleLabel: "MWF 13:00-14:00", rosterId: "roster-class-3" },
  { id: "class-4", facultyId: "faculty-2", programId: "program-bsed", departmentId: "dept-cte", semesterId: "sem-2026-2", subjectCode: "ED 210", subjectTitle: "Assessment of Learning", section: "B", yearLevel: 2, scheduleLabel: "TTh 14:00-15:30", rosterId: "roster-class-4" }
];

export const classRosterFixtures: ClassRoster[] = [
  ...studentFixtures.slice(0, 6).map((student) => ({ id: `roster-class-1-${student.id}`, classId: "class-1", studentId: student.id, enrolledAt: now })),
  ...studentFixtures.slice(3, 9).map((student) => ({ id: `roster-class-2-${student.id}`, classId: "class-2", studentId: student.id, enrolledAt: now })),
  ...studentFixtures.slice(6, 10).map((student) => ({ id: `roster-class-3-${student.id}`, classId: "class-3", studentId: student.id, enrolledAt: now })),
  ...studentFixtures.slice(8, 12).map((student) => ({ id: `roster-class-4-${student.id}`, classId: "class-4", studentId: student.id, enrolledAt: now }))
];

export const eventFixtures: Event[] = [
  { id: "event-1", organizerId: "organizer-1", departmentId: "dept-ccs", title: "CCS Orientation", venue: "Main Hall", startsAt: "2026-06-27T01:00:00.000Z", endsAt: "2026-06-27T04:00:00.000Z", status: "approved" },
  { id: "event-2", organizerId: "organizer-2", departmentId: "dept-cba", title: "Business Forum", venue: "Auditorium", startsAt: "2026-07-01T02:00:00.000Z", endsAt: "2026-07-01T05:00:00.000Z", status: "pending" },
  { id: "event-3", organizerId: "organizer-1", title: "Leadership Summit", venue: "Gymnasium", startsAt: "2026-07-05T01:00:00.000Z", endsAt: "2026-07-05T06:00:00.000Z", status: "completed" },
  { id: "event-4", organizerId: "organizer-2", title: "Cancelled Assembly", venue: "Court", startsAt: "2026-07-10T01:00:00.000Z", endsAt: "2026-07-10T03:00:00.000Z", status: "cancelled" }
];

export const eventParticipantFixtures: EventParticipant[] = eventFixtures.flatMap((event, eventIndex) =>
  studentFixtures.slice(eventIndex, eventIndex + 6).map((student) => ({
    id: `participant-${event.id}-${student.id}`,
    eventId: event.id,
    studentId: student.id,
    registeredAt: now
  }))
);

export const attendanceSessionFixtures: AttendanceSession[] = [
  { id: "session-1", type: "class", classId: "class-1", title: "IT 204 Week 1", mode: "required", status: "completed", startsAt: "2026-06-24T00:00:00.000Z", endsAt: "2026-06-24T01:00:00.000Z", createdByUserId: "user-faculty-1" },
  { id: "session-2", type: "class", classId: "class-2", title: "IT 301 Live Session", mode: "required", status: "active", startsAt: "2026-06-26T00:00:00.000Z", createdByUserId: "user-faculty-1" },
  { id: "session-3", type: "event", eventId: "event-1", title: "CCS Orientation Attendance", mode: "required", status: "draft", startsAt: "2026-06-27T01:00:00.000Z", createdByUserId: "user-organizer-1" },
  { id: "session-4", type: "event", eventId: "event-3", title: "Leadership Summit Attendance", mode: "optional", status: "completed", startsAt: "2026-07-05T01:00:00.000Z", endsAt: "2026-07-05T06:00:00.000Z", createdByUserId: "user-organizer-1" }
];

export const attendanceRecordFixtures: AttendanceRecord[] = [
  { id: "record-1", sessionId: "session-1", studentId: "student-1", status: "present", verificationMethod: "nfc", recordedAt: "2026-06-24T00:01:00.000Z" },
  { id: "record-2", sessionId: "session-1", studentId: "student-2", status: "late", verificationMethod: "nfc", recordedAt: "2026-06-24T00:18:00.000Z" },
  { id: "record-3", sessionId: "session-1", studentId: "student-3", status: "absent", verificationMethod: "manual", recordedAt: "2026-06-24T01:00:00.000Z", note: "No tap received" },
  { id: "record-4", sessionId: "session-1", studentId: "student-4", status: "excused", verificationMethod: "manual", recordedAt: "2026-06-24T01:00:00.000Z", note: "Approved excuse" },
  { id: "record-5", sessionId: "session-2", studentId: "student-5", status: "present", verificationMethod: "nfc", recordedAt: "2026-06-26T00:02:00.000Z" },
  { id: "record-6", sessionId: "session-4", studentId: "student-7", status: "present", verificationMethod: "qr", recordedAt: "2026-07-05T01:04:00.000Z" }
];

export const nfcCredentialFixtures: NfcCredential[] = [
  { id: "nfc-1", studentId: "student-1", nfcUid: "NFC-001", status: "activated", issuedAt: now },
  { id: "nfc-2", studentId: "student-2", nfcUid: "NFC-002", status: "blocked", issuedAt: now },
  { id: "nfc-3", studentId: "student-3", nfcUid: "NFC-003", status: "damaged", issuedAt: now },
  { id: "nfc-4", studentId: "student-4", nfcUid: "NFC-004", status: "replaced", issuedAt: now, replacedByCredentialId: "nfc-5" },
  { id: "nfc-5", studentId: "student-4", nfcUid: "NFC-005", status: "activated", issuedAt: now },
  { id: "nfc-6", studentId: "student-5", nfcUid: "NFC-006", status: "inactive", issuedAt: now }
];

export const nfcReaderFixtures: NfcReader[] = [
  { id: "reader-1", label: "Dean Laptop Reader", serialNumber: "USB-NFC-001", assignedToUserId: "user-admin-1", lastSeenAt: now, isTrusted: true },
  { id: "reader-2", label: "Faculty Reader A", serialNumber: "USB-NFC-002", assignedToUserId: "user-faculty-1", lastSeenAt: now, isTrusted: true },
  { id: "reader-3", label: "Organizer Backup Reader", serialNumber: "USB-NFC-003", assignedToUserId: "user-organizer-1", isTrusted: false }
];

export const nfcTapAttemptFixtures: NfcTapAttempt[] = [
  { id: "tap-1", sessionId: "session-2", readerId: "reader-2", nfcUid: "NFC-001", studentId: "student-1", accepted: true, attemptedAt: now, message: "Tap accepted" },
  { id: "tap-2", sessionId: "session-2", readerId: "reader-2", nfcUid: "NFC-002", studentId: "student-2", accepted: false, attemptedAt: now, message: "Credential blocked" },
  { id: "tap-3", sessionId: "session-2", readerId: "reader-2", nfcUid: "NFC-999", accepted: false, attemptedAt: now, message: "Unknown NFC credential" }
];

export const correctionRequestFixtures: CorrectionRequest[] = [
  { id: "correction-1", studentId: "student-2", attendanceRecordId: "record-2", classId: "class-1", requestedStatus: "present", reason: "Tapped before grace period ended.", status: "pending", requestedAt: now },
  { id: "correction-2", studentId: "student-3", attendanceRecordId: "record-3", classId: "class-1", requestedStatus: "excused", reason: "Medical appointment.", status: "approved", requestedAt: now, reviewedByUserId: "user-faculty-1", reviewedAt: now },
  { id: "correction-3", studentId: "student-7", attendanceRecordId: "record-6", eventId: "event-3", requestedStatus: "late", reason: "Wrong event time.", status: "rejected", requestedAt: now, reviewedByUserId: "user-organizer-1", reviewedAt: now }
];

export const reportFixtures: Report[] = [
  { id: "report-1", title: "Weekly Attendance", scope: "class-1", status: "ready", requestedByUserId: "user-faculty-1", generatedAt: now },
  { id: "report-2", title: "Event Participation", scope: "event-1", status: "processing", requestedByUserId: "user-organizer-1" },
  { id: "report-3", title: "Dean Summary", scope: "dept-ccs", status: "failed", requestedByUserId: "user-admin-1" }
];

export const notificationFixtures: Notification[] = [
  { id: "notification-1", userId: "user-student-1", title: "Attendance recorded", body: "Your NFC tap was accepted.", status: "unread", createdAt: now },
  { id: "notification-2", userId: "user-faculty-1", title: "Correction request", body: "A student submitted a correction.", status: "read", createdAt: now }
];

export const auditLogFixtures: AuditLog[] = [
  { id: "audit-1", actorUserId: "user-admin-1", action: "user.invited", targetType: "user", targetId: "user-faculty-1", timestamp: now, metadata: { role: "faculty" } },
  { id: "audit-2", actorUserId: "user-faculty-1", action: "session.completed", targetType: "attendance_session", targetId: "session-1", timestamp: now, metadata: { records: 4 } },
  { id: "audit-3", actorUserId: "user-organizer-1", action: "event.approved", targetType: "event", targetId: "event-1", timestamp: now, metadata: { venue: "Main Hall" } }
];

export const mlPredictionFixtures: MlPrediction[] = [
  { id: "ml-1", type: "random_forest_risk", riskLevel: "high", studentId: "student-3", classId: "class-1", patternLabel: "Attendance risk", score: 0.82, generatedAt: now, explanation: "Random Forest risk result based on absences and late taps." },
  { id: "ml-2", type: "linear_regression_anomaly", riskLevel: "medium", studentId: "student-2", classId: "class-1", patternLabel: "Late-arrival anomaly", score: 0.61, generatedAt: now, explanation: "Linear Regression anomaly result for increasing late arrivals." },
  { id: "ml-3", type: "k_means_cluster", riskLevel: "low", eventId: "event-1", patternLabel: "High participation cluster", score: 0.22, generatedAt: now, explanation: "K-Means participation cluster for event attendance behavior." }
];

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
  nfcCredentials: nfcCredentialFixtures,
  nfcReaders: nfcReaderFixtures,
  nfcTapAttempts: nfcTapAttemptFixtures,
  correctionRequests: correctionRequestFixtures,
  reports: reportFixtures,
  notifications: notificationFixtures,
  auditLogs: auditLogFixtures,
  mlPredictions: mlPredictionFixtures
};
