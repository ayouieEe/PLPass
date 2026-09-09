import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { App } from "@/app/App";
import { queryClient } from "@/app/providers/queryClient";
import { resetSimulatedRepositoryState } from "@/test-support/repositories";
import {
  formatAuditAction,
  formatTargetType,
  getAuditTargetInfo,
  filterAuditLogs
} from "../utils/auditLogUtils";
import type { AuditLog } from "@/types/domain";

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

beforeEach(() => {
  window.localStorage.clear();
  queryClient.clear();
  resetSimulatedRepositoryState();
});

afterEach(() => {
  window.localStorage.clear();
  queryClient.clear();
  resetSimulatedRepositoryState();
  setRoute("/");
});

describe("auditLogUtils helper unit tests", () => {
  it("formats technical action identifiers into readable text", () => {
    expect(formatAuditAction("Credential.qr Issued")).toBe("QR credential issued");
    expect(formatAuditAction("credential.qr.issued")).toBe("QR credential issued");
    expect(formatAuditAction("credential.facial.enrolled")).toBe("Facial credential enrolled");
    expect(formatAuditAction("event.approved")).toBe("Event approved");
    expect(formatAuditAction("session.completed")).toBe("Session completed");
    expect(formatAuditAction("user.invited")).toBe("User invited");
    expect(formatAuditAction("correction_request.submitted")).toBe("Correction request submitted");
  });

  it("formats target entity type badges", () => {
    expect(formatTargetType("qr_credential")).toBe("QR Credential");
    expect(formatTargetType("facial_profile")).toBe("Facial Credential");
    expect(formatTargetType("event")).toBe("Event");
    expect(formatTargetType("attendance_session")).toBe("Attendance Session");
    expect(formatTargetType("correction_request")).toBe("Correction Request");
    expect(formatTargetType("user")).toBe("User");
  });

  it("resolves target entity name from metadata and lookups", () => {
    const logWithMetadata: AuditLog = {
      id: "log-1",
      actorUserId: "user-organizer-1",
      action: "Credential.qr Issued",
      targetType: "qr_credential",
      targetId: "student-1",
      timestamp: "2026-06-26T08:00:00.000Z",
      metadata: { studentName: "Student 01", studentNumber: "2026-0001" }
    };

    const targetInfo = getAuditTargetInfo(logWithMetadata);
    expect(targetInfo.name).toBe("Student 01 (2026-0001)");
    expect(targetInfo.badge).toBe("QR Credential");
  });

  it("filters audit logs by action category", () => {
    const logs: AuditLog[] = [
      { id: "1", actorUserId: "user-1", action: "credential.qr.issued", targetType: "qr_credential", targetId: "s1", timestamp: "2026-06-26T08:00:00.000Z", metadata: {} },
      { id: "2", actorUserId: "user-1", action: "event.approved", targetType: "event", targetId: "e1", timestamp: "2026-06-26T08:00:00.000Z", metadata: {} },
      { id: "3", actorUserId: "user-2", action: "user.invited", targetType: "user", targetId: "u1", timestamp: "2026-06-26T08:00:00.000Z", metadata: {} }
    ];

    const credentialLogs = filterAuditLogs(logs, { actionCategory: "credentials" });
    expect(credentialLogs).toHaveLength(1);
    expect(credentialLogs[0].id).toBe("1");

    const eventLogs = filterAuditLogs(logs, { actionCategory: "events" });
    expect(eventLogs).toHaveLength(1);
    expect(eventLogs[0].id).toBe("2");
  });
});

describe("OrganizerAuditLogsPage UI component tests", () => {
  it("renders the audit logs page for organizer with formatted actions and target names", async () => {
    storeSession(organizerSession);
    setRoute("/organizer/audit-logs");
    render(<App />);

    expect(await screen.findByRole("heading", { name: /^audit logs$/i })).toBeInTheDocument();
    
    // Check formatted readable actions
    expect(await screen.findByText("QR credential issued")).toBeInTheDocument();
    expect(screen.getByText("Facial credential enrolled")).toBeInTheDocument();
    expect(screen.getByText("Event approved")).toBeInTheDocument();

    // Check affected target names (student names and event titles)
    expect(screen.getByText(/Student 01 \(2026-0001\)/i)).toBeInTheDocument();
    expect(screen.getByText("CCS Orientation")).toBeInTheDocument();
  });

  it("filters audit logs using action type and target dropdowns", async () => {
    storeSession(organizerSession);
    setRoute("/organizer/audit-logs");
    render(<App />);
    const user = userEvent.setup();

    expect(await screen.findByRole("heading", { name: /^audit logs$/i })).toBeInTheDocument();

    const actionSelect = screen.getByLabelText(/action type/i);
    await user.selectOptions(actionSelect, "credentials");

    await waitFor(() => {
      expect(screen.getByText("QR credential issued")).toBeInTheDocument();
      expect(screen.queryByText("Event approved")).not.toBeInTheDocument();
    });
  });

  it("opens log details modal when 'View details' button is clicked", async () => {
    storeSession(organizerSession);
    setRoute("/organizer/audit-logs");
    render(<App />);
    const user = userEvent.setup();

    expect(await screen.findByRole("heading", { name: /^audit logs$/i })).toBeInTheDocument();

    const viewDetailsButtons = await screen.findAllByRole("button", { name: /view details/i });
    expect(viewDetailsButtons.length).toBeGreaterThan(0);

    await user.click(viewDetailsButtons[0]);

    // Check modal opens
    expect(await screen.findByRole("dialog", { name: /audit log details/i })).toBeInTheDocument();
    expect(screen.getByText(/^performer$/i)).toBeInTheDocument();
    expect(screen.getByText(/^affected target$/i)).toBeInTheDocument();
    expect(screen.getByText(/log details & metadata/i)).toBeInTheDocument();
  });
});
