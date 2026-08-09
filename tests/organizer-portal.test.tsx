import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import type { ReactNode } from "react";
import { MemoryRouter } from "react-router-dom";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { App } from "@/app/App";
import { queryClient } from "@/app/providers/queryClient";
import { CompletedEventModal } from "@/features/organizer/pages/EventRecordsPage";
import { AuthenticationMethodsPage } from "@/features/organizer/pages/AuthenticationMethodsPage";
import { organizerTestContext, organizerTwoTestContext, studentTestContext } from "@/test-support/testHelpers";
import { developmentErrorToggle } from "@/test-support/developmentErrorToggle";
import { resetSimulatedRepositoryState } from "@/test-support/repositories";
import { repositories } from "@/services/repositories";

vi.mock("@/components/data-display/PLPassDataGrid", () => ({
  PLPassDataGrid: ({ toolbarActions, data, onSelectionChange }: { toolbarActions?: ReactNode; data?: Array<{ code?: string; requestId?: string; id?: string; name?: string; title?: string }> ; onSelectionChange?: (rows: Array<{ code?: string; requestId?: string; id?: string; name?: string; title?: string }>) => void }) => (
    <div>
      {toolbarActions}
      <button type="button" onClick={() => onSelectionChange?.(data?.slice(0, 1) ?? [])}>Select first row</button>
      <div data-testid="mock-grid-rows">
        {(data ?? []).map((row) => <div key={row.id ?? row.requestId ?? row.code}>{row.name ?? row.title ?? row.requestId ?? row.code ?? row.id}</div>)}
      </div>
    </div>
  )
}));

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

beforeEach(() => {
  window.localStorage.clear();
  queryClient.clear();
  developmentErrorToggle.reset();
  resetSimulatedRepositoryState();
});

