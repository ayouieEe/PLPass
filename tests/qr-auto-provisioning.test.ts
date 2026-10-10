import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

const migration = readFileSync(
  "supabase/migrations/20261009100000_auto_generate_qr_credentials_for_students.sql",
  "utf8"
);

describe("automatic QR credential provisioning", () => {
  it("provisions QR at student-row creation and backfills only missing active students", () => {
    expect(migration).toContain("after insert on public.students");
    expect(migration).toContain("private.issue_initial_student_qr_credential");
    expect(migration).toContain("where p.role = 'student'");
    expect(migration).toContain("p.account_status = 'active'");
    expect(migration).toContain("s.student_status in ('enrolled', 'loa')");
    expect(migration).toContain("where q.student_id = s.id");
    expect(migration).toContain("source', 'qr_credential_backfill");
  });

  it("does not expose a client-callable provisioning function", () => {
    expect(migration).toContain("revoke all on function private.issue_initial_student_qr_credential()");
    expect(migration).not.toContain("grant execute");
  });
});
