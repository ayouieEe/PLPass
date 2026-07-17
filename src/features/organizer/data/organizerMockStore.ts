export type OrganizerEventStatus = "incoming" | "today" | "active" | "completed" | "cancelled";
export type AttendanceMethod = "QR Code" | "Facial Recognition" | "Manual";
export type AttendanceStatus = "present" | "late" | "absent";
export type LateReason = "Traffic / Commute" | "Class or Academic Conflict" | "Personal / Health" | "Weather / Force Majeure" | "Other";
export type CorrectionStatus = "Pending" | "Approved" | "Rejected";
export type CredentialStatus = "Generated" | "Regeneration Requested" | "Ready" | "Needs Review" | "Activated" | "Inactive" | "Damaged";

export type OrganizerStudent = {
  id: string;
  name: string;
  schoolId: string;
  section: string;
  email: string;
  qrStatus: CredentialStatus;
  facialStatus: CredentialStatus;
  accountStatus: "Active" | "Suspended";
};

export type OrganizerEvent = {
  code: string;
  name: string;
  category: string;
  venue: string;
  date: string;
  startTime: string;
  endTime: string;
  predictedTurnout: number;
  objectives: string[];
  status: OrganizerEventStatus;
};

export type OrganizerAttendanceRow = {
  id: string;
  studentId: string;
  studentName: string;
  eventCode: string;
  attendanceMethod: AttendanceMethod;
  checkInTime: string;
  attendanceStatus: AttendanceStatus;
  lateReason?: LateReason;
};

export type OrganizerCompletedEvent = OrganizerEvent & {
  present: number;
  late: number;
  absent: number;
  totalRegistered: number;
  attendanceRate: number;
  sentiment: {
    positive: number;
    neutral: number;
    negative: number;
  };
  feedbackComments: string[];
};

export type OrganizerCorrectionRequest = {
  id: string;
  studentName: string;
  eventCode: string;
  requestType: "Excused Absence" | "Correction - Wrong Status" | "Correction - Wrong Time-In";
  explanation: string;
  fileAttached: boolean;
  status: CorrectionStatus;
  requestedStatus: AttendanceStatus;
  decisionRemarks?: string;
};

export type OrganizerMockState = {
  students: OrganizerStudent[];
  events: OrganizerEvent[];
  attendanceRows: OrganizerAttendanceRow[];
  completedEvents: OrganizerCompletedEvent[];
  correctionRequests: OrganizerCorrectionRequest[];
  notifications: string[];
};

const STORAGE_KEY = "plpass.organizer.mockStore.v4";

export const lateReasons: LateReason[] = [
  "Traffic / Commute",
  "Class or Academic Conflict",
  "Personal / Health",
  "Weather / Force Majeure",
  "Other"
];

