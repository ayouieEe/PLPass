import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { App } from "@/app/App";
import { queryClient } from "@/app/providers/queryClient";
import { CompletedEventModal } from "@/features/organizer/pages/EventRecordsPage";
import { organizerTestContext, organizerTwoTestContext, studentTestContext } from "@/test-support/testHelpers";
import { developmentErrorToggle } from "@/test-support/developmentErrorToggle";
import { resetSimulatedRepositoryState } from "@/test-support/repositories";
import { repositories } from "@/services/repositories";

vi.mock("@/components/data-display/PLPassDataGrid", () => ({
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  PLPassDataGrid: ({ toolbarActions, data, columns, onSelectionChange, onRowClick }: any) => (
    <div>
      {toolbarActions}
      { }
      <button type="button" onClick={() => onSelectionChange?.(data?.slice(0, 1) ?? [])}>Select first row</button>
      <button type="button" onClick={() => onRowClick?.(data?.[0])}>Open first row</button>
      <div data-testid="mock-grid-rows">
        {/* eslint-disable-next-line @typescript-eslint/no-explicit-any */}
        {(data ?? []).map((row: any) => (
          <div key={row.id ?? row.requestId ?? row.studentId ?? row.code}>
            {row.name ?? row.studentName ?? row.title ?? row.requestId ?? row.code ?? row.id}
            {/* eslint-disable-next-line @typescript-eslint/no-explicit-any */}
            {columns?.find((c: any) => c.colId === "actions")?.cellRenderer?.({ data: row })}
          </div>
        ))}
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

const adminSession = JSON.stringify({
  userId: "user-admin-1",
  role: "admin",
  displayName: "Admin One",
  email: "admin.one@plpass.test",
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

    expect(await screen.findByRole("heading", { name: /^Dashboard$/i })).toBeInTheDocument();
    expect(screen.getByRole("navigation", { name: "organizer navigation" })).toBeInTheDocument();
    expect(screen.queryByRole("navigation", { name: "admin navigation" })).not.toBeInTheDocument();
  });

  it("renders the analytics insights workspace with detailed sections", async () => {
    storeSession(organizerSession);
    setRoute("/organizer/analytics");
    render(<App />);

    expect(await screen.findByRole("heading", { name: /analytics insights/i })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: /turnout forecast/i })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: /attendance trends/i })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: /feedback & sentiment/i })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: /late arrival patterns/i })).toBeInTheDocument();
  });

  it("filters analytics data by date range preset and shows empty states when no data matches", async () => {
    storeSession(organizerSession);
    setRoute("/organizer/analytics");
    render(<App />);

    expect(await screen.findByRole("heading", { name: /analytics insights/i })).toBeInTheDocument();

    const user = userEvent.setup();
    const dateRangeSelect = screen.getByRole("combobox", { name: /date range filter/i });
    expect(dateRangeSelect).toBeInTheDocument();

    await user.selectOptions(dateRangeSelect, "custom");
    const startDateInput = screen.getByLabelText(/start date filter/i);
    const endDateInput = screen.getByLabelText(/end date filter/i);

    await user.type(startDateInput, "2020-01-01");
    await user.type(endDateInput, "2020-01-30");

    const feedbackTab = screen.getByRole("button", { name: /feedback & sentiment/i });
    await user.click(feedbackTab);

    expect((await screen.findAllByText(/no feedback data yet/i)).length).toBeGreaterThan(0);
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
    expect(sessions.items.map((session) => session.id)).toEqual(["session-4", "session-6"]);
    expect(corrections.items).toEqual([]);
    expect(corrections.items).toEqual([]);
    expect(reports.items).toEqual([]);
    expect(predictions.items).toEqual([]);
  });

  it("prevents an organizer from reading another organizer event or session", async () => {
    await expect(repositories.eventManagement.getEventById("event-1", organizerTwoTestContext)).rejects.toMatchObject({
      code: "PERMISSION_DENIED"
    });
    await expect(repositories.attendanceSessions.getAttendanceSessionById("session-1", organizerTwoTestContext)).rejects.toMatchObject({
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
          participantStudentIds: ["student-1"],
          priorityLevel: "Flexible"
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
        participantStudentIds: ["student-1", "student-2"],
        objectives: [
          "Build professional confidence",
          "Improve teamwork skills",
          "Practice career readiness",
          "Strengthen communication with employers",
          "Apply industry-specific knowledge"
        ],
        priorityLevel: "Flexible"
      },
      organizerTestContext
    );
    const participants = await repositories.eventManagement.listEventParticipants(
      created.id,
      { pageIndex: 0, pageSize: 20 },
      organizerTestContext
    );
    const objectives = await repositories.eventFeedback.listEventObjectives(created.id, organizerTestContext);

    expect(created.status).toBe("pending");
    expect(participants.total).toBe(2);
    expect(objectives.map((objective) => objective.text)).toEqual([
      "Build professional confidence",
      "Improve teamwork skills",
      "Practice career readiness",
      "Strengthen communication with employers",
      "Apply industry-specific knowledge"
    ]);
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
        participantStudentIds: ["student-1"],
        priorityLevel: "Flexible"
      },
      studentTestContext
    )).rejects.toMatchObject({ code: "PERMISSION_DENIED" });
  });
});

