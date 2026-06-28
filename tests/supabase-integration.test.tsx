import { afterEach, describe, expect, it, vi } from "vitest";
import {
  resolveSupabaseSessionUser,
  shouldSignOutAfterAuthFailure,
  toSafeAuthErrorMessage,
  type SupabaseSessionReader
} from "@/app/providers/supabaseSessionResolver";
import { getDataSource } from "@/lib/config/dataSource";
import { getSupabaseConfig, resetSupabaseBrowserClientForTests } from "@/lib/supabase/client";
import { mapSupabaseError } from "@/lib/supabase/errors";
import { mapNfcCredential, mapProfileToUser, maskCredentialIdentifier } from "@/lib/supabase/mappers";
import { RepositoryError } from "@/services/mock/mockRepositoryUtils";
import type { UserRole } from "@/types/roles";

type RoleReadName = "profiles" | "students" | "faculty" | "organizers" | "dean_assignments";
type RoleRecordName = Exclude<RoleReadName, "profiles">;
type FakeRoleRecord = {
  id: string;
  profile_id: string;
  department_id?: string;
};

class FakeSupabaseSessionReader implements SupabaseSessionReader {
  readonly calls: RoleReadName[] = [];

  constructor(
    private readonly role: UserRole,
    private readonly roleRecords: Partial<Record<RoleRecordName, FakeRoleRecord[]>> = {},
    private readonly profileError?: Error,
    private readonly roleRecordError?: Error & { code?: string; details?: string }
  ) {}

  async readProfile() {
    this.calls.push("profiles");
    if (this.profileError) {
      return { data: null, error: this.profileError };
    }

    return {
      data: {
        id: `profile-${this.role}`,
        role: this.role,
        email: `${this.role}@plpass.test`,
        display_name: `${this.role} User`,
        account_status: "active",
        created_at: "2026-06-28T00:00:00.000Z"
      },
      error: null
    };
  }

  async readStudentRecord(userId: string) {
    this.calls.push("students");
    if (this.roleRecordError) {
      return { data: null, error: this.roleRecordError };
    }
    const row = this.roleRecords.students?.find((record) => record.profile_id === userId);
    return { data: row ? { id: row.id } : null, error: null };
  }

  async readFacultyRecord(userId: string) {
    this.calls.push("faculty");
    if (this.roleRecordError) {
      return { data: null, error: this.roleRecordError };
    }
    const row = this.roleRecords.faculty?.find((record) => record.profile_id === userId);
    return {
      data: row
        ? {
            id: row.id,
            profile_id: row.profile_id,
            employee_id: "PLPASS-LIVE-FAC-001",
            department_id: row.department_id ?? "department-live-1",
            faculty_status: "active"
          }
        : null,
      error: null
    };
  }

  async readOrganizerRecord(userId: string) {
    this.calls.push("organizers");
    if (this.roleRecordError) {
      return { data: null, error: this.roleRecordError };
    }
    const row = this.roleRecords.organizers?.find((record) => record.profile_id === userId);
    return { data: row ? { id: row.id } : null, error: null };
  }