const students: OrganizerStudent[] = [
  { id: "STU-1001", name: "Uriel Garcia", schoolId: "2022-10871", section: "HM2A", email: "uriel.garcia@plpasig.edu.ph", qrStatus: "Regeneration Requested", facialStatus: "Activated", accountStatus: "Active" },
  { id: "STU-1002", name: "Ximena Garcia", schoolId: "2023-10232", section: "HM4A", email: "ximena.garcia@plpasig.edu.ph", qrStatus: "Generated", facialStatus: "Damaged", accountStatus: "Active" },
  { id: "STU-1003", name: "Angel Bautista", schoolId: "2022-10873", section: "HM2B", email: "angel.bautista@plpasig.edu.ph", qrStatus: "Generated", facialStatus: "Damaged", accountStatus: "Active" },
  { id: "STU-1004", name: "Rhea Ramos", schoolId: "2023-10234", section: "HM4A", email: "rhea.ramos@plpasig.edu.ph", qrStatus: "Generated", facialStatus: "Activated", accountStatus: "Active" },
  { id: "STU-1005", name: "Ivy Reyes", schoolId: "2022-10875", section: "HM2B", email: "ivy.reyes@plpasig.edu.ph", qrStatus: "Generated", facialStatus: "Activated", accountStatus: "Active" },
  { id: "STU-1006", name: "Gwen Castillo", schoolId: "2023-10236", section: "HM2A", email: "gwen.castillo@plpasig.edu.ph", qrStatus: "Generated", facialStatus: "Inactive", accountStatus: "Active" },
  { id: "STU-1007", name: "Leo Villanueva", schoolId: "2022-10877", section: "HM3A", email: "leo.villanueva@plpasig.edu.ph", qrStatus: "Generated", facialStatus: "Inactive", accountStatus: "Active" },
  { id: "STU-1008", name: "Mika Bautista", schoolId: "2023-10238", section: "HM4A", email: "mika.bautista@plpasig.edu.ph", qrStatus: "Regeneration Requested", facialStatus: "Damaged", accountStatus: "Active" },
  { id: "STU-1009", name: "Leo Ocampo", schoolId: "2022-10879", section: "HM2B", email: "leo.ocampo@plpasig.edu.ph", qrStatus: "Generated", facialStatus: "Activated", accountStatus: "Active" },
  { id: "STU-1010", name: "Yuri Flores", schoolId: "2023-10240", section: "HM2A", email: "yuri.flores@plpasig.edu.ph", qrStatus: "Generated", facialStatus: "Activated", accountStatus: "Active" },
  { id: "STU-1011", name: "Odessa Navarro", schoolId: "2022-10881", section: "HM2B", email: "odessa.navarro@plpasig.edu.ph", qrStatus: "Regeneration Requested", facialStatus: "Activated", accountStatus: "Active" },
  { id: "STU-1012", name: "Ivy Bautista", schoolId: "2023-10242", section: "HM4A", email: "ivy.bautista@plpasig.edu.ph", qrStatus: "Generated", facialStatus: "Damaged", accountStatus: "Active" },
  { id: "STU-1013", name: "Francis Salazar", schoolId: "2022-10883", section: "HM3B", email: "francis.salazar@plpasig.edu.ph", qrStatus: "Regeneration Requested", facialStatus: "Damaged", accountStatus: "Active" },
  { id: "STU-1014", name: "Kyla Cruz", schoolId: "2023-10244", section: "HM2B", email: "kyla.cruz@plpasig.edu.ph", qrStatus: "Generated", facialStatus: "Activated", accountStatus: "Active" },
  { id: "STU-1015", name: "Carlo Ramos", schoolId: "2022-10885", section: "HM4A", email: "carlo.ramos@plpasig.edu.ph", qrStatus: "Regeneration Requested", facialStatus: "Activated", accountStatus: "Active" },
  { id: "STU-1016", name: "Mika Salazar", schoolId: "2023-10246", section: "HM2B", email: "mika.salazar@plpasig.edu.ph", qrStatus: "Regeneration Requested", facialStatus: "Activated", accountStatus: "Active" },
  { id: "STU-1017", name: "Rhea Fernandez", schoolId: "2022-10887", section: "HM3A", email: "rhea.fernandez@plpasig.edu.ph", qrStatus: "Generated", facialStatus: "Damaged", accountStatus: "Active" },
  { id: "STU-1018", name: "Harold Torres", schoolId: "2023-10248", section: "HM4A", email: "harold.torres@plpasig.edu.ph", qrStatus: "Generated", facialStatus: "Activated", accountStatus: "Active" },
  { id: "STU-1019", name: "Denise Torres", schoolId: "2022-10889", section: "HM2B", email: "denise.torres@plpasig.edu.ph", qrStatus: "Generated", facialStatus: "Damaged", accountStatus: "Suspended" },
  { id: "STU-1020", name: "Mika Villanueva", schoolId: "2023-10250", section: "HM3B", email: "mika.villanueva@plpasig.edu.ph", qrStatus: "Regeneration Requested", facialStatus: "Damaged", accountStatus: "Active" }
];

