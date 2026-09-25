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
    expect(page).toContain('value={organizer.employeeNumber}');
    expect(page).toContain("onRowClick={(row) => onEdit(row.id)}");
  });

  it("keeps persistence behind the administrator-only user-management API", () => {
    expect(contracts).toContain("export type UpdateOrganizerInput");
    expect(contracts).toContain("updateOrganizer(input: UpdateOrganizerInput");
    expect(repository).toContain('action: "update-organizer"');
    expect(userManager).toContain('if (action === "update-organizer")');
    expect(userManager).toContain('["admin", "department_admin"].includes(profile.role)');
    expect(userManager).toContain('Department administrators can manage only accounts in their own department.');
    expect(userManager).toContain('"user.organizer_updated"');
  });

  it("shows generated organizer IDs instead of accepting manual IDs", () => {
    expect(page).toContain('value={generatedEmployeeId}');
    expect(page).toContain('employeeNumber: ""');
    expect(userManager).toContain('return json({ success: true, employeeNumber });');
  });

  it("locks the position to Organizer when adding an organizer", () => {
    expect(page).toContain('value="Organizer" />');
    expect(page).toContain('position: "Organizer" });');
    expect(userManager).toContain('const position = "Organizer";');
  });

  it("keeps organizer bulk templates position-free and closes after download", () => {
    expect(page).toContain('const csv = "First Name,Middle Name,Last Name,Name Extension,College/Department\\nJuan,,Dela Cruz,,Student Affairs\\n";');
    expect(page).not.toContain('Name Extension,College/Department,Position\\nJuan,,Dela Cruz,,Student Affairs,Events Coordinator');
    expect(page).toContain('position: "Organizer" }');
    expect(page).toMatch(/onClose\(\);\s+setTimeout\(\(\) => URL\.revokeObjectURL\(url\), 0\);/u);
  });

  it("renders organizer statuses with the shared account-status badge", () => {
    expect(page).toContain('headerName: "Status", valueGetter: ({ data }) =>');
    expect(page).toContain('cellRenderer: ({ value }: ICellRendererParams<OrganizerProfile, OrganizerStatus>) => <StatusBadge value={value ?? "Inactive"} />');
  });

  it("keeps access changes in university-admin account management", () => {
    const profile = readFileSync("src/pages/ProfilePage.tsx", "utf8");
    expect(profile).not.toContain("Close my organizer account");
    expect(contracts).not.toContain("closeOwnOrganizerAccount");
    expect(repository).not.toContain('action: "close-own-organizer-account"');
    expect(userManager).not.toContain('action === "close-own-organizer-account"');
    expect(page).toContain('value="active">Active</option><option value="inactive">Inactive</option>');
    expect(userManager).toContain('if (!["active", "inactive"].includes(accountStatus))');
    expect(userManager).toContain('supabase.auth.admin.signOut(profileId, "global")');
  });

  it("does not expose or accept department-admin deletion", () => {
    expect(page).not.toContain("Delete department-admin account?");
    expect(page).not.toContain("users.delete.department_admin");
    expect(contracts).not.toContain("deleteDepartmentAdmin");
    expect(repository).not.toContain('action: "delete-department-admin"');
    expect(userManager).not.toContain('action === "delete-department-admin"');
    expect(userManager).toContain('.in("role", ["admin", "department_admin"])');
  });

  it("keeps department-admin organizer edits within the assigned department", () => {
    expect(page).toContain('departments = fixedDepartmentId ? departments.filter((department) => department.id === fixedDepartmentId) : departments;');
    expect(page).toContain('setForm((current) => ({ ...current, departmentId: fixedDepartmentId }));');
  });
});
