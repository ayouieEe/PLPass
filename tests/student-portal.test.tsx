import { cleanup, render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, describe, expect, it } from "vitest";
import { App } from "@/app/App";
import { queryClient } from "@/app/providers/queryClient";
import { studentTestContext, studentTwoTestContext } from "@/mocks/testHelpers";
import { developmentErrorToggle } from "@/services/mock/developmentErrorToggle";
import { resetMockRepositoryState } from "@/services/mock/repositories";
import { repositories } from "@/services/repositories";

const studentSession = JSON.stringify({
  userId: "user-student-1",
  role: "student",
  displayName: "Student 01",
  email: "student.1@plpass.test",
  isAuthenticated: true
});

const studentTwoSession = JSON.stringify({
  userId: "user-student-2",
  role: "student",
  displayName: "Student 02",
  email: "student.2@plpass.test",
  isAuthenticated: true
});

const facultySession = JSON.stringify({
  userId: "user-faculty-1",
  role: "faculty",
  displayName: "Faculty One",
  email: "faculty.one@plpass.test",
  isAuthenticated: true
});

function setRoute(path: string) {
  window.history.pushState({}, "", path);
}

function storeSession(value: string) {
  window.localStorage.setItem("plpass-development-session", value);
}

afterEach(() => {
  window.localStorage.clear();
  queryClient.clear();
  developmentErrorToggle.reset();
  resetMockRepositoryState();
  setRoute("/");
});

describe("student route access", () => {
  it("renders the student dashboard for a student user", async () => {
    storeSession(studentSession);
    setRoute("/student/dashboard");
    render(<App />);

    expect(await screen.findByRole("heading", { name: "Student dashboard" })).toBeInTheDocument();
    expect(screen.getByRole("navigation", { name: "student navigation" })).toBeInTheDocument();
    expect(screen.queryByRole("navigation", { name: "admin navigation" })).not.toBeInTheDocument();
  });

  it("denies student routes to a faculty user", async () => {
    storeSession(facultySession);
    setRoute("/student/attendance");
    render(<App />);

    expect(await screen.findByRole("heading", { name: "Access denied" })).toBeInTheDocument();
  });
});

describe("student repository scoping and workflows", () => {
  it("lists only Student 01 classes, events, attendance, reports, taps, and corrections", async () => {
    const classes = await repositories.academicManagement.listClasses({ pageIndex: 0, pageSize: 20 }, studentTestContext);
    const events = await repositories.eventManagement.listEvents({ pageIndex: 0, pageSize: 20 }, studentTestContext);
    const records = await repositories.attendanceRecords.listAttendanceRecords({ pageIndex: 0, pageSize: 50 }, studentTestContext);
    const corrections = await repositories.correctionRequests.listCorrectionRequests({ pageIndex: 0, pageSize: 20 }, studentTestContext);
    const reports = await repositories.reports.listReports({ pageIndex: 0, pageSize: 20 }, studentTestContext);
    const taps = await repositories.nfcReaders.listNfcTapAttempts({ pageIndex: 0, pageSize: 20 }, studentTestContext);

    expect(classes.items.map((classRecord) => classRecord.id)).toContain("class-1");
    expect(events.items.map((event) => event.id)).toContain("event-1");
    expect(records.items.every((record) => record.studentId === "student-1")).toBe(true);
    expect(corrections.items.every((request) => request.studentId === "student-1")).toBe(true);
    expect(reports.items.every((report) => report.requestedByUserId === "user-student-1" || report.scope === "student-1")).toBe(true);
    expect(taps.items.every((tap) => tap.studentId === "student-1")).toBe(true);
  });

  it("keeps Student 02 isolated from Student 01 records", async () => {
    const records = await repositories.attendanceRecords.listAttendanceRecords({ pageIndex: 0, pageSize: 50 }, studentTwoTestContext);
    const reports = await repositories.reports.listReports({ pageIndex: 0, pageSize: 20 }, studentTwoTestContext);

    expect(records.items.every((record) => record.studentId === "student-2")).toBe(true);
    expect(reports.items).toEqual([]);
  });

  it("prevents a student from reading another student's attendance record", async () => {
    await expect(repositories.attendanceRecords.getAttendanceRecordById("record-2", studentTestContext)).rejects.toMatchObject({
      code: "PERMISSION_DENIED"
    });
  });

  it("validates correction request ownership and duplicate pending requests", async () => {
    await expect(
      repositories.correctionRequests.createCorrectionRequest(
        {
          studentId: "student-1",
          attendanceRecordId: "record-2",
          requestedStatus: "present",
          reason: "This belongs to another student."
        },
        studentTestContext
      )
    ).rejects.toMatchObject({ code: "PERMISSION_DENIED" });

    const created = await repositories.correctionRequests.createCorrectionRequest(
      {
        studentId: "student-1",
        attendanceRecordId: "record-1",
        classId: "class-1",
        requestedStatus: "late",
        reason: "I need the recorded status corrected."
      },
      studentTestContext
    );
    expect(created.status).toBe("pending");

    await expect(
      repositories.correctionRequests.createCorrectionRequest(
        {
          studentId: "student-1",
          attendanceRecordId: "record-1",
          classId: "class-1",
          requestedStatus: "late",
          reason: "Duplicate pending request."
        },
        studentTestContext
      )
    ).rejects.toMatchObject({ code: "VALIDATION_ERROR" });
  });

  it("creates NFC issue requests and blocks duplicate pending request types", async () => {
    const created = await repositories.nfcCredentialRequests.createNfcCredentialRequest(
      { studentId: "student-1", credentialId: "nfc-1", type: "lost", reason: "I lost my sticker after class." },
      studentTestContext
    );
    expect(created.status).toBe("pending");

    await expect(
      repositories.nfcCredentialRequests.createNfcCredentialRequest(
        { studentId: "student-1", credentialId: "nfc-1", type: "lost", reason: "Duplicate lost sticker request." },
        studentTestContext
      )
    ).rejects.toMatchObject({ code: "VALIDATION_ERROR" });
  });
});

