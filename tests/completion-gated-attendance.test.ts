import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";
import { buildStudentEventWorkflow, getStudentEventMetrics, type StudentEventRecord } from "@/features/student/studentExperience";
import type { AttendanceSession, Event } from "@/types/domain";

describe("completion-gated event attendance", () => {
  it("requires late reason only after both Time In and Time Out, then unlocks feedback", () => {
    const now = Date.now();
    const event = {
      id: "late-event", code: "LATE", title: "Late event", category: "Orientation",
      startsAt: new Date(now - 60_000).toISOString(), endsAt: new Date(now + 60 * 60_000).toISOString(), status: "active"
    } as unknown as Event;
    const session = {
      id: "late-session", eventId: event.id, status: "active",
      startsAt: new Date(now - 60_000).toISOString(), endsAt: new Date(now + 60 * 60_000).toISOString(),
      lateCutoffAt: new Date(now - 30_000).toISOString()
    } as AttendanceSession;
    const timeIn = new Date(now - 20_000).toISOString();
    const timeOut = new Date(now - 10_000).toISOString();
    const record = { id: "late-record", eventId: event.id, eventCode: event.code, eventName: event.title,
      category: event.category, venue: "Hall", startsAt: event.startsAt, status: "absent", method: "QR",
      recordedAt: timeIn, timeIn } as StudentEventRecord;

    expect(buildStudentEventWorkflow({ event, session, record }).state).toBe("Pending Time Out");
    const checkedOut = { ...record, timeOut };
    expect(buildStudentEventWorkflow({ event, session, record: checkedOut }).state).toBe("Late Reason Required");
    expect(buildStudentEventWorkflow({ event, session, record: { ...checkedOut,
      lateReasonSubmittedAt: new Date(now - 5_000).toISOString() } }).state).toBe("Feedback Available");
  });

  it("does not count provisional check-ins as final student outcomes", () => {
    const record = (id: string, status: StudentEventRecord["status"], finalized: boolean): StudentEventRecord => ({
      id,
      eventId: `event-${id}`,
      eventCode: `EVT-${id}`,
      eventName: "Orientation",
      category: "Orientation",
      venue: "Hall",
      startsAt: "2026-09-21T08:00:00.000Z",
      status,
      method: "QR",
      recordedAt: "2026-09-21T08:00:00.000Z",
      finalized
    });

    const metrics = getStudentEventMetrics([
      record("in-progress", "absent", false),
      record("final-present", "present", true),
      record("final-absent", "absent", true)
    ]);

    expect(metrics).toMatchObject({ totalCount: 2, presentCount: 1, lateCount: 0, absentCount: 1, attendedCount: 1 });
  });

  it("installs database constraints and guards for ordered late reason, feedback, and three outcomes", () => {
    const migration = readFileSync(
      resolve(process.cwd(), "supabase/migrations/20260921091549_completion_gated_attendance_flow.sql"),
      "utf8"
    );

    expect(migration).toContain("check (attendance_status in ('present', 'late', 'absent'))");
    expect(migration).toContain("check (requested_status in ('present', 'late', 'absent'))");
    expect(migration).toContain("new.late_reason_submitted_at <= new.time_out");
    expect(migration).toContain("v_now <= v_record.time_out");
    expect(migration).toContain("Submit your late reason after Time Out and before event feedback.");
    expect(migration).not.toContain("before Time In");
    expect(migration).toContain("Rate every assigned event objective before submitting feedback.");
    expect(migration).toContain("interval '24 hours'");
    expect(migration).toContain("task_status = 'expired'");
    expect(migration).toContain("v_record.time_out is null and p_time_out is not null");
    expect(migration).toContain("v_session.actual_end + interval '24 hours' <= now()");
  });

  it("validates offline session ownership before replay lookup and applies a later checkout", () => {
    const migration = readFileSync(
      resolve(process.cwd(), "supabase/migrations/20260921124135_harden_offline_attendance_sync_idempotency.sql"),
      "utf8"
    );
    const sessionValidation = migration.indexOf("where es.id = p_session_id and e.organizer_id = private.current_organizer_id()");
    const participantValidation = migration.indexOf("where ep.event_id = v_session.event_id and ep.student_id = p_student_id");
    const replayLookup = migration.indexOf("where local_attendance_uuid = p_local_attendance_uuid for update");

    expect(sessionValidation).toBeGreaterThan(-1);
    expect(participantValidation).toBeGreaterThan(sessionValidation);
    expect(replayLookup).toBeGreaterThan(participantValidation);
    expect(migration).toContain("v_record.event_session_id is distinct from p_session_id");
    expect(migration).toContain("v_record.student_id is distinct from p_student_id");
    expect(migration).toContain("if v_record.time_out is null and p_time_out is not null then");
    expect(migration).toContain("v_record.time_out is distinct from p_time_out");
    expect(migration).toContain("interval '1 minute'");
    expect(migration).toContain("revoke all on function public.sync_offline_event_attendance(");
    expect(migration).toContain("to authenticated");
  });
});
