import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

const read = (path: string) => readFileSync(resolve(process.cwd(), path), "utf8");

describe("priority six audit reliability", () => {
  it("applies organizer audit-log search in Supabase", () => {
    const source = read("src/services/supabase/repositories.ts");
    expect(source).toContain('client.from("audit_logs").select("*", { count: "exact" })');
    expect(source).toContain("action.ilike.*${search}*");
    expect(source).toContain("target_type.ilike.*${search}*");
    expect(source).toContain("target_id.eq.${search}");
  });

  it("applies notification filters to the backend query", () => {
    const source = read("src/services/supabase/repositories.ts");
    expect(source).toContain("notification_status: query?.notificationStatus");
    expect(source).toContain("notification_type: query?.notificationType");
  });
});

describe("priority seven organizer account security", () => {
  it("persists validated avatars in Supabase instead of local storage", () => {
    const source = read("src/features/organizer/pages/OrganizerProfilePage.tsx");
    expect(source).not.toContain('localStorage.getItem("plpass-organizer-avatar")');
    expect(source).not.toContain('localStorage.setItem("plpass-organizer-avatar"');
    expect(source).toContain('.from("profile-avatars")');
    expect(source).toContain("createSignedUrl(objectPath, 3600)");
    expect(source).toContain("file.size > 2 * 1024 * 1024");
    expect(source).toContain('.select("profile_picture")');
  });

  it("requires a stronger, changed password and confirmed sign-out", () => {
    const profile = read("src/features/organizer/pages/OrganizerProfilePage.tsx");
    const provider = read("src/app/providers/DevelopmentSessionProvider.tsx");
    expect(profile).toContain("newPassword.length < 8");
    expect(profile).toContain("newPassword === oldPassword");
    expect(profile).toContain("await logout()");
    expect(provider).toContain("await getSupabaseBrowserClient().auth.signOut()");
  });

  it("restricts profile-avatar writes to the authenticated user's folder", () => {
    const migration = read("supabase/migrations/20260826180533_add_profile_avatar_storage.sql");
    expect(migration).toContain("file_size_limit");
    expect(migration).toContain("allowed_mime_types");
    expect(migration).toContain("false,");
    expect(migration).toContain("(storage.foldername(name))[1] = (select auth.uid())::text");
  });
});
