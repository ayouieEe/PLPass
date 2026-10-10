import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

const read = (path: string) => readFileSync(resolve(process.cwd(), path), "utf8");

describe("password setup link loading state", () => {
  it("keeps the confirmation modal busy until the resend request settles", () => {
    const source = read("src/features/organizer/pages/OrganizerUserManagement.tsx");

    expect(source).toContain("confirmBusy={resendingInvitationUserId === user.id}");
    expect(source).toContain('confirmBusyLabel="Sending…"');
    expect(source).toContain("cancelDisabled={resendingInvitationUserId === user.id}");
    expect(source).toContain("finally { setResendConfirmOpen(false); }");
  });
});
