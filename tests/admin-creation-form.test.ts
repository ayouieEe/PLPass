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
    expect(source).toContain('generatedUniversityEmployeeId={nextEmployeeId');
    expect(source).toContain('generatedDepartmentEmployeeId={nextEmployeeId');
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

  it("starts each admin creation with a blank form and uses the server-generated ID", () => {
    const source = read("src/features/organizer/pages/OrganizerUserManagement.tsx");
    const repository = read("src/services/supabase/repositories.ts");
    expect(source).toContain('setForm({ email: "", firstName: "", middleName: "", lastName: ""');
    expect(source).toContain("setConfirmOpen(false);");
    expect(repository).toContain("const generatedEmployeeNumber = String(data?.employeeNumber ?? input.employeeNumber);");
    expect(repository).toContain(".eq(\"employee_number\", generatedEmployeeNumber)");
  });

  it("rejects an existing administrator email before inviting another account", () => {
    const worker = read("supabase/functions/manage-users/index.ts");
    expect(worker).toContain('.ilike("email", email).limit(1)');
    expect(worker).toContain("An account with this email already exists.");
  });

  it("verifies the saved extension and keeps it visible in the admin directory", () => {
    const worker = read("supabase/functions/manage-users/index.ts");
    const source = read("src/features/organizer/pages/OrganizerUserManagement.tsx");
    expect(worker).toContain('.select("name_extension").single()');
    expect(worker).toContain("The administrator name extension could not be saved.");
    expect(source).toContain("user.nameExtension && !user.displayName.trim().endsWith(user.nameExtension)");
  });

  it("normalizes legacy organizer IDs before allocating the next ID", () => {
    const worker = read("supabase/functions/manage-users/index.ts");
    const frontend = read("src/features/organizer/pages/OrganizerUserManagement.tsx");
    expect(worker).toContain("String((row as Record<string, unknown>)[column] ?? \"\").trim()");
    expect(frontend).toContain("item.employeeNumber.trim().match");
  });

  it("uses the same prefixed format in live and test organizer creation", () => {
    const worker = read("supabase/functions/manage-users/index.ts");
    const repositories = read("src/test-support/repositories.ts");
    const fixtures = read("src/test-support/fixtures.ts");
    const seed = read("supabase/seed.sql");
    const integration = read("scripts/test-local-supabase-integration.mjs");
    const migration = read("supabase/migrations/20261007100000_normalize_legacy_organizer_employee_ids.sql");
    const repairMigration = read("supabase/migrations/20261007110000_repair_organizer_profile_employee_id.sql");
    const whitespaceRepairMigration = read("supabase/migrations/20261007120000_repair_organizer_profile_employee_id_whitespace.sql");

    expect(worker).toContain('nextEmployeeId(supabase, "organizers", "employee_id", "O")');
    expect(repositories).toContain("const employeeNumber = `O-${String(nextId).padStart(3, \"0\")}`;");
    expect(fixtures).toContain('employeeNumber: "O-001"');
    expect(fixtures).toContain('employeeNumber: "UA-001"');
    expect(seed).toContain("'O-001'");
    expect(integration).toContain('employeeId: "O-901"');
    expect(migration).toContain("update public.profiles");
    expect(migration).toContain("update public.organizers");
    expect(migration).toContain("Legacy organizer employee IDs do not match their profiles");
    expect(repairMigration).toContain("btrim(o.employee_id) = 'O-001'");
    expect(repairMigration).toContain("p.employee_id = 'O-2001'");
    expect(whitespaceRepairMigration).toContain("regexp_replace(o.employee_id, '[[:space:]]+$', '')");
  });

  it("supplies the required organization value from the selected department", () => {
    const source = read("src/features/organizer/pages/OrganizerUserManagement.tsx");
    expect(source).toContain('const organizationName = departments.find((department) => department.id === departmentId)?.code;');
    expect(source).toContain('departmentId, organizationName, email: generatedEmail');
  });

  it("uses collision-safe admin prefixes and shows the assigned ID in the directory", () => {
    const worker = read("supabase/functions/manage-users/index.ts");
    const source = read("src/features/organizer/pages/OrganizerUserManagement.tsx");
    const migration = read("supabase/migrations/20261007084221_split_admin_employee_id_prefixes.sql");
    const repositories = read("src/test-support/repositories.ts");
    expect(worker).toContain('adminRole === "department_admin" ? "DA" : "UA"');
    expect(source).toContain('{ headerName: "Admin ID", field: "employeeNumber"');
    expect(source).toContain('form.adminRole === "department_admin" ? generatedDepartmentEmployeeId : generatedUniversityEmployeeId');
    expect(migration).toContain("'DA-' || right(ap.employee_number, 3)");
    expect(migration).toContain("'UA-' || right(ap.employee_number, 3)");
    expect(repositories).toContain('const prefix = input.adminRole === "department_admin" ? "DA" : "UA";');
  });

  it("compacts department IDs and fills the first available admin sequence number", () => {
    const worker = read("supabase/functions/manage-users/index.ts");
    const source = read("src/features/organizer/pages/OrganizerUserManagement.tsx");
    const migration = read("supabase/migrations/20261007085145_compact_department_admin_ids.sql");
    expect(migration).toContain("row_number() over (order by ap.created_at, ap.id)");
    expect(migration).toContain("DA-TEMP-");
    expect(worker).toContain("while (usedNumbers.has(next)) next += 1;");
    expect(source).toContain("while (usedNumbers.has(next)) next += 1;");
  });

  it("shows and enforces an in-progress state during admin creation", () => {
    const source = read("src/features/organizer/pages/OrganizerUserManagement.tsx");
    const modal = read("src/components/modals/ConfirmModal.tsx");
    expect(source).toContain('confirmBusy={mutation.isPending}');
    expect(source).toContain('confirmBusyLabel="Creating…"');
    expect(modal).toContain('Loader2 className="mr-2 h-4 w-4 animate-spin"');
    expect(modal).toContain("onClose={confirmBusy ? undefined : onCancel}");
  });
});
