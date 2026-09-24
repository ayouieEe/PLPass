import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";

const read = (file: string) => readFileSync(resolve(process.cwd(), file), "utf8");

describe("administrator creation contract", () => {
  it("offers an explicit university-admin or department-admin choice", () => {
    const source = read("src/features/organizer/pages/OrganizerUserManagement.tsx");
    expect(source).toContain("University admin");
    expect(source).toContain("Department admin");
    expect(source).toContain('adminRole: "admin"');
    expect(source).not.toContain('placeholder="e.g. Office of the Dean"');
    expect(source).toContain('id="add-admin-name-extension"');
    expect(source).toContain('id="add-organizer-name-extension"');
  });

  it("preserves the legacy database column without showing an office field during creation", () => {
    const worker = read("supabase/functions/manage-users/index.ts");
    expect(worker).toContain('role: adminRole');
    expect(worker).toContain('role: adminRole, employee_id: employeeNumber');
    expect(worker).toContain('"University Admin"');
    expect(worker).toContain('"Department Admin"');
    expect(worker).not.toContain('adminRole === "admin" && !normalizedOfficeName');
  });

  it("supplies the required employee identifier before creating staff profiles", () => {
    const worker = read("supabase/functions/manage-users/index.ts");
    const organizerProfileWrites = worker.match(/role: "organizer", employee_id: employeeNumber/g) ?? [];

    expect(organizerProfileWrites).toHaveLength(2);
    expect(worker).toContain('role: adminRole, employee_id: employeeNumber');
  });

  it("keeps safe Edge Function validation messages visible to the administrator", () => {
    const repository = read("src/services/supabase/repositories.ts");
    expect(repository).toContain("getFunctionInvocationErrorMessage");
    expect(repository).toContain('await getFunctionInvocationErrorMessage(error)');
  });

  it("normalizes legacy organizer IDs before allocating the next ID", () => {
    const worker = read("supabase/functions/manage-users/index.ts");
    const frontend = read("src/features/organizer/pages/OrganizerUserManagement.tsx");
    expect(worker).toContain("String((row as Record<string, unknown>)[column] ?? \"\").trim()");
    expect(frontend).toContain("item.employeeNumber.trim().match");
  });

  it("supplies the required organization value from the selected department", () => {
    const source = read("src/features/organizer/pages/OrganizerUserManagement.tsx");
    expect(source).toContain('const organizationName = departments.find((department) => department.id === departmentId)?.code;');
    expect(source).toContain('departmentId, organizationName, email: generatedEmail');
  });
});