const events: OrganizerEvent[] = [
  {
    code: "EVT-2026-001",
    name: "Hospitality Career Fair & Industry Talk",
    category: "Career Development",
    venue: "PLP Pasig Gymnasium",
    date: "2026-02-10",
    startTime: "08:00 AM",
    endTime: "12:00 PM",
    predictedTurnout: 82,
    objectives: [
      "Connect HM students with at least 5 partner hotels/restaurants for potential internship slots",
      "Improve student awareness of current industry hiring standards",
      "Gather student interest data for AHTOMP's placement program"
    ],
    status: "completed"
  },
  {
    code: "EVT-2026-002",
    name: "Food & Beverage Service Skills Workshop",
    category: "Skills Training",
    venue: "PLP HM Training Laboratory",
    date: "2026-02-24",
    startTime: "01:00 PM",
    endTime: "05:00 PM",
    predictedTurnout: 76,
    objectives: ["Demonstrate proper fine-dining table service techniques", "Improve student confidence in guest interaction scenarios"],
    status: "completed"
  },
  {
    code: "EVT-2026-003",
    name: "AHTOMP General Assembly & Orientation",
    category: "General Assembly",
    venue: "PLP Pasig Auditorium",
    date: "2026-03-05",
    startTime: "09:00 AM",
    endTime: "11:00 AM",
    predictedTurnout: 91,
    objectives: ["Orient new HM students on AHTOMP's programs and membership benefits", "Present the academic year's event calendar"],
    status: "completed"
  },
  {
    code: "EVT-2026-004",
    name: "Front Office Operations Simulation Day",
    category: "Skills Training",
    venue: "PLP HM Mock Hotel Lab",
    date: new Date().toISOString().slice(0, 10),
    startTime: "08:30 AM",
    endTime: "03:30 PM",
    predictedTurnout: 69,
    objectives: ["Simulate real front-desk check-in/check-out scenarios", "Assess student handling of guest complaints", "Evaluate use of a property management system mock-up"],
    status: "today"
  },
  {
    code: "EVT-2026-007",
    name: "Guest Service Excellence Training",
    category: "Skills Training",
    venue: "PLP HM Training Laboratory",
    date: new Date().toISOString().slice(0, 10),
    startTime: "01:00 PM",
    endTime: "04:00 PM",
    predictedTurnout: 79,
    objectives: [
      "Develop advanced customer service communication skills",
      "Practice handling difficult guest situations",
      "Learn conflict resolution techniques in hospitality settings"
    ],
    status: "today"
  },
  {
    code: "EVT-2026-009",
    name: "Student Leadership Development Workshop",
    category: "Skills Training",
    venue: "PLP Pasig Main Hall",
    date: new Date().toISOString().slice(0, 10),
    startTime: "04:30 PM",
    endTime: "06:00 PM",
    predictedTurnout: 45,
    objectives: [
      "Develop leadership and team management skills",
      "Foster student organization involvement",
      "Build communication and decision-making competencies"
    ],
    status: "today"
  },
  {
    code: "EVT-2026-005",
    name: "Sustainable Tourism Speaker Series",
    category: "Seminar",
    venue: "PLP Multi-Purpose Hall",
    date: "2026-08-02",
    startTime: "01:30 PM",
    endTime: "04:00 PM",
    predictedTurnout: 58,
    objectives: ["Introduce sustainable and responsible tourism practices", "Encourage student-led sustainability initiatives on campus"],
    status: "incoming"
  },
  {
    code: "EVT-2026-006",
    name: "AHTOMP Culinary & Mixology Showcase",
    category: "Competition",
    venue: "PLP HM Culinary Kitchen",
    date: "2026-08-18",
    startTime: "09:00 AM",
    endTime: "04:00 PM",
    predictedTurnout: 88,
    objectives: ["Showcase student culinary and beverage-crafting competencies", "Foster friendly competition among HM sections"],
    status: "incoming"
  },
  {
    code: "EVT-2026-008",
    name: "Hotel Management Internship Fair",
    category: "Career Development",
    venue: "PLP Pasig Gymnasium",
    date: "2026-09-12",
    startTime: "10:00 AM",
    endTime: "02:00 PM",
    predictedTurnout: 95,
    objectives: ["Connect students with internship opportunities at major hotel chains", "Present requirements and expectations for industry placements", "Facilitate direct recruitment discussions with HR representatives"],
    status: "incoming"
  }
];

