import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

const migrationPath = resolve(
  process.cwd(),
  "supabase/migrations/20260825050601_harden_biometric_and_event_email_functions.sql"
);
const migration = readFileSync(migrationPath, "utf8");
const workflowMigration = readFileSync(
  resolve(process.cwd(), "supabase/migrations/20260814081157_synchronize_cross_role_workflows.sql"),
  "utf8"
);
const descriptorMigration = readFileSync(
  resolve(process.cwd(), "supabase/migrations/20260818043820_add_browser_face_descriptors.sql"),
  "utf8"
);
const lateReasonMigration = readFileSync(
  resolve(process.cwd(), "supabase/migrations/20260807121424_support_student_late_reason_submission.sql"),
  "utf8"
);

describe("Phase 5 privileged database hardening", () => {
  it("scopes facial descriptor access to an owned ongoing session and participant", () => {
    expect(migration).toContain("p_event_session_id uuid");
    expect(migration).toContain("event_session.session_status = 'ongoing'");
    expect(migration).toContain("organizer.profile_id = v_actor");
    expect(migration).toContain("participant.participant_status <> 'removed'");
    expect(migration).toContain("facial_descriptor.accessed");
  });

  it("uses deterministic search paths and validates client audit payloads", () => {
    expect(migration).toContain("alter function private.queue_attendance_request_progress_email() set search_path = ''");
    expect(migration).toContain("alter function private.queue_credential_request_progress_email() set search_path = ''");
    expect(migration).toMatch(/public\.log_client_action[\s\S]+set search_path = ''/);
    expect(migration).toContain("pg_column_size(p_metadata) > 16384");
  });

  it("removes public execution and mutable search paths from event email functions", () => {
    expect(migration).toContain("alter function private.queue_event_student_email(uuid, uuid, text, timestamptz) set search_path = ''");
    expect(migration).toContain("alter function private.queue_event_email_after_reschedule() set search_path = ''");
    expect(migration).toContain("revoke all on function private.queue_event_student_emails_for_event(uuid, text, timestamptz) from public, anon, authenticated");
  });

  it("denies function execution by default in exposed and private application schemas", () => {
    expect(migration).toMatch(/alter default privileges for role postgres in schema public\s+revoke execute on functions from public, anon, authenticated, service_role/);
    expect(migration).toMatch(/alter default privileges for role postgres in schema private\s+revoke execute on functions from public, anon, authenticated, service_role/);
  });

  it("keeps organizer RPCs behind active-organizer authorization and explicit grants", () => {
    for (const signature of [
      "review_attendance_request(uuid, text, text)",
      "review_credential_request(uuid, text, text)",
      "set_student_credential_status(uuid, text, text)",
      "issue_qr_credential(uuid, timestamptz)",
    ]) {
      expect(workflowMigration).toContain(`revoke all on function public.${signature} from public, anon`);
      expect(workflowMigration).toContain(`grant execute on function public.${signature} to authenticated`);
    }
    expect(workflowMigration.match(/if not private\.is_active_organizer\(\) then/g)).toHaveLength(4);
  });

  it("keeps student RPCs self-scoped and explicitly unavailable to anonymous callers", () => {
    expect(workflowMigration).toContain("where profile_id = v_actor and student_status = 'enrolled'");
    expect(workflowMigration).toContain("revoke all on function public.complete_facial_enrollment(text) from public, anon");
    expect(descriptorMigration).toContain("where profile_id = auth.uid() and student_status = 'enrolled'");
    expect(descriptorMigration).toContain("revoke all on function public.store_facial_descriptor(jsonb) from public, anon");
    expect(lateReasonMigration).toContain("and student_id = v_student_id");
    expect(lateReasonMigration).toContain("revoke all on function public.submit_late_reason(uuid, text) from public, anon");
  });
});
