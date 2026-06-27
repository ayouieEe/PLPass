import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, describe, expect, it } from "vitest";
import { App } from "@/app/App";
import { queryClient } from "@/app/providers/queryClient";
import { organizerTestContext, organizerTwoTestContext, studentTestContext } from "@/mocks/testHelpers";
import { developmentErrorToggle } from "@/services/mock/developmentErrorToggle";
import { resetMockRepositoryState } from "@/services/mock/repositories";
import { repositories } from "@/services/repositories";

const organizerSession = JSON.stringify({
  userId: "user-organizer-1",
  role: "organizer",
  displayName: "Organizer One",
  email: "organizer.one@plpass.test",
  isAuthenticated: true
});

const organizerTwoSession = JSON.stringify({
  userId: "user-organizer-2",
  role: "organizer",
  displayName: "Organizer Two",
  email: "organizer.two@plpass.test",
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

describe("organizer route access", () => {
  it("renders the organizer dashboard for an organizer user", async () => {
    storeSession(organizerSession);
    setRoute("/organizer/dashboard");
    render(<App />);

    expect(await screen.findByRole("heading", { name: "Organizer dashboard" })).toBeInTheDocument();
    expect(screen.getByRole("navigation", { name: "organizer navigation" })).toBeInTheDocument();
    expect(screen.queryByRole("navigation", { name: "admin navigation" })).not.toBeInTheDocument();
  });

  it("denies organizer routes to a student user", async () => {
    storeSession(studentSession);
    setRoute("/organizer/events");
    render(<App />);

    expect(await screen.findByRole("heading", { name: "Access denied" })).toBeInTheDocument();
  });
});

describe("organizer repository scoping and workflows", () => {
  it("lists only events owned by the signed-in organizer", async () => {
    const events = await repositories.eventManagement.listEvents({ pageIndex: 0, pageSize: 20 }, organizerTestContext);

    expect(events.items.map((event) => event.id)).toEqual(["event-1", "event-3"]);
  });

  it("isolates the second organizer account and returns empty scoped lists without errors", async () => {
    const events = await repositories.eventManagement.listEvents({ pageIndex: 0, pageSize: 20 }, organizerTwoTestContext);
    const sessions = await repositories.attendanceSessions.listAttendanceSessions({ pageIndex: 0, pageSize: 20 }, organizerTwoTestContext);
    const corrections = await repositories.correctionRequests.listCorrectionRequests({ pageIndex: 0, pageSize: 20 }, organizerTwoTestContext);
    const reports = await repositories.reports.listReports({ pageIndex: 0, pageSize: 20 }, organizerTwoTestContext);
    const predictions = await repositories.analyticsMl.listMlPredictions({ pageIndex: 0, pageSize: 20 }, organizerTwoTestContext);

    expect(events.items.map((event) => event.id)).toEqual(["event-2", "event-4"]);
    expect(sessions.items).toEqual([]);
    expect(corrections.items).toEqual([]);
    expect(reports.items).toEqual([]);
    expect(predictions.items).toEqual([]);
  });

  it("prevents an organizer from reading another organizer event or session", async () => {
    await expect(repositories.eventManagement.getEventById("event-1", organizerTwoTestContext)).rejects.toMatchObject({
      code: "PERMISSION_DENIED"
    });
    await expect(repositories.attendanceSessions.getAttendanceSessionById("session-4", organizerTwoTestContext)).rejects.toMatchObject({
      code: "PERMISSION_DENIED"
    });
  });

  it("validates event creation and creates pending events with participants", async () => {
    await expect(
      repositories.eventManagement.createEvent(
        {
          code: "",
          title: "Invalid",
          category: "Forum",
          venue: "Auditorium",
          date: "2026-07-15",
          startTime: "10:00",
          endTime: "11:00",
          attendanceMode: "face-to-face",
          participantStudentIds: ["student-1"]
        },
        organizerTestContext
      )
    ).rejects.toMatchObject({ code: "VALIDATION_ERROR" });

    const created = await repositories.eventManagement.createEvent(
      {
        code: "EVT-999",
        title: "Mock Organizer Event",
        category: "Forum",
        venue: "Auditorium",
        date: "2026-07-15",
        startTime: "10:00",
        endTime: "11:00",
        attendanceMode: "face-to-face",
        participantStudentIds: ["student-1", "student-2"]
      },
      organizerTestContext
    );
    const participants = await repositories.eventManagement.listEventParticipants(
      created.id,
      { pageIndex: 0, pageSize: 20 },
      organizerTestContext
    );

    expect(created.status).toBe("pending");
    expect(participants.total).toBe(2);
  });

  it("validates session creation and end-session reason", async () => {
    await expect(
      repositories.attendanceSessions.createEventSession(
        {
          eventId: "event-1",
          venue: "",
          date: "2026-07-15",
          startTime: "10:00",
          expectedEndTime: "11:00",
          attendanceMode: "face-to-face"
        },
        organizerTestContext
      )
    ).rejects.toMatchObject({ code: "VALIDATION_ERROR" });

    const created = await repositories.attendanceSessions.createEventSession(
      {
        eventId: "event-1",
        venue: "Main Hall",
        date: "2026-07-15",
        startTime: "10:00",
        expectedEndTime: "11:00",
        attendanceMode: "face-to-face"
      },
      organizerTestContext
    );

    await expect(
      repositories.attendanceSessions.endAttendanceSession({ sessionId: created.id, reason: "" }, organizerTestContext)
    ).rejects.toMatchObject({ code: "VALIDATION_ERROR" });

    const ended = await repositories.attendanceSessions.endAttendanceSession(
      { sessionId: created.id, reason: "Event ended early" },
      organizerTestContext
    );
    expect(ended.status).toBe("completed");
  });

  it("approves and rejects organizer event correction requests with validation", async () => {
    await resetCorrectionRequestState();
    const approved = await repositories.correctionRequests.reviewCorrectionRequest(
      { requestId: "correction-3", status: "approved" },
      organizerTestContext
    );
    expect(approved.status).toBe("approved");

    await resetCorrectionRequestState();
    await expect(
      repositories.correctionRequests.reviewCorrectionRequest(
        { requestId: "correction-3", status: "rejected", reason: "" },
        organizerTestContext
      )
    ).rejects.toMatchObject({ code: "VALIDATION_ERROR" });

    const rejected = await repositories.correctionRequests.reviewCorrectionRequest(
      { requestId: "correction-3", status: "rejected", reason: "Event attendance record stays unchanged." },
      organizerTestContext
    );
    expect(rejected.status).toBe("rejected");
  });

  it("still blocks student repository context from organizer-only data", async () => {
    await expect(repositories.eventManagement.createEvent(
      {
        code: "EVT-X",
        title: "Blocked",
        category: "Forum",
        venue: "Main Hall",
        date: "2026-07-15",
        startTime: "10:00",
        endTime: "11:00",
        attendanceMode: "online",
        participantStudentIds: ["student-1"]
      },
      studentTestContext
    )).rejects.toMatchObject({ code: "PERMISSION_DENIED" });
  });
});

describe("organizer UI flows", () => {
  it("renders the second organizer routes with isolated data and empty records", async () => {
    storeSession(organizerTwoSession);
    setRoute("/organizer/events");
    render(<App />);

    expect(await screen.findByRole("heading", { name: "Events" })).toBeInTheDocument();
    expect(await screen.findByText("Business Forum")).toBeInTheDocument();
    expect(screen.queryByText("CCS Orientation")).not.toBeInTheDocument();
  });

  it("shows event unavailable for an unauthorized event route", async () => {
    storeSession(organizerTwoSession);
    setRoute("/organizer/events/event-1");
    render(<App />);

    expect(await screen.findByRole("heading", { name: "Event unavailable" })).toBeInTheDocument();
  });

  it("validates create event participant selection", async () => {
    storeSession(organizerSession);
    setRoute("/organizer/events/create");
    render(<App />);
    const user = userEvent.setup();

    expect(await screen.findByRole("heading", { name: "Create Event" })).toBeInTheDocument();
    await user.click(screen.getByRole("button", { name: "Create pending event" }));

    expect(await screen.findByText("Event code is required.")).toBeInTheDocument();
    expect(await screen.findByText("Select at least one participant.")).toBeInTheDocument();
  });

  it("refreshes visible organizer data after account switching", async () => {
    storeSession(organizerSession);
    setRoute("/organizer/events");
    const view = render(<App />);

    expect(await screen.findByText("CCS Orientation")).toBeInTheDocument();
    expect(screen.queryByText("Business Forum")).not.toBeInTheDocument();

    window.localStorage.setItem("plpass-development-session", organizerTwoSession);
    queryClient.clear();
    view.unmount();
    render(<App />);

    expect(await screen.findByText("Business Forum")).toBeInTheDocument();
    expect(screen.queryByText("CCS Orientation")).not.toBeInTheDocument();
  });
});

async function resetCorrectionRequestState() {
  resetMockRepositoryState();
  await waitFor(() => expect(true).toBe(true));
}
