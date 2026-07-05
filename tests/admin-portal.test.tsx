import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, describe, expect, it } from "vitest";
import { App } from "@/app/App";
import { queryClient } from "@/app/providers/queryClient";
import { adminTestContext } from "@/mocks/testHelpers";
import { repositories } from "@/services/repositories";
import { developmentErrorToggle } from "@/services/mock/developmentErrorToggle";
import { resetMockRepositoryState } from "@/services/mock/repositories";

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

const organizerSession = JSON.stringify({
  userId: "user-organizer-1",
  role: "organizer",
  displayName: "Organizer One",
  email: "organizer.one@plpass.test",
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

describe("admin mock repository mutations", () => {
  it("adds and removes enrolled students from class rosters", async () => {
    const before = await repositories.classRosters.listClassRosters({ pageIndex: 0, pageSize: 20, classId: "class-1" }, adminTestContext);
    expect(before.total).toBe(6);

    const created = await repositories.classRosters.addStudentToClass(
      { classId: "class-1", studentId: "student-7" },
      adminTestContext
    );
    expect(created.classId).toBe("class-1");

    const afterAdd = await repositories.classRosters.listClassRosters({ pageIndex: 0, pageSize: 20, classId: "class-1" }, adminTestContext);
    expect(afterAdd.total).toBe(7);

    await repositories.classRosters.removeStudentFromClass("class-1", "student-7", adminTestContext);
    const afterRemove = await repositories.classRosters.listClassRosters({ pageIndex: 0, pageSize: 20, classId: "class-1" }, adminTestContext);
    expect(afterRemove.total).toBe(6);
  });

  it("rejects duplicate roster entries and non-enrolled students", async () => {
    await expect(
      repositories.classRosters.addStudentToClass({ classId: "class-1", studentId: "student-1" }, adminTestContext)
    ).rejects.toMatchObject({ code: "VALIDATION_ERROR" });
    await expect(
      repositories.classRosters.addStudentToClass({ classId: "class-1", studentId: "student-10" }, adminTestContext)
    ).rejects.toMatchObject({ code: "VALIDATION_ERROR" });
  });

  it("updates event, NFC credential, NFC reader, and system setting state", async () => {
    const event = await repositories.eventManagement.updateEventStatus("event-2", "approved", undefined, adminTestContext);
    expect(event.status).toBe("approved");

    const credential = await repositories.nfcCredentials.updateCredentialStatus("nfc-2", "activated", adminTestContext);
    expect(credential.status).toBe("activated");

    const reader = await repositories.nfcReaders.updateReaderStatus("reader-3", "active", adminTestContext);
    expect(reader.status).toBe("active");

    const settings = await repositories.systemSettings.updateSettings({ attendanceLateCutoffMinutes: 20 }, adminTestContext);
    expect(settings.attendanceLateCutoffMinutes).toBe(20);
  });

  it("validates event rejection reason and settings ranges", async () => {
    await expect(
      repositories.eventManagement.updateEventStatus("event-2", "rejected", "", adminTestContext)
    ).rejects.toMatchObject({ code: "VALIDATION_ERROR" });
    await expect(
      repositories.systemSettings.updateSettings({ attendanceLateCutoffMinutes: 180 }, adminTestContext)
    ).rejects.toMatchObject({ code: "VALIDATION_ERROR" });
  });
});

describe("admin portal routes", () => {
  it.each([
    ["/admin/dashboard", "Admin dashboard"],
    ["/admin/users", "User management"],
    ["/admin/academic", "Event management"],
    ["/admin/attendance", "Attendance records"],
    ["/admin/nfc-credentials", "Authentication methods"],
    ["/admin/analytics", "Analytics Insights"]
  ])("renders %s as %s", async (path, heading) => {
    storeSession(adminSession);
    setRoute(path);
    render(<App />);

    await screen.findByRole("heading", { name: heading });
  });

  it("renders the admin dashboard for admin users", async () => {
    storeSession(adminSession);
    setRoute("/admin/dashboard");
    render(<App />);

    await screen.findByRole("heading", { name: "Admin dashboard" });
    expect(await screen.findByText("Enrolled students")).toBeInTheDocument();
  });

  it("displays all required admin navigation links", async () => {
    storeSession(adminSession);
    setRoute("/admin/dashboard");
    render(<App />);

    await screen.findByRole("heading", { name: "Admin dashboard" });
    for (const label of [
      "Dashboard",
      "User Management",
      "Event Management",
      "Attendance Records",
      "Authentication Methods",
      "Analytics Insights"
    ]) {
      expect(screen.getAllByRole("link", { name: label }).length).toBeGreaterThan(0);
    }
    expect(screen.queryByRole("link", { name: "Reports" })).not.toBeInTheDocument();
  });

  it("does not expose the component preview in normal authenticated navigation", async () => {
    storeSession(adminSession);
    setRoute("/admin/dashboard");
    render(<App />);

    await screen.findByRole("heading", { name: "Admin dashboard" });
    expect(screen.queryByRole("link", { name: "Components" })).not.toBeInTheDocument();
    expect(screen.queryByRole("link", { name: "My area" })).not.toBeInTheDocument();
    expect(screen.queryByRole("link", { name: "Home" })).not.toBeInTheDocument();
  });

  it("keeps component preview development-only", async () => {
    setRoute("/components");
    render(<App />);

    await screen.findByRole("heading", { name: "PLPass Component Library" }, { timeout: 5000 });
    expect(screen.getByText(/Internal component preview only/i)).toBeInTheDocument();
    expect(screen.queryByRole("navigation", { name: "faculty navigation" })).not.toBeInTheDocument();
  });

  it("does not render authenticated sidebars on public pages", async () => {
    setRoute("/login");
    render(<App />);

    await screen.findByRole("heading", { name: /sign in to plpass/i });
    expect(screen.queryByRole("navigation", { name: /navigation/i })).not.toBeInTheDocument();
  });

  it("navigates through admin links and updates active state", async () => {
    const user = userEvent.setup();
    storeSession(adminSession);
    setRoute("/admin/dashboard");
    render(<App />);

    await screen.findByRole("heading", { name: "Admin dashboard" });
    const userManagementLink = screen.getAllByRole("link", { name: "User Management" })[0];
    await user.click(userManagementLink);
    await screen.findByRole("heading", { name: "User management" });
    expect(window.location.pathname).toBe("/admin/users");
    expect(screen.getAllByRole("link", { name: "User Management" })[0]).toHaveAttribute("aria-current", "page");
  });

  it("renders and switches all required User Management tabs", async () => {
    const user = userEvent.setup();
    storeSession(adminSession);
    setRoute("/admin/users");
    render(<App />);

    await screen.findByRole("tab", { name: "Students" });
    expect(await screen.findByText("2026-0001")).toBeInTheDocument();
    expect(screen.queryByRole("tab", { name: "Faculty" })).not.toBeInTheDocument();
    await user.click(screen.getByRole("tab", { name: "Organizers" }));
    expect(await screen.findByText("Student Affairs")).toBeInTheDocument();
  });

  it("renders Event Management approved and pending event views", async () => {
    const user = userEvent.setup();
    storeSession(adminSession);
    setRoute("/admin/academic");
    render(<App />);

    expect(await screen.findByRole("tab", { name: "Approved Events" })).toBeInTheDocument();
    expect(await screen.findByText("CCS Orientation")).toBeInTheDocument();
    await user.click(screen.getByRole("tab", { name: "Pending Events" }));
    expect(await screen.findByRole("heading", { name: "No pending events found" })).toBeInTheDocument();
    expect(screen.queryByText("Business Forum")).not.toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "Approve" })).not.toBeInTheDocument();
  });

  it("renders event-only Attendance Records", async () => {
    storeSession(adminSession);
    setRoute("/admin/attendance");
    render(<App />);

    await screen.findByRole("heading", { name: "Attendance records" });
    expect(screen.queryByRole("tab", { name: "Class Sessions" })).not.toBeInTheDocument();
    expect(await screen.findByText("CCS Orientation Attendance")).toBeInTheDocument();
  });

  it("renders Authentication Methods tabs and deferred placeholders", async () => {
    const user = userEvent.setup();
    storeSession(adminSession);
    setRoute("/admin/nfc-credentials");
    render(<App />);

    await screen.findByRole("heading", { name: "Authentication methods" });
    expect(screen.getByRole("tab", { name: "NFC Credentials" })).toBeInTheDocument();
    expect((await screen.findAllByText(/PLP-\*+-001/i)).length).toBeGreaterThan(0);
    await user.click(screen.getByRole("tab", { name: "QR Credentials" }));
    expect(screen.getByText("QR attendance fallback will be implemented in Phase 11.")).toBeInTheDocument();
    await user.click(screen.getByRole("tab", { name: "Facial Recognition" }));
    expect(screen.getByText("Facial Recognition is outside the PLPass MVP and will not be implemented in the current version.")).toBeInTheDocument();
  });

  it("renders required Analytics Insights sections", async () => {
    storeSession(adminSession);
    setRoute("/admin/analytics");
    render(<App />);

    await screen.findByRole("heading", { name: "Analytics Insights" });
    expect(screen.getByRole("tab", { name: "Event Attendance Prediction" })).toBeInTheDocument();
    expect(screen.getByRole("tab", { name: "Feedback and Objective Insights" })).toBeInTheDocument();
    expect(screen.queryByText("Attendance Anomaly Detection")).not.toBeInTheDocument();
    expect(screen.queryByText("Participation Clustering")).not.toBeInTheDocument();
    expect(screen.getAllByText("Review-only").length).toBeGreaterThan(0);
  });

  it("denies student access to admin routes", async () => {
    storeSession(studentSession);
    setRoute("/admin/dashboard");
    render(<App />);

    await screen.findByRole("heading", { name: "Access denied" });
  });

  it.each([
    [studentSession, "/student/dashboard", "Student dashboard"],
    [organizerSession, "/organizer/dashboard", "Organizer dashboard"]
  ])("keeps admin navigation hidden from non-admin users", async (session, path, heading) => {
    storeSession(session);
    setRoute(path);
    render(<App />);

    await screen.findByRole("heading", { name: heading });
    expect(screen.queryByRole("navigation", { name: "admin navigation" })).not.toBeInTheDocument();
    expect(screen.queryByRole("link", { name: "User Management" })).not.toBeInTheDocument();
  });

  it.each([
    [studentSession, "/student/dashboard", "student navigation", "Attendance Records"],
    [organizerSession, "/organizer/dashboard", "organizer navigation", "Events"]
  ])("renders only the signed-in role navigation", async (session, path, navigationName, expectedLink) => {
    storeSession(session);
    setRoute(path);
    render(<App />);

    expect(await screen.findByRole("navigation", { name: navigationName })).toBeInTheDocument();
    expect(screen.getAllByRole("link", { name: expectedLink }).length).toBeGreaterThan(0);
    expect(screen.queryByRole("navigation", { name: "admin navigation" })).not.toBeInTheDocument();
  });

  it("keeps table-level XLSX and PDF export controls on admin records", async () => {
    storeSession(adminSession);
    setRoute("/admin/attendance");
    render(<App />);

    await screen.findByRole("heading", { name: "Attendance records" });
    expect(screen.getByRole("button", { name: "XLSX" })).toBeDisabled();
    expect(screen.getByRole("button", { name: "PDF" })).toBeDisabled();
    expect(screen.queryByRole("button", { name: "CSV" })).not.toBeInTheDocument();
  });

  it("filters audit logs with no-results state", async () => {
    const user = userEvent.setup();
    storeSession(adminSession);
    setRoute("/admin/audit-logs");
    render(<App />);

    await screen.findByText("user.invited");
    await user.type(screen.getByPlaceholderText("Filter audit logs"), "missing-audit-action");
    await waitFor(() => expect(screen.getByRole("heading", { name: "No audit logs found" })).toBeInTheDocument());
  });
});