  async readDeanAssignments(userId: string) {
    this.calls.push("dean_assignments");
    if (this.roleRecordError) {
      return { data: null, error: this.roleRecordError };
    }
    const rows = this.roleRecords.dean_assignments?.filter((record) => record.profile_id === userId) ?? [];
    return {
      data: rows.map((record) => ({ id: record.id, department_id: record.department_id ?? "" })),
      error: null
    };
  }
}

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

  it("resolves live Admin sessions through department-scoped dean assignments", async () => {
    const supabase = new FakeSupabaseSessionReader("admin", {
      dean_assignments: [{ id: "assignment-1", profile_id: "profile-admin", department_id: "department-1" }]
    });

    const session = await resolveSupabaseSessionUser(supabase, { id: "profile-admin", email: "admin@plpass.test" });

    expect(session.role).toBe("admin");
    expect(session.userId).toBe("profile-admin");
    expect(supabase.calls).toEqual(["profiles", "dean_assignments"]);
  });

  it.each([
    ["faculty", "faculty"] as const,
    ["organizer", "organizers"] as const,
    ["student", "students"] as const
  ])("resolves live %s sessions without querying dean assignments", async (role, tableName) => {
    const supabase = new FakeSupabaseSessionReader(role, {
      [tableName]: [{ id: `${role}-record-1`, profile_id: `profile-${role}` }]
    });

    const session = await resolveSupabaseSessionUser(supabase, { id: `profile-${role}`, email: `${role}@plpass.test` });

    expect(session.role).toBe(role);
    expect(session.userId).toBe(`profile-${role}`);
    expect(supabase.calls).toContain(tableName);
    expect(supabase.calls).not.toContain("dean_assignments");
  });

  it("resolves a Faculty Auth user when faculty.profile_id matches the signed-in profile", async () => {
    const supabase = new FakeSupabaseSessionReader("faculty", {
      faculty: [{ id: "faculty-live-1", profile_id: "profile-faculty", department_id: "department-live-1" }]
    });

    const session = await resolveSupabaseSessionUser(supabase, { id: "profile-faculty", email: "faculty@plpass.edu.ph" });

    expect(session).toMatchObject({
      role: "faculty",
      userId: "profile-faculty",
      accountStatus: "active"
    });
    expect(supabase.calls).toEqual(["profiles", "faculty"]);
  });

  it("shows the Dean assignment error only for Admin profiles without assignments", async () => {
    const supabase = new FakeSupabaseSessionReader("admin");

    await resolveSupabaseSessionUser(supabase, { id: "profile-admin", email: "admin@plpass.test" }).catch((error: unknown) => {
      expect(toSafeAuthErrorMessage(error)).toContain("[DEAN_ASSIGNMENT_MISSING]");
      expect(shouldSignOutAfterAuthFailure(error)).toBe(true);
    });
    expect(supabase.calls).toEqual(["profiles", "dean_assignments"]);
  });

  it("shows a role-specific error when a non-admin role record is missing", async () => {
    const supabase = new FakeSupabaseSessionReader("faculty");

    await resolveSupabaseSessionUser(supabase, { id: "profile-faculty", email: "faculty@plpass.test" }).catch((error: unknown) => {
      expect(toSafeAuthErrorMessage(error)).toContain("[FACULTY_RECORD_MISSING]");
      expect(shouldSignOutAfterAuthFailure(error)).toBe(true);
    });
    expect(supabase.calls).toEqual(["profiles", "faculty"]);
  });

  it("reports database query failures without forcing session deletion during refresh recovery", async () => {
    const supabase = new FakeSupabaseSessionReader("student", {}, Object.assign(new Error("database connection unavailable"), { code: "PGRST000" }));

    await resolveSupabaseSessionUser(supabase, { id: "profile-student", email: "student@plpass.test" }).catch((error: unknown) => {
      expect(toSafeAuthErrorMessage(error)).toContain("[DATABASE_QUERY_FAILED]");
      expect(toSafeAuthErrorMessage(error)).toContain("PGRST000");
      expect(shouldSignOutAfterAuthFailure(error)).toBe(false);
    });
  });

  it("reports RLS permission denial separately from missing Faculty rows", async () => {
    const supabase = new FakeSupabaseSessionReader(
      "faculty",
      {},
      undefined,
      Object.assign(new Error("permission denied for table faculty"), { code: "42501" })
    );

    await resolveSupabaseSessionUser(supabase, { id: "profile-faculty", email: "faculty@plpass.edu.ph" }).catch((error: unknown) => {
      expect(toSafeAuthErrorMessage(error)).toContain("[RLS_PERMISSION_DENIED]");
      expect(toSafeAuthErrorMessage(error)).toContain("42501");
      expect(shouldSignOutAfterAuthFailure(error)).toBe(false);
    });
  });

  it("reports multiple Faculty role rows separately", async () => {
    const supabase = new FakeSupabaseSessionReader(
      "faculty",
      {},
      undefined,
      Object.assign(new Error("JSON object requested, multiple rows returned"), {
        code: "PGRST116",
        details: "Results contain 2 rows"
      })
    );

    await resolveSupabaseSessionUser(supabase, { id: "profile-faculty", email: "faculty@plpass.edu.ph" }).catch((error: unknown) => {
      expect(toSafeAuthErrorMessage(error)).toContain("[ROLE_RECORD_MULTIPLE]");
      expect(toSafeAuthErrorMessage(error)).toContain("PGRST116");
      expect(shouldSignOutAfterAuthFailure(error)).toBe(true);
    });
  });
});
