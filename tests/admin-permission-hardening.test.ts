import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

const read = (path: string) => readFileSync(resolve(process.cwd(), path), "utf8");

describe("admin and organizer permission hardening", () => {
  it("keeps session revocation server-side, audited, and unavailable to browser roles", () => {
    const migration = read("supabase/migrations/20260920064328_harden_admin_session_revocation.sql");
    const worker = read("supabase/functions/manage-users/index.ts");
    expect(migration).toContain("admin_revoke_user_sessions");
    expect(migration).toContain("delete from auth.sessions where user_id = p_target_user_id");
    expect(migration).toContain("Administrators cannot revoke their own sessions");
    expect(migration).toContain("grant execute on function public.admin_revoke_user_sessions(uuid, uuid, text) to service_role");
    expect(migration).not.toContain("grant execute on function public.admin_revoke_user_sessions(uuid, uuid, text) to authenticated");
    expect(worker).toContain('action === "revoke-user-sessions"');
    expect(worker).toContain("admin_revoke_user_sessions");
  });

  it("protects organizer credential writes by owned-event participation", () => {
    const migration = read("supabase/migrations/20260920065546_restrict_organizer_credential_scope.sql");
    expect(migration).toContain("private.can_manage_student_credentials");
    expect(migration).toContain("ep.participant_status <> 'removed'");
    expect(migration).toContain("e.organizer_id = (select private.current_organizer_id())");
    expect(migration).toContain("private.is_active_admin()");
  });

  it("uses invitation delivery for pending users and password setup for active accounts", () => {
    const worker = read("supabase/functions/manage-users/index.ts");
    const page = read("src/features/organizer/pages/OrganizerUserManagement.tsx");
    expect(worker).toContain('action === "prepare-user-invitation-resend"');
    expect(worker).toContain('["admin", "department_admin", "organizer"]');
    expect(worker).not.toContain('"student"].includes(targetProfile.role)');
    expect(worker).toContain("isUnacceptedInvitation");
    expect(worker).toContain('delivery: "invitation"');
    expect(worker).toContain('delivery: "password_reset"');
    expect(worker).toContain("inviteAccount(supabase, authTarget.user.email, {})");
    expect(worker).toContain("No account, profile, role, or password is created here.");
    expect(page).toContain("Send password setup link");
    expect(page).not.toContain("Resend invitation");
    expect(page).toContain("Password setup link sent to");
    expect(page).toContain("Invitation sent to");
  });
});
