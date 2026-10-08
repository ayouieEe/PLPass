import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

const sql = readFileSync(resolve(process.cwd(), "supabase/migrations/20261008100000_remove_facial_recognition.sql"), "utf8");

describe("facial decommission migration", () => {
  it("fails closed before destructive changes when any biometric dependency remains", () => {
    expect(sql).toContain("raise exception 'Facial decommission blocked");
    expect(sql).toContain("verification_method = 'facial'");
    expect(sql).toContain("bucket_id = 'facial-enrollments'");
    expect(sql.indexOf("raise exception")).toBeLessThan(sql.indexOf("drop table if exists public.facial_profiles"));
  });

  it("preserves QR/manual attendance and removes facial schema paths only after the guard", () => {
    expect(sql).toContain("verification_method in ('qr', 'manual')");
    expect(sql).toContain("credential_type in ('qr')");
    expect(sql).toContain("drop column if exists facial_profile_id");
    expect(sql).toContain("delete from storage.buckets where id = 'facial-enrollments'");
  });
});
