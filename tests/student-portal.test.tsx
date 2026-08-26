import { cleanup, render, screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, describe, expect, it } from "vitest";
import { App } from "@/app/App";
import { queryClient } from "@/app/providers/queryClient";
import { studentTestContext, studentTwoTestContext } from "@/test-support/testHelpers";
import { developmentErrorToggle } from "@/test-support/developmentErrorToggle";
import { resetSimulatedRepositoryState } from "@/test-support/repositories";
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
  resetSimulatedRepositoryState();
  setRoute("/");
});

describe("student route access", () => {
  it("renders the student dashboard for a student user", async () => {
    storeSession(studentSession);
    setRoute("/student/dashboard");
    render(<App />);

    expect(await screen.findByRole("heading", { name: /Welcome back/i })).toBeInTheDocument();
    expect(screen.getByRole("navigation", { name: "student navigation" })).toBeInTheDocument();
    expect(await screen.findByRole("link", { name: "Open attended event records" })).toHaveAttribute("href", "/student/attendance");
    expect(screen.getByRole("link", { name: "Open attendance records" })).toHaveAttribute("href", "/student/attendance");
    expect(screen.getByRole("link", { name: "Open event cards" })).toHaveAttribute("href", "/student/events");
    expect(screen.getByRole("button", { name: "Open pending tasks" })).toBeInTheDocument();
    expect(screen.getByRole("link", { name: "Request History" })).toHaveAttribute("href", "/student/request-history");
    expect(screen.queryByRole("link", { name: "Reports" })).not.toBeInTheDocument();
    expect(screen.queryByRole("navigation", { name: "admin navigation" })).not.toBeInTheDocument();
  });

  it("does not restore unsupported legacy faculty sessions on student routes", async () => {
    storeSession(JSON.stringify({
      userId: "user-faculty-1",
      role: "faculty",
      displayName: "Faculty One",
      email: "faculty.one@plpass.test",
      isAuthenticated: true
    }));
    setRoute("/student/attendance");
    render(<App />);

    expect(await screen.findByRole("heading", { name: /sign in to plpass/i })).toBeInTheDocument();
  });
});