const attendanceRows: OrganizerAttendanceRow[] = [
  { id: "ATT-6001", studentId: "STU-1002", studentName: "Ximena Garcia", eventCode: "EVT-2026-001", attendanceMethod: "QR Code", checkInTime: "08:38 AM", attendanceStatus: "late", lateReason: "Class or Academic Conflict" },
  { id: "ATT-6002", studentId: "STU-1003", studentName: "Angel Bautista", eventCode: "EVT-2026-001", attendanceMethod: "Facial Recognition", checkInTime: "07:44 AM", attendanceStatus: "present" },
  { id: "ATT-6003", studentId: "STU-1004", studentName: "Rhea Ramos", eventCode: "EVT-2026-001", attendanceMethod: "Facial Recognition", checkInTime: "07:50 AM", attendanceStatus: "late", lateReason: "Class or Academic Conflict" },
  { id: "ATT-6004", studentId: "STU-1005", studentName: "Ivy Reyes", eventCode: "EVT-2026-001", attendanceMethod: "Facial Recognition", checkInTime: "08:03 AM", attendanceStatus: "late", lateReason: "Personal / Health" },
  { id: "ATT-6005", studentId: "STU-1006", studentName: "Gwen Castillo", eventCode: "EVT-2026-001", attendanceMethod: "QR Code", checkInTime: "-", attendanceStatus: "absent" },
  { id: "ATT-6006", studentId: "STU-1007", studentName: "Leo Villanueva", eventCode: "EVT-2026-001", attendanceMethod: "QR Code", checkInTime: "08:34 AM", attendanceStatus: "late", lateReason: "Other" },
  { id: "ATT-6007", studentId: "STU-1008", studentName: "Mika Bautista", eventCode: "EVT-2026-001", attendanceMethod: "QR Code", checkInTime: "08:17 AM", attendanceStatus: "late", lateReason: "Traffic / Commute" },
  { id: "ATT-6008", studentId: "STU-1009", studentName: "Leo Ocampo", eventCode: "EVT-2026-001", attendanceMethod: "QR Code", checkInTime: "-", attendanceStatus: "absent" },
  { id: "ATT-6009", studentId: "STU-1010", studentName: "Yuri Flores", eventCode: "EVT-2026-001", attendanceMethod: "QR Code", checkInTime: "08:32 AM", attendanceStatus: "late", lateReason: "Traffic / Commute" },
  { id: "ATT-6010", studentId: "STU-1011", studentName: "Odessa Navarro", eventCode: "EVT-2026-001", attendanceMethod: "QR Code", checkInTime: "08:16 AM", attendanceStatus: "late", lateReason: "Other" },
  { id: "ATT-6011", studentId: "STU-1012", studentName: "Ivy Bautista", eventCode: "EVT-2026-001", attendanceMethod: "Facial Recognition", checkInTime: "07:37 AM", attendanceStatus: "present" },
  { id: "ATT-6012", studentId: "STU-1013", studentName: "Francis Salazar", eventCode: "EVT-2026-001", attendanceMethod: "QR Code", checkInTime: "07:40 AM", attendanceStatus: "present" },
  { id: "ATT-6013", studentId: "STU-1014", studentName: "Kyla Cruz", eventCode: "EVT-2026-001", attendanceMethod: "Facial Recognition", checkInTime: "08:38 AM", attendanceStatus: "late", lateReason: "Traffic / Commute" },
  { id: "ATT-6014", studentId: "STU-1015", studentName: "Carlo Ramos", eventCode: "EVT-2026-001", attendanceMethod: "QR Code", checkInTime: "08:30 AM", attendanceStatus: "late", lateReason: "Weather / Force Majeure" },
  { id: "ATT-6015", studentId: "STU-1016", studentName: "Mika Salazar", eventCode: "EVT-2026-001", attendanceMethod: "QR Code", checkInTime: "08:37 AM", attendanceStatus: "late", lateReason: "Personal / Health" }
];

