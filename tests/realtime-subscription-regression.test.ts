import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

const provider = readFileSync(resolve(process.cwd(), "src/app/providers/DevelopmentSessionProvider.tsx"), "utf8");
const attendance = readFileSync(resolve(process.cwd(), "src/features/organizer/pages/EventAttendancePage.tsx"), "utf8");
const correctionRequests = readFileSync(resolve(process.cwd(), "src/features/organizer/pages/OrganizerCorrectionRequestsPage.tsx"), "utf8");

describe("Realtime subscription boundaries", () => {
  it("keeps the global channel limited to filtered notifications", () => {
    expect(provider).toContain("plpass-notifications-");
    expect(provider).toContain("table: \"notifications\"");
    expect(provider).toContain("filter: `recipient_id=eq.${session.userId}`");
    expect(provider).not.toContain("tableQueryKeys");
    expect(provider).not.toContain('event: "*"');
  });

  it("scopes live attendance subscriptions to the active session", () => {
    expect(attendance).toContain("plpass-attendance-${sessionId}-");
    expect(attendance).toContain("filter: `event_session_id=eq.${sessionId}`");
    expect(attendance).not.toContain('table: "attendance_requests"');
    expect(attendance).not.toContain('table: "audit_logs"');
  });

  it("keeps attendance-request updates on the request-review screen", () => {
    expect(correctionRequests).toContain("plpass-correction-requests-");
    expect(correctionRequests).toContain('table: "attendance_requests"');
    expect(correctionRequests).toContain('queryKey: ["correctionRequests"]');
    expect(correctionRequests).toContain("setTimeout(() => {");
    expect(correctionRequests).toContain("invalidateRequests();");
  });
});