afterEach(() => {
  window.localStorage.clear();
  queryClient.clear();
  developmentErrorToggle.reset();
  resetSimulatedRepositoryState();
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

  it("renders the analytics insights workspace with detailed sections", async () => {
    storeSession(organizerSession);
    setRoute("/organizer/analytics");
    render(<App />);

    expect(await screen.findByRole("heading", { name: /analytics insights/i })).toBeInTheDocument();
    expect(screen.getByRole("heading", { name: /event attendance prediction/i })).toBeInTheDocument();
    expect(screen.getByRole("heading", { name: /attendance analytics/i })).toBeInTheDocument();
    expect(screen.getByRole("heading", { name: /feedback & objective insights/i })).toBeInTheDocument();
    expect(screen.getByRole("heading", { name: /late arrival insights/i })).toBeInTheDocument();
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

    expect(events.items.map((event) => event.id)).toEqual(["event-1", "event-3", "event-5", "event-6"]);
  });

  it("isolates the second organizer account and returns empty scoped lists without errors", async () => {
    const events = await repositories.eventManagement.listEvents({ pageIndex: 0, pageSize: 20 }, organizerTwoTestContext);
    const sessions = await repositories.attendanceSessions.listAttendanceSessions({ pageIndex: 0, pageSize: 20 }, organizerTwoTestContext);
    const corrections = await repositories.correctionRequests.listCorrectionRequests({ pageIndex: 0, pageSize: 20 }, organizerTwoTestContext);
    const reports = await repositories.reports.listReports({ pageIndex: 0, pageSize: 20 }, organizerTwoTestContext);
    const predictions = await repositories.analyticsMl.listMlPredictions({ pageIndex: 0, pageSize: 20 }, organizerTwoTestContext);

    expect(events.items.map((event) => event.id)).toEqual(["event-2", "event-4"]);
    expect(sessions.items.map((session) => session.id)).toEqual(["session-6"]);
    expect(corrections.items).toEqual([]);
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
  it("opens a modal when a credential action button is clicked", async () => {
    render(
      <MemoryRouter>
        <AuthenticationMethodsPage />
      </MemoryRouter>
    );

    const user = userEvent.setup();
    await user.click(screen.getAllByRole("button", { name: /view qr/i })[0]);

    expect(await screen.findByRole("dialog", { name: /qr credential details/i })).toBeInTheDocument();
    expect(screen.getByText(/qr credential preview/i)).toBeInTheDocument();
  });

  it("renders the second organizer routes with isolated data and empty records", async () => {
    storeSession(organizerTwoSession);
    setRoute("/organizer/events");
    render(<App />);

    expect(await screen.findByRole("heading", { name: "Event Records" })).toBeInTheDocument();
    expect(await screen.findByText("Business Forum")).toBeInTheDocument();
    expect(screen.queryByText("CCS Orientation")).not.toBeInTheDocument();
  });

  it("shows event unavailable for an unauthorized event route", async () => {
    storeSession(organizerTwoSession);
    setRoute("/organizer/events/event-1");
    render(<App />);

    expect(await screen.findByRole("heading", { name: "Event unavailable" })).toBeInTheDocument();
  });

  it("shows the completed event record modal after the session summary view button is clicked", async () => {
    storeSession(organizerSession);
    setRoute("/organizer/events");
    render(<App />);
    const user = userEvent.setup();

    await user.click(screen.getByRole("button", { name: /select first row/i }));
    await user.click(screen.getByRole("button", { name: /start selected session/i }));
    await user.click(screen.getByRole("button", { name: /start session/i }));
    await user.click(screen.getByRole("button", { name: /end session/i }));
    await user.click(screen.getByRole("button", { name: /view event record/i }));

    expect(await screen.findByText(/view more/i)).toBeInTheDocument();
    expect(screen.getByText(/attendee information/i)).toBeInTheDocument();
  });

  it("shows export report actions inside the completed event modal", () => {
    render(
      <CompletedEventModal
        record={{ code: "EVT-2026-001", name: "Sample Event", category: "Career Development", venue: "Hall", date: "2026-02-10", startTime: "08:00", endTime: "12:00", predictedTurnout: "82%", objectives: ["Objective 1"], present: 10, late: 2, absent: 1, totalRegistered: 13, attendanceRate: "92%", sentiment: { positive: 80, neutral: 10, negative: 10 }, feedbackComments: [] }}
        rows={[]}
        onClose={() => {}}
      />
    );

    expect(screen.getByText(/export this event/i)).toBeInTheDocument();
    expect(screen.getByRole("button", { name: /attendance/i })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: /summary/i })).toBeInTheDocument();
  });

  it("updates a pending correction request after the organizer approves it", async () => {
    storeSession(organizerSession);
    setRoute("/organizer/corrections");
    render(<App />);
    const user = userEvent.setup();

    await user.click(await screen.findByRole("button", { name: /select first row/i }));
    await user.click(await screen.findByRole("button", { name: /approve request/i }));

    expect((await screen.findAllByText(/approved/i))[0]).toBeInTheDocument();
  });

  it("shows pending, approved, and rejected request tabs", async () => {
    storeSession(organizerSession);
    setRoute("/organizer/corrections");
    render(<App />);

    expect(await screen.findByRole("button", { name: /all requests/i })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: /pending/i })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: /approved/i })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: /rejected/i })).toBeInTheDocument();
  });

  it("validates create event participant selection", async () => {
    storeSession(organizerSession);
    setRoute("/organizer/events/create");
    render(<App />);
    const user = userEvent.setup();

    expect(await screen.findByRole("heading", { name: "Create Event" })).toBeInTheDocument();
    await user.click(await screen.findByRole("button", { name: "Publish Event" }));

    expect(await screen.findByText("Event code is required.")).toBeInTheDocument();
    expect(await screen.findByText("Select at least one participant.")).toBeInTheDocument();
  });

  it("refreshes visible organizer data after account switching", async () => {
    storeSession(organizerSession);
    setRoute("/organizer/events");
    const view = render(<App />);

    expect((await screen.findAllByText("CCS Orientation"))[0]).toBeInTheDocument();
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
  resetSimulatedRepositoryState();
  await waitFor(() => expect(true).toBe(true));
}