describe("student repository scoping and workflows", () => {
  it("lists only Student 01 classes, events, attendance, reports, and corrections", async () => {
    const classes = await repositories.academicManagement.listClasses({ pageIndex: 0, pageSize: 20 }, studentTestContext);
    const events = await repositories.eventManagement.listEvents({ pageIndex: 0, pageSize: 20 }, studentTestContext);
    const records = await repositories.attendanceRecords.listAttendanceRecords({ pageIndex: 0, pageSize: 50 }, studentTestContext);
    const corrections = await repositories.correctionRequests.listCorrectionRequests({ pageIndex: 0, pageSize: 20 }, studentTestContext);
    const reports = await repositories.reports.listReports({ pageIndex: 0, pageSize: 20 }, studentTestContext);

    expect(classes.items.map((classRecord) => classRecord.id)).toContain("class-1");
    expect(events.items.map((event) => event.id)).toContain("event-1");
    expect(records.items.every((record) => record.studentId === "student-1")).toBe(true);
    expect(corrections.items.every((request) => request.studentId === "student-1")).toBe(true);
    expect(reports.items.every((report) => report.requestedByUserId === "user-student-1" || report.scope === "student-1")).toBe(true);
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

});

describe("student UI flows", () => {
  it("renders attendance records by year", async () => {
    storeSession(studentSession);
    setRoute("/student/attendance");
    render(<App />);
    const user = userEvent.setup();

    expect(await screen.findByRole("heading", { name: "Attendance Records" })).toBeInTheDocument();
    expect(await screen.findByRole("heading", { name: "Attended Events by Year" })).toBeInTheDocument();
    const yearSelect = screen.getByRole("combobox", { name: "Attendance year" });
    expect(screen.getByRole("option", { name: "2026" })).toBeInTheDocument();
    await user.selectOptions(yearSelect, "2026");
    const presentRecord = (await screen.findByText(/EVT-2026-001/)).closest("article");
    expect(presentRecord).not.toBeNull();
    await user.click(within(presentRecord as HTMLElement).getByRole("button", { name: "View Details" }));
    expect(await screen.findByRole("dialog")).toBeInTheDocument();
    expect(screen.queryByText("Request Attendance Correction")).not.toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "Calendar View" })).not.toBeInTheDocument();
    await user.click(screen.getByRole("button", { name: "Close modal" }));

    expect(screen.queryByText(/EVT-2026-005/)).not.toBeInTheDocument();
  });

  it("opens feedback-due attendance tasks from dashboard metrics", async () => {
    storeSession(studentSession);
    setRoute("/student/dashboard");
    render(<App />);
    const user = userEvent.setup();

    expect(await screen.findByRole("heading", { name: /Welcome back/i })).toBeInTheDocument();
    await user.click(await screen.findByRole("button", { name: "Open pending tasks" }));
    const feedbackDialog = await screen.findByRole("dialog");
    expect(within(feedbackDialog).getByRole("heading", { name: "Pending Tasks" })).toBeInTheDocument();
    expect(within(feedbackDialog).getByText("PLP Campus Sustainability Series")).toBeInTheDocument();
    expect(within(feedbackDialog).getByText("PLP Tech & Leadership Simulation Day")).toBeInTheDocument();
    const presentTask = within(feedbackDialog).getByText("PLP Campus Sustainability Series").closest("article");
    expect(presentTask).not.toBeNull();
    expect(within(presentTask as HTMLElement).getByText("present")).toBeInTheDocument();
    expect(within(feedbackDialog).getByText(/Submit your late reason before event feedback/i)).toBeInTheDocument();
    const feedbackLinks = within(feedbackDialog).getAllByRole("link", { name: "Answer Feedback" });
    expect(feedbackLinks.length).toBeGreaterThan(0);
    expect(feedbackLinks[0]).toHaveAttribute("href", expect.stringContaining("/student/attendance?status=feedback-due&focus="));
  });

  it("locks event feedback until a late reason is submitted", async () => {
    storeSession(studentSession);
    setRoute("/student/attendance?status=late-reason-required&focus=event-4");
    render(<App />);

    expect(await screen.findByRole("heading", { name: "Attendance Records" })).toBeInTheDocument();
    const detailDialog = await screen.findByRole("dialog");
    expect(within(detailDialog).getByRole("heading", { name: "PLP Tech & Leadership Simulation Day" })).toBeInTheDocument();
    expect(within(detailDialog).getByText("Late reason")).toBeInTheDocument();
    expect(within(detailDialog).getByText("Required before feedback unlocks")).toBeInTheDocument();
    expect(within(detailDialog).getByText("Submit this first before event feedback becomes available.")).toBeInTheDocument();
    expect(within(detailDialog).getByRole("button", { name: "Submit Reason" })).toBeInTheDocument();
    expect(within(detailDialog).queryByRole("button", { name: "Answer Feedback" })).not.toBeInTheDocument();
  });

  it("opens pending feedback tasks from the attendance summary", async () => {
    storeSession(studentSession);
    setRoute("/student/attendance");
    render(<App />);
    const user = userEvent.setup();

    expect(await screen.findByRole("heading", { name: "Attendance Records" })).toBeInTheDocument();
    await user.click(screen.getByRole("button", { name: "Open pending attendance tasks" }));
    const feedbackDialog = await screen.findByRole("dialog");
    expect(within(feedbackDialog).getByRole("heading", { name: "Pending Tasks" })).toBeInTheDocument();
    expect(within(feedbackDialog).getByText("PLP Campus Sustainability Series")).toBeInTheDocument();
    expect(within(feedbackDialog).getByText("PLP Tech & Leadership Simulation Day")).toBeInTheDocument();

    await user.click(within(feedbackDialog).getAllByRole("button", { name: "Answer Feedback" })[0]);
    const detailDialog = await screen.findByRole("dialog");
    expect(within(detailDialog).getByRole("heading", { name: "PLP Campus Sustainability Series" })).toBeInTheDocument();
    expect(within(detailDialog).getByRole("button", { name: "Answer Feedback" })).toBeInTheDocument();
  });

  it("opens a focused feedback-due attendance detail from the query string", async () => {
    storeSession(studentSession);
    setRoute("/student/attendance?status=feedback-due&focus=event-5");
    render(<App />);

    expect(await screen.findByRole("heading", { name: "Attendance Records" })).toBeInTheDocument();
    const detailDialog = await screen.findByRole("dialog");
    expect(within(detailDialog).getByRole("heading", { name: "PLP Campus Sustainability Series" })).toBeInTheDocument();
    expect(within(detailDialog).getByText("Feedback required")).toBeInTheDocument();
    expect(within(detailDialog).getByRole("button", { name: "Answer Feedback" })).toBeInTheDocument();
  });

  it("renders upcoming events, attendance methods, and profile pages", async () => {
    storeSession(studentSession);
    for (const [path, heading] of [
      ["/student/schedule", "Events"],
      ["/student/methods", "Attendance Methods"],
      ["/student/request-history", "Request History"],
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

  it("validates correction and verification issue forms", async () => {
    storeSession(studentSession);
    setRoute("/student/corrections");
    render(<App />);
    const user = userEvent.setup();

    expect(await screen.findByRole("heading", { name: "Correction Requests" })).toBeInTheDocument();
    await user.click(await screen.findByRole("button", { name: "Submit correction request" }));
    expect(await screen.findByText("Select a related attendance record.")).toBeInTheDocument();

    cleanup();
    window.localStorage.clear();
    queryClient.clear();
    storeSession(studentSession);
    setRoute("/student/methods");
    render(<App />);
    const methodsUser = userEvent.setup();
    expect(await screen.findByRole("heading", { name: "Attendance Methods" })).toBeInTheDocument();
    await methodsUser.click(await screen.findByRole("button", { name: "Report attendance issue" }));
    await methodsUser.click(await screen.findByRole("button", { name: "Submit report" }));
    expect(await screen.findByText("Explanation must be at least 10 characters.")).toBeInTheDocument();

    await methodsUser.type(screen.getByPlaceholderText("Example: My QR could not be scanned during EVT-2026-005 at the venue entrance."), "QR scanner failed during the venue check-in.");
    await methodsUser.click(screen.getByRole("button", { name: "Submit report" }));

    cleanup();
    queryClient.clear();
    setRoute("/student/request-history");
    render(<App />);
    expect(await screen.findByRole("heading", { name: "Request History" })).toBeInTheDocument();
    expect(await screen.findByText("Attendance Issue")).toBeInTheDocument();
    expect(screen.getByText("QR scanner failed during the venue check-in.")).toBeInTheDocument();
  });

  it("refreshes student data after account switching", async () => {
    storeSession(studentSession);
    setRoute("/student/attendance");
    const view = render(<App />);
    expect(await screen.findByRole("heading", { name: "Attendance Records" })).toBeInTheDocument();
    expect(await screen.findByRole("heading", { name: "Attended Events by Year" })).toBeInTheDocument();
    expect(await screen.findByText(/EVT-2026-001/)).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "Calendar View" })).not.toBeInTheDocument();

    view.unmount();
    window.localStorage.setItem("plpass-development-session", studentTwoSession);
    queryClient.clear();
    render(<App />);
    expect(await screen.findByRole("heading", { name: "Attendance Records" })).toBeInTheDocument();
    expect(await screen.findByRole("heading", { name: "Attended Events by Year" })).toBeInTheDocument();
  });
});
