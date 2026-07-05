import { render, screen, waitFor } from "@testing-library/react";
import { afterEach, describe, expect, it } from "vitest";
import { App } from "@/app/App";
import { queryClient } from "@/app/providers/queryClient";
import { facultyTestContext, facultyTwoTestContext } from "@/mocks/testHelpers";
import { developmentErrorToggle } from "@/services/mock/developmentErrorToggle";
import { resetMockRepositoryState } from "@/services/mock/repositories";
import { repositories } from "@/services/repositories";

const facultySession = JSON.stringify({
  userId: "user-faculty-1",
  role: "faculty",
  displayName: "Faculty One",
  email: "faculty.one@plpass.test",
  isAuthenticated: true
});

const facultyTwoSession = JSON.stringify({
  userId: "user-faculty-2",
  role: "faculty",
  displayName: "Faculty Two",
  email: "faculty.two@plpass.test",
  isAuthenticated: true
});

const studentSession = JSON.stringify({
  userId: "user-student-1",
  role: "student",
  displayName: "Student 01",
  email: "student.1@plpass.test",
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

describe("faculty route access", () => {
  it("does not render a faculty portal route for a legacy faculty session", async () => {
    storeSession(facultySession);
    setRoute("/faculty/dashboard");
    render(<App />);

    expect(await screen.findByRole("heading", { name: "Page not found" })).toBeInTheDocument();
    expect(screen.queryByRole("navigation", { name: "faculty navigation" })).not.toBeInTheDocument();
    expect(screen.queryByRole("navigation", { name: "admin navigation" })).not.toBeInTheDocument();
  });

  it("does not expose faculty routes to a student user", async () => {
    storeSession(studentSession);
    setRoute("/faculty/classes");
    render(<App />);

    expect(await screen.findByRole("heading", { name: "Page not found" })).toBeInTheDocument();
  });
});

describe("faculty repository scoping and filters", () => {
  it("lists only classes assigned to the signed-in faculty", async () => {
    const classes = await repositories.academicManagement.listClasses({ pageIndex: 0, pageSize: 20 }, facultyTestContext);

    expect(classes.items.map((classRecord) => classRecord.id)).toEqual(["class-1", "class-2"]);
  });

  it("filters faculty classes by search text", async () => {
    const classes = await repositories.academicManagement.listClasses(
      { pageIndex: 0, pageSize: 20, search: "IT 301" },
      facultyTestContext
    );

    expect(classes.total).toBe(1);
    expect(classes.items[0]?.subjectCode).toBe("IT 301");
  });

  it("prevents faculty from reading another faculty member class", async () => {
    await expect(repositories.academicManagement.getClassById("class-3", facultyTestContext)).rejects.toMatchObject({
      code: "PERMISSION_DENIED"
    });
  });

  it("scopes attendance sessions and analytics to assigned classes", async () => {
    const sessions = await repositories.attendanceSessions.listAttendanceSessions(
      { pageIndex: 0, pageSize: 20 },
      facultyTestContext
    );
    const predictions = await repositories.analyticsMl.listMlPredictions({ pageIndex: 0, pageSize: 20 }, facultyTestContext);

    expect(sessions.items.every((session) => session.classId === "class-1" || session.classId === "class-2")).toBe(true);
    expect(predictions.items.every((prediction) => prediction.classId === "class-1" || prediction.classId === "class-2")).toBe(true);
  });

  it("lists only Faculty Two assigned classes and returns empty scoped lists without errors", async () => {
    const classes = await repositories.academicManagement.listClasses({ pageIndex: 0, pageSize: 20 }, facultyTwoTestContext);
    const sessions = await repositories.attendanceSessions.listAttendanceSessions({ pageIndex: 0, pageSize: 20 }, facultyTwoTestContext);
    const corrections = await repositories.correctionRequests.listCorrectionRequests({ pageIndex: 0, pageSize: 20 }, facultyTwoTestContext);
    const reports = await repositories.reports.listReports({ pageIndex: 0, pageSize: 20 }, facultyTwoTestContext);
    const predictions = await repositories.analyticsMl.listMlPredictions({ pageIndex: 0, pageSize: 20 }, facultyTwoTestContext);

    expect(classes.items.map((classRecord) => classRecord.id)).toEqual(["class-3", "class-4"]);
    expect(sessions.items).toEqual([]);
    expect(corrections.items).toEqual([]);
    expect(reports.items).toEqual([]);
    expect(predictions.items).toEqual([]);
  });

  it("denies Faculty Two access to Faculty One class and session details", async () => {
    await expect(repositories.academicManagement.getClassById("class-1", facultyTwoTestContext)).rejects.toMatchObject({
      code: "PERMISSION_DENIED"
    });
    await expect(repositories.attendanceSessions.getAttendanceSessionById("session-2", facultyTwoTestContext)).rejects.toMatchObject({
      code: "PERMISSION_DENIED"
    });
  });
});

describe("faculty session and correction workflows", () => {
  it("validates session creation and creates an active session", async () => {
    await expect(
      repositories.attendanceSessions.createClassSession(
        {
          classId: "class-1",
          title: "Invalid Session",
          room: "",
          date: "2026-06-27",
          startTime: "08:00",
          expectedEndTime: "09:00",
          mode: "required"
        },
        facultyTestContext
      )
    ).rejects.toMatchObject({ code: "VALIDATION_ERROR" });

    const created = await repositories.attendanceSessions.createClassSession(
      {
        classId: "class-1",
        title: "IT 204 Mock Session",
        room: "Room 302",
        date: "2026-06-27",
        startTime: "08:00",
        expectedEndTime: "09:00",
        mode: "required"
      },
      facultyTestContext
    );

    expect(created.status).toBe("active");
    expect(created.classId).toBe("class-1");
  });

  it("requires an end-session reason", async () => {
    await expect(
      repositories.attendanceSessions.endAttendanceSession({ sessionId: "session-2", reason: "" }, facultyTestContext)
    ).rejects.toMatchObject({ code: "VALIDATION_ERROR" });

    const ended = await repositories.attendanceSessions.endAttendanceSession(
      { sessionId: "session-2", reason: "Class ended early" },
      facultyTestContext
    );
    expect(ended.status).toBe("completed");
  });

  it("approves and rejects correction requests with validation", async () => {
    const approved = await repositories.correctionRequests.reviewCorrectionRequest(
      { requestId: "correction-1", status: "approved" },
      facultyTestContext
    );
    expect(approved.status).toBe("approved");

    await resetCorrectionRequestState();
    await expect(
      repositories.correctionRequests.reviewCorrectionRequest(
        { requestId: "correction-1", status: "rejected", reason: "" },
        facultyTestContext
      )
    ).rejects.toMatchObject({ code: "VALIDATION_ERROR" });

    const rejected = await repositories.correctionRequests.reviewCorrectionRequest(
      { requestId: "correction-1", status: "rejected", reason: "Record does not match logs." },
      facultyTestContext
    );
    expect(rejected.status).toBe("rejected");
  });
});

describe("faculty UI flows", () => {
  it("does not expose the legacy start-session UI route", async () => {
    storeSession(facultySession);
    setRoute("/faculty/sessions/start");
    render(<App />);

    expect(await screen.findByRole("heading", { name: "Page not found" })).toBeInTheDocument();
  });

  it("does not expose the legacy faculty attendance UI route", async () => {
    storeSession(facultyTwoSession);
    setRoute("/faculty/attendance");
    render(<App />);

    expect(await screen.findByRole("heading", { name: "Page not found" })).toBeInTheDocument();
    expect(screen.queryByText("IT 204")).not.toBeInTheDocument();
  });

  it("does not expose legacy faculty class detail routes", async () => {
    storeSession(facultyTwoSession);
    setRoute("/faculty/classes/class-1");
    render(<App />);

    expect(await screen.findByRole("heading", { name: "Page not found" })).toBeInTheDocument();
  });
});

async function resetCorrectionRequestState() {
  resetMockRepositoryState();
  await waitFor(() => expect(true).toBe(true));
}
