import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

const page = readFileSync("src/features/organizer/pages/OrganizerUserManagement.tsx", "utf8");
const contracts = readFileSync("src/services/contracts/index.ts", "utf8");
const repository = readFileSync("src/services/supabase/repositories.ts", "utf8");
const userManager = readFileSync("supabase/functions/manage-users/index.ts", "utf8");

describe("organizer account editing", () => {
  it("opens the same organizer editor from every directory row", () => {
    expect(page).not.toContain('headerName: "Actions"');
    expect(page).toContain("function EditOrganizerModal");
    expect(page).toContain("Employee IDs stay fixed, like student numbers.");
    expect(page).toContain("onRowClick={(row) => onEdit(row.id)}");
  });

  it("keeps persistence behind the administrator-only user-management API", () => {
    expect(contracts).toContain("export type UpdateOrganizerInput");
    expect(contracts).toContain("updateOrganizer(input: UpdateOrganizerInput");
    expect(repository).toContain('action: "update-organizer"');
    expect(userManager).toContain('if (action === "update-organizer")');
    expect(userManager).toContain('profile.role !== "admin"');
    expect(userManager).toContain('"user.organizer_updated"');
  });

  it("shows generated organizer IDs instead of accepting manual IDs", () => {
    expect(page).toContain('value={generatedEmployeeId}');
    expect(page).toContain("Assigned automatically when the account is created.");
    expect(page).toContain("Employee IDs are generated automatically during import.");
    expect(userManager).toContain('return json({ success: true, employeeNumber });');
  });
});
