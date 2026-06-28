import { afterEach, describe, expect, it, vi } from "vitest";
import { getDataSource } from "@/lib/config/dataSource";
import { getSupabaseConfig, resetSupabaseBrowserClientForTests } from "@/lib/supabase/client";
import { mapSupabaseError } from "@/lib/supabase/errors";
import { mapNfcCredential, mapProfileToUser, maskCredentialIdentifier } from "@/lib/supabase/mappers";
import { RepositoryError } from "@/services/mock/mockRepositoryUtils";

afterEach(() => {
  vi.unstubAllEnvs();
  resetSupabaseBrowserClientForTests();
});

describe("Phase 9 Supabase infrastructure", () => {
  it("defaults to mock data source and accepts explicit Supabase mode", () => {
    vi.stubEnv("VITE_DATA_SOURCE", "");
    expect(getDataSource()).toBe("mock");

    vi.stubEnv("VITE_DATA_SOURCE", "supabase");
    expect(getDataSource()).toBe("supabase");
  });

  it("validates required Supabase browser environment variables", () => {
    vi.stubEnv("VITE_SUPABASE_URL", "");
    vi.stubEnv("VITE_SUPABASE_ANON_KEY", "");
    expect(() => getSupabaseConfig()).toThrow(/Supabase configuration is missing/);

    vi.stubEnv("VITE_SUPABASE_URL", "https://example.supabase.co");
    vi.stubEnv("VITE_SUPABASE_ANON_KEY", "anon-key");
    expect(getSupabaseConfig()).toEqual({ url: "https://example.supabase.co", anonKey: "anon-key" });
  });

  it("maps Supabase profile rows into frontend user models", () => {
    const user = mapProfileToUser({
      id: "profile-1",
      role: "faculty",
      email: "faculty@plpass.test",
      display_name: "Faculty User",
      account_status: "active",
      created_at: "2026-06-28T00:00:00.000Z"
    });

    expect(user).toMatchObject({
      id: "profile-1",
      role: "faculty",
      displayName: "Faculty User",
      isActive: true
    });
  });

  it("masks NFC credential identifiers and does not expose hash tokens", () => {
    const credential = mapNfcCredential({
      id: "credential-1",
      student_id: "student-1",
      public_identifier: "PLPASS-DEMO-1001",
      hash_token: "never-expose-this",
      nfc_status: "activated",
      issued_at: "2026-06-28T00:00:00.000Z"
    });

    expect(maskCredentialIdentifier("PLPASS-DEMO-1001")).toMatch(/^PLP-\*+-001$/);
    expect(credential.nfcUid).toMatch(/^PLP-\*+-001$/);
    expect(JSON.stringify(credential)).not.toContain("never-expose-this");
  });

  it("normalizes Supabase errors into repository errors", () => {
    const mapped = mapSupabaseError({ message: "Forbidden", status: 403, name: "PostgrestError" } as Error & { status: number });

    expect(mapped).toBeInstanceOf(RepositoryError);
    expect(mapped.code).toBe("PERMISSION_DENIED");
  });
});
