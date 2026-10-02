import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

describe("event finalization summary", () => {
  it("keeps attendance with pending feedback out of the final outcome counts", () => {
    const source = readFileSync(
      resolve(process.cwd(), "src/features/organizer/pages/EventManagementPage.tsx"),
      "utf8"
    );
    const endSessionBody = source.slice(source.indexOf("const endSession = useCallback"), source.indexOf("async function openTimeOut"));

    expect(endSessionBody).toContain("activeRows.map((row) => ({");
    expect(endSessionBody).toContain("isFinalized: row.isFinalized");
    expect(endSessionBody).toContain("checkOutAt: row.checkOutAt");
    expect(endSessionBody).not.toContain('.from("attendance_records")');
    expect(endSessionBody).not.toContain("completeEventMutation");
    expect(endSessionBody).toContain("endSessionSilentlyMutation.mutateAsync");
  });

  it("bounds end requests and gives the legacy attendance route the local fallback", () => {
    const queries = readFileSync(resolve(process.cwd(), "src/hooks/useRepositoryQueries.ts"), "utf8");
    const attendancePage = readFileSync(resolve(process.cwd(), "src/features/organizer/pages/EventAttendancePage.tsx"), "utf8");
    expect(queries).toContain("attendanceMutationDeadlineMs = 30_000");
    expect(queries).toContain("Ending the attendance session took too long");
    expect(attendancePage).toContain("endOfflineEvent(event.id, activeSession.id, authSession.userId, reason)");
    expect(attendancePage).toContain("isConnectivityFailure(error) && canUsePreparedCache");
  });

  it("bounds start and capture requests and keeps server end replayable", () => {
    const queries = readFileSync(resolve(process.cwd(), "src/hooks/useRepositoryQueries.ts"), "utf8");
    expect(queries).toContain("Starting the attendance session took too long");
    expect(queries).toContain("Recording attendance took too long");
    const endMigration = readFileSync(resolve(process.cwd(), "supabase/migrations/20261003090000_idempotent_event_attendance_end.sql"), "utf8");
    expect(endMigration).toContain("if v_session.session_status = 'completed' then");
    expect(endMigration).toContain("return v_session;");
    expect(endMigration).toContain("The session was already ended with a different reason.");
  });
});
