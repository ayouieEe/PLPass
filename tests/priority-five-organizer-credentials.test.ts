import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

const read = (path: string) => readFileSync(resolve(process.cwd(), path), "utf8");

describe("priority five organizer credential workflows", () => {
  it("keeps user management authoritative to repository data", () => {
    const source = read("src/features/organizer/pages/OrganizerUserManagement.tsx");
    expect(source).not.toContain("loadOrganizerUiState");
    expect(source).not.toContain("updated locally only");
    expect(source).toContain("useStudentCredentialStatuses");
  });

  it("shows credential records instead of inferring them from enrollment", () => {
    const source = read("src/features/organizer/pages/AuthenticationMethodsPage.tsx");
    expect(source).toContain("credentialMap.get(student.id)?.qrCredential");
    expect(source).toContain("credentialMap.get(student.id)?.facialProfile");
    expect(source).not.toContain('student.status === "enrolled" ? "Active"');
  });

  it("loads organizer credential status in one repository operation", () => {
    const source = read("src/services/supabase/repositories.ts");
    expect(source).toContain("async listStudentCredentialStatuses(context)");
    expect(source).toContain('from("qr_credentials")');
    expect(source).toContain('from("facial_profiles")');
  });
});
