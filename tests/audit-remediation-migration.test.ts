import fs from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";

const migrationPath = path.resolve(
  process.cwd(),
  "supabase/migrations/20260925003000_audit_remediation_indexes_and_rls.sql",
);

describe("audit remediation migration", () => {
  const sql = fs.readFileSync(migrationPath, "utf8");

  it("covers every foreign key reported by the linked advisor", () => {
    const indexes = [
      "admin_profiles_department_id_idx",
      "admin_profiles_profile_id_idx",
      "event_email_outbox_recipient_profile_id_idx",
      "event_feedback_task_objectives_objective_id_idx",
      "event_feedback_tasks_event_id_idx",
      "event_resources_created_by_idx",
      "event_sessions_superseded_by_idx",
      "events_cancelled_by_idx",
      "events_published_by_idx",
      "facial_enrollment_history_created_by_idx",
      "facial_enrollment_history_credential_request_id_idx",
      "request_email_outbox_recipient_profile_id_idx",
      "system_settings_current_semester_id_idx",
      "system_settings_updated_by_idx",
      "unverified_walkin_attendance_event_id_idx",
      "unverified_walkin_attendance_recorded_by_idx",
    ];

    for (const index of indexes) {
      expect(sql).toContain(`create index if not exists ${index}`);
    }
  });

  it("limits RLS consolidation to authenticated SELECT policies", () => {
    expect(sql).toContain("p.cmd = 'SELECT'");
    expect(sql).toContain("p.permissive = 'PERMISSIVE'");
    expect(sql).toContain("p.roles @> array['authenticated']::name[]");
    expect(sql).not.toContain("student_face_embeddings");
  });

  it("hardens only the intended privileged RPC set", () => {
    expect(sql).toContain("revoke all on function %s from public");
    expect(sql).toContain("grant execute on function %s to authenticated");
    expect(sql).toContain("'sync_offline_walkin_attendance'");
    expect(sql).toContain("'store_student_face_embedding'");
  });
});