const completedEvents: OrganizerCompletedEvent[] = [
  { ...events[0], present: 142, late: 18, absent: 12, totalRegistered: 172, attendanceRate: 82.6, sentiment: { positive: 78, neutral: 18, negative: 4 }, feedbackComments: ["Very well organized compared to past AHTOMP events."] },
  { ...events[1], present: 97, late: 14, absent: 23, totalRegistered: 134, attendanceRate: 72.8, sentiment: { positive: 64, neutral: 27, negative: 9 }, feedbackComments: ["Great networking opportunity with hotel partners.", "The speakers were very informative and approachable."] },
  { ...events[2], present: 203, late: 9, absent: 8, totalRegistered: 220, attendanceRate: 92.7, sentiment: { positive: 71, neutral: 22, negative: 7 }, feedbackComments: ["Venue was a bit cramped for the number of attendees."] }
];

const correctionRequests: OrganizerCorrectionRequest[] = [
  { id: "REQ-501", studentName: "Gwen Castillo", eventCode: "EVT-2026-002", requestType: "Excused Absence", explanation: "System marked me absent, but I checked in through the Facial tab.", fileAttached: true, status: "Approved", requestedStatus: "present" },
  { id: "REQ-502", studentName: "Odessa Navarro", eventCode: "EVT-2026-003", requestType: "Correction - Wrong Time-In", explanation: "QR code did not scan on first attempt; had to re-queue and arrived late as a result.", fileAttached: true, status: "Pending", requestedStatus: "late" },
  { id: "REQ-503", studentName: "Mika Salazar", eventCode: "EVT-2026-005", requestType: "Correction - Wrong Status", explanation: "Facial scan failed to register despite being present at the venue.", fileAttached: true, status: "Pending", requestedStatus: "present" },
  { id: "REQ-504", studentName: "Uriel Garcia", eventCode: "EVT-2026-002", requestType: "Correction - Wrong Status", explanation: "System marked me absent, but I checked in through the Facial tab.", fileAttached: true, status: "Approved", requestedStatus: "present" },
  { id: "REQ-508", studentName: "Uriel Garcia", eventCode: "EVT-2026-002", requestType: "Correction - Wrong Status", explanation: "Time-in shows 30 minutes later than actual arrival time.", fileAttached: true, status: "Pending", requestedStatus: "present" }
];

export function getDefaultOrganizerMockState(): OrganizerMockState {
  return {
    students,
    events,
    attendanceRows,
    completedEvents,
    correctionRequests,
    notifications: []
  };
}

function canUseStorage() {
  return typeof window !== "undefined" && typeof window.localStorage !== "undefined";
}

export function loadOrganizerMockState(): OrganizerMockState {
  if (!canUseStorage()) {
    return getDefaultOrganizerMockState();
  }

  const raw = window.localStorage.getItem(STORAGE_KEY);
  if (!raw) {
    const defaults = getDefaultOrganizerMockState();
    saveOrganizerMockState(defaults);
    return defaults;
  }

  try {
    return JSON.parse(raw) as OrganizerMockState;
  } catch {
    const defaults = getDefaultOrganizerMockState();
    saveOrganizerMockState(defaults);
    return defaults;
  }
}

