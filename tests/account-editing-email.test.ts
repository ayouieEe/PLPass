import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

const worker = readFileSync("supabase/functions/manage-users/index.ts", "utf8");
const mockRepository = readFileSync("src/test-support/repositories.ts", "utf8");
const queries = readFileSync("src/hooks/useRepositoryQueries.ts", "utf8");

describe("account edit email consistency", () => {
  it("keeps generated extension emails consistent for every editable account role", () => {
    expect(worker).toContain("const nextEmail = resolveEditedAccountEmail(previousProfile, email, { firstName, middleName, lastName, nameExtension });");
    expect(mockRepository).toContain("nameExtension: input.nameExtension");
    expect(mockRepository).toContain("generateAccountEmail(input.lastName, input.firstName, input.middleName, input.nameExtension)");
  });

  it("generates staff emails while keeping generated student emails separate", () => {
    const page = readFileSync("src/features/organizer/pages/OrganizerUserManagement.tsx", "utf8");
    expect(page).toContain('Generated email<input readOnly aria-readonly="true"');
    expect(page).toContain('const required = ["First Name", "Last Name", "College/Department"];');
    expect(page).toContain('const generatedEmail = generateAccountEmail(formData.lastName, formData.firstName, formData.middleName, formData.nameExtension);');
    expect(worker).toContain("email = generatedAccountEmail(lastName, firstName, middleName, normalizedNameExtension);");
    expect(worker).toContain("const nextEmail = emailChanged ? normalizeStaffEmail(resolvedEmail) : resolvedEmail;");
  });

  it("keeps successful account saves on the shared refresh path", () => {
    expect(queries).toContain("const invalidateStudents = () => {");
    expect(queries).toContain("onSuccess: () => {");
    expect(queries).toContain('queryClient.invalidateQueries({ queryKey: ["organizerProfiles"] })');
  });
});
