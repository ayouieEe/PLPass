import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

const read = (path: string) => readFileSync(resolve(process.cwd(), path), "utf8");

describe("QR-only credential workflows", () => {
  it("keeps credential management authoritative and biometric-free", () => {
    const page = read("src/features/organizer/pages/AuthenticationMethodsPage.tsx");
    const users = read("src/features/organizer/pages/OrganizerUserManagement.tsx");
    expect(page).toContain("useStudentCredentialStatuses");
    expect(page).toContain("departmentId: session.departmentId");
    expect(page).toContain("useStudentCredentialStatuses(context, credentialStudentIds, true)");
    expect(page).toContain("Credential directory");
    expect(page).toContain("Search by student name or Student ID...");
    expect(page).toContain("credential-status-filter");
    expect(page).toContain("PLPassDataGrid");
    expect(page).not.toContain("facial");
    expect(users).not.toContain("facialStatus");
  });

  it("queries only QR credentials for organizer-owned participants", () => {
    const source = read("src/services/supabase/repositories.ts");
    expect(source).toContain('from("qr_credentials")');
    expect(source).not.toContain('from("facial_profiles")');
  });
});