export function saveOrganizerMockState(state: OrganizerMockState) {
  if (canUseStorage()) {
    window.localStorage.setItem(STORAGE_KEY, JSON.stringify(state));
  }
  return state;
}

export function resetOrganizerMockState() {
  return saveOrganizerMockState(getDefaultOrganizerMockState());
}

export function publishOrganizerEvent(state: OrganizerMockState, event: OrganizerEvent, participantIds: string[]) {
  const nextEvent: OrganizerEvent = { ...event, status: event.date === new Date().toISOString().slice(0, 10) ? "today" : "incoming" };
  return saveOrganizerMockState({
    ...state,
    events: [nextEvent, ...state.events.filter((item) => item.code !== nextEvent.code)],
    notifications: [
      `${nextEvent.code} published. ${participantIds.length} selected student${participantIds.length === 1 ? "" : "s"} notified.`,
      ...state.notifications
    ]
  });
}

export function startOrganizerSession(state: OrganizerMockState, eventCode: string) {
  return saveOrganizerMockState({
    ...state,
    events: state.events.map((event) => (event.code === eventCode ? { ...event, status: "active" } : event))
  });
}

export function endOrganizerSession(state: OrganizerMockState, eventCode: string, rows: OrganizerAttendanceRow[]) {
  const event = state.events.find((item) => item.code === eventCode);
  if (!event) {
    return state;
  }

  const present = rows.filter((row) => row.attendanceStatus === "present").length;
  const late = rows.filter((row) => row.attendanceStatus === "late").length;
  const absent = rows.filter((row) => row.attendanceStatus === "absent").length;
  const completed: OrganizerCompletedEvent = {
    ...event,
    status: "completed",
    present,
    late,
    absent,
    totalRegistered: rows.length,
    attendanceRate: rows.length ? Math.round(((present + late) / rows.length) * 1000) / 10 : 0,
    sentiment: { positive: 48, neutral: 35, negative: 17 },
    feedbackComments: ["Session ran a bit long but content was useful.", "Would appreciate printed handouts next time."]
  };

  return saveOrganizerMockState({
    ...state,
    events: state.events.map((item) => (item.code === eventCode ? { ...item, status: "completed" } : item)),
    attendanceRows: [...rows, ...state.attendanceRows.filter((row) => row.eventCode !== eventCode)],
    completedEvents: [completed, ...state.completedEvents.filter((item) => item.code !== eventCode)]
  });
}

export function approveOrganizerCorrectionRequest(state: OrganizerMockState, requestId: string, remarks?: string) {
  return saveOrganizerMockState({
    ...state,
    correctionRequests: state.correctionRequests.map((request) =>
      request.id === requestId ? { ...request, status: "Approved", decisionRemarks: remarks ?? "Approved. Attendance record updated." } : request
    )
  });
}

export function rejectOrganizerCorrectionRequest(state: OrganizerMockState, requestId: string, remarks?: string) {
  return saveOrganizerMockState({
    ...state,
    correctionRequests: state.correctionRequests.map((request) =>
      request.id === requestId ? { ...request, status: "Rejected", decisionRemarks: remarks ?? "Rejected. Original attendance record retained." } : request
    )
  });
}

export function regenerateOrganizerQr(state: OrganizerMockState, studentId: string) {
  return saveOrganizerMockState({
    ...state,
    students: state.students.map((student) => (student.id === studentId ? { ...student, qrStatus: "Generated" } : student))
  });
}

export function updateOrganizerFacialStatus(state: OrganizerMockState, studentId: string, facialStatus: CredentialStatus) {
  return saveOrganizerMockState({
    ...state,
    students: state.students.map((student) => (student.id === studentId ? { ...student, facialStatus } : student))
  });
}

export function createMockExport(label: string) {
  return `${label} export generated locally at ${new Date().toLocaleString()}.`;
}
