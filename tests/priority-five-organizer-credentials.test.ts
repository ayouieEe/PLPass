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

  it("identifies a live facial match without selecting a student", () => {
    const source = read("src/features/organizer/pages/EventManagementPage.tsx");

    expect(source).toContain('rpc("identify_event_participant_by_face"');
    expect(source).not.toContain('.from("facial_profiles")');
    expect(source).not.toContain("Student to verify");
    expect(source).not.toContain("facialStudentId");
  });

  it("limits facial identification to eligible participants in the active session", () => {
    const migration = read("supabase/migrations/20260830080626_identify_event_participant_by_face.sql");

    expect(migration).toContain("security definer");
    expect(migration).toContain("set search_path = ''");
    expect(migration).toContain("private.is_active_organizer()");
    expect(migration).toContain("participant.participant_status <> 'removed'");
    expect(migration).toContain("similarity >= 0.82");
  });

  it("keeps the session venue read-only in the start-session form", () => {
    const source = read("src/features/organizer/pages/EventManagementPage.tsx");
    const venueBlock = source.match(/<label className="block space-y-2 text-sm font-medium">[\s\S]*?<span>Venue[\s\S]*?<\/label>/)?.[0] ?? "";

    expect(venueBlock).toContain("readOnly");
    expect(venueBlock).not.toContain("setSessionForm((current) => ({ ...current, venue: event.target.value }))");
  });
});