describe("organizer UI flows", () => {
  it("renders the organizer reports route", async () => {
    storeSession(organizerSession);
    setRoute("/organizer/reports");
    render(<App />);

    expect(await screen.findByRole("heading", { name: "Reports" })).toBeInTheDocument();
    expect(screen.getAllByText("Review reports generated for your events.").length).toBeGreaterThan(0);
  });

  it("renders admin reports and catalogs as functional workspaces", async () => {
    storeSession(adminSession);
    setRoute("/admin/reports");
    const reportsView = render(<App />);

    expect(await screen.findByRole("heading", { name: "Reports" })).toBeInTheDocument();
    expect(screen.getAllByText("Review generated reports across all scopes.").length).toBeGreaterThan(0);

    reportsView.unmount();
    setRoute("/admin/catalogs");
    queryClient.clear();
    const view = render(<App />);
    expect(await screen.findByRole("heading", { name: "Settings" })).toBeInTheDocument();
    expect(screen.getByText("Manage catalogs")).toBeInTheDocument();
    view.unmount();
  });

  it("renders authentication methods from the admin workspace", async () => {
    storeSession(adminSession);
    setRoute("/admin/credentials");
    render(<App />);

    expect(await screen.findByRole("heading", { name: "Authentication Methods" })).toBeInTheDocument();
    expect(screen.getByRole("link", { name: "Authentication Methods" })).toHaveAttribute("href", "/admin/credentials");
  });

  it("keeps organizer settings focused on personal workspace controls", async () => {
    storeSession(organizerSession);
    setRoute("/organizer/settings");
    render(<App />);

    expect(await screen.findByRole("heading", { name: /^Settings$/ })).toBeInTheDocument();
    expect(screen.getByText("College branding")).toBeInTheDocument();
    expect(screen.queryByText("Academic structure")).not.toBeInTheDocument();
    expect(screen.queryByText("Manage the configuration that controls PLPass operations.")).not.toBeInTheDocument();
  });

  it("keeps global configuration in the admin settings workspace", async () => {
    storeSession(adminSession);
    setRoute("/admin/settings");
    render(<App />);

    expect(await screen.findByRole("heading", { name: /^Settings$/ })).toBeInTheDocument();
    expect(screen.getByText("Academic structure")).toBeInTheDocument();
    expect(screen.getByText("Manage the configuration that controls PLPass operations.")).toBeInTheDocument();
  });

  it("exposes safe account management controls without sensitive secret access", async () => {
    storeSession(adminSession);
    setRoute("/admin/users");
    render(<App />);

    expect(await screen.findByRole("heading", { name: "User Management" })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Add Student" })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Bulk Add" })).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: /delete user|show password|view password/i })).not.toBeInTheDocument();
    expect(screen.queryByText(/raw biometric data/i)).not.toBeInTheDocument();
  });

  it("shows admin system health checks and recoverable failure states", async () => {
    storeSession(adminSession);
    setRoute("/admin/system-health");
    render(<App />);

    expect(await screen.findByRole("heading", { name: "System Health" })).toBeInTheDocument();
    expect(screen.getByText("Supabase connectivity")).toBeInTheDocument();
    expect(screen.getByText("Dean Summary report generation failed.")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Retry" })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Recover session" })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Run consistency check" })).toBeInTheDocument();
  });

  it("requires an action reason before an admin recovery operation", async () => {
    storeSession(adminSession);
    setRoute("/admin/system-health");
    render(<App />);
    const user = userEvent.setup();

    await user.click(await screen.findByRole("button", { name: "Retry" }));
    expect(screen.getByRole("alert")).toHaveTextContent("Enter a reason");
  });

  it("denies system health tools to organizers", async () => {
    storeSession(organizerSession);
    setRoute("/admin/system-health");
    render(<App />);

    expect(await screen.findByRole("heading", { name: "Access denied" })).toBeInTheDocument();
  });

  it("keeps the admin event list read-only", async () => {
    storeSession(adminSession);
    setRoute("/admin/events");
    render(<App />);

    expect(await screen.findByRole("heading", { name: /^Events$/ })).toBeInTheDocument();
    expect(screen.queryByRole("link", { name: /Create event/i })).not.toBeInTheDocument();
    expect(screen.queryByRole("button", { name: /Prepare offline|Refresh offline|Retry offline/i })).not.toBeInTheDocument();
    expect(screen.getByText("View institution-wide events, owners, schedules, and operational status.")).toBeInTheDocument();
  });

  it("hides normal event mutations from an admin event detail view", async () => {
    storeSession(adminSession);
    setRoute("/admin/events/event-1");
    render(<App />);

    expect(await screen.findByText("Event Resources")).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "Start session" })).not.toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "Reschedule event" })).not.toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "Cancel event" })).not.toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "Add participant" })).not.toBeInTheDocument();
    expect(screen.getByText("Administrators can view event resources but cannot modify them from the event workspace.")).toBeInTheDocument();
  });

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

  it("shows export report actions inside the completed event modal", async () => {
    render(
      <CompletedEventModal
        record={{ code: "EVT-2026-001", name: "Sample Event", category: "Career Development", venue: "Hall", date: "2026-02-10", startTime: "08:00", endTime: "12:00", predictedTurnout: "82%", objectives: ["Objective 1"], present: 10, late: 2, absent: 1, totalRegistered: 13, attendanceRate: "92%", sentiment: { positive: 80, neutral: 10, negative: 10 }, feedbackComments: [] }}
        rows={[]}
        onClose={() => {}}
      />
    );

    const user = userEvent.setup();
    await user.click(screen.getByRole("button", { name: "Export" }));
    expect(screen.getByText(/export this event/i)).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Attendance XLSX" })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Attendance PDF" })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Event summary XLSX" })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Event summary PDF" })).toBeInTheDocument();
  });

  it("updates a pending correction request after the organizer approves it", async () => {
    storeSession(organizerSession);
    setRoute("/organizer/corrections");
    render(<App />);
    const user = userEvent.setup();

    await user.click(await screen.findByRole("button", { name: "Open first row" }));
    await user.click(await screen.findByRole("button", { name: /approve request/i }));

    expect((await screen.findAllByText(/approved/i))[0]).toBeInTheDocument();
  });

  it("shows status and request-type filters for correction requests", async () => {
    storeSession(organizerSession);
    setRoute("/organizer/corrections");
    render(<App />);

    expect(await screen.findByRole("combobox", { name: "Status" })).toBeInTheDocument();
    expect(screen.getByRole("combobox", { name: "Request type" })).toBeInTheDocument();
    expect(screen.getByRole("option", { name: /All statuses/ })).toBeInTheDocument();
    expect(screen.getByRole("option", { name: /Pending/ })).toBeInTheDocument();
    expect(screen.getByRole("option", { name: /Approved/ })).toBeInTheDocument();
    expect(screen.getByRole("option", { name: /Rejected/ })).toBeInTheDocument();
  });

  it("validates create event details before advancing to participant selection", async () => {
    storeSession(organizerSession);
    setRoute("/organizer/events/create");
    render(<App />);
    const user = userEvent.setup();

    expect(await screen.findByRole("heading", { name: "Event Details" })).toBeInTheDocument();
    await user.click(await screen.findByRole("button", { name: "Continue to participants" }));

    expect(await screen.findByText("Event title is required")).toBeInTheDocument();
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