describe("student UI flows", () => {
  it("renders attendance tabs and calendar view", async () => {
    storeSession(studentSession);
    setRoute("/student/attendance");
    render(<App />);
    const user = userEvent.setup();

    expect(await screen.findByRole("heading", { name: "Attendance Records" })).toBeInTheDocument();
    await user.click(screen.getByRole("tab", { name: "Events" }));
    expect(await screen.findByText("EVT-001")).toBeInTheDocument();
    await user.click(screen.getByRole("button", { name: "Calendar view" }));
    expect(await screen.findByLabelText("Attendance calendar items")).toBeInTheDocument();
  });

  it("renders schedule, NFC credential, report history, and profile pages", async () => {
    storeSession(studentSession);
    for (const [path, heading] of [
      ["/student/schedule", "Schedule"],
      ["/student/nfc-credential", "NFC Credential"],
      ["/student/reports", "Report History"],
      ["/student/profile", "Profile"]
    ] as const) {
      setRoute(path);
      render(<App />);
      expect(await screen.findByRole("heading", { name: heading })).toBeInTheDocument();
      cleanup();
      window.localStorage.clear();
      queryClient.clear();
      storeSession(studentSession);
    }
  });

  it("validates correction and NFC request forms", async () => {
    storeSession(studentSession);
    setRoute("/student/corrections");
    render(<App />);
    const user = userEvent.setup();

    expect(await screen.findByRole("heading", { name: "Correction Requests" })).toBeInTheDocument();
    await user.click(screen.getByRole("button", { name: "Submit correction request" }));
    expect(await screen.findByText("Select a related attendance record.")).toBeInTheDocument();

    cleanup();
    window.localStorage.clear();
    queryClient.clear();
    storeSession(studentSession);
    setRoute("/student/nfc-credential");
    render(<App />);
    const nfcUser = userEvent.setup();
    expect(await screen.findByRole("heading", { name: "NFC Credential" })).toBeInTheDocument();
    await nfcUser.click(screen.getByRole("button", { name: "Submit NFC issue request" }));
    expect(await screen.findByText("Reason must be at least 10 characters.")).toBeInTheDocument();
  });

  it("refreshes student data after account switching", async () => {
    storeSession(studentSession);
    setRoute("/student/attendance");
    const view = render(<App />);
    const user = userEvent.setup();
    expect(await screen.findByRole("heading", { name: "Attendance Records" })).toBeInTheDocument();
    await user.click(screen.getByRole("tab", { name: "Events" }));
    expect(await screen.findByText("EVT-001")).toBeInTheDocument();

    view.unmount();
    window.localStorage.setItem("plpass-development-session", studentTwoSession);
    queryClient.clear();
    render(<App />);
    expect(await screen.findByRole("heading", { name: "Attendance Records" })).toBeInTheDocument();
    await user.click(screen.getByRole("tab", { name: "Events" }));
    expect(screen.queryByText("EVT-001")).not.toBeInTheDocument();
  });
});
