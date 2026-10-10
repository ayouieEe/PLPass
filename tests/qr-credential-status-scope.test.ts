import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

const read = (path: string) => readFileSync(resolve(process.cwd(), path), "utf8");

describe("QR credential status scope after facial removal", () => {
  it("restores shared non-facial authorization without reintroducing facial status", () => {
    const migration = read("supabase/migrations/20261009110000_repair_qr_credential_status_scope.sql");

    expect(migration).toContain("private.can_manage_student_credentials(p_student_id)");
    expect(migration).toContain("p_credential_type <> 'qr'");
    expect(migration).toContain("credential.status_changed");
    expect(migration).not.toContain("facial_profiles");
    expect(migration).not.toContain("p_credential_type = 'facial'");
  });
});
