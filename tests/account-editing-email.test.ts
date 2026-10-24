import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

const worker = readFileSync("supabase/functions/manage-users/index.ts", "utf8");
const mockRepository = readFileSync("src/test-support/repositories.ts", "utf8");
const queries = readFileSync("src/hooks/useRepositoryQueries.ts", "utf8");

describe("account edit email consistency", () => {
  it("keeps generated extension emails consistent for every editable account role", () => {
    expect(worker.match(/const nextEmail = resolveEditedAccountEmail/g)).toHaveLength(3);
    expect(worker).toContain("const nextEmail = resolveEditedAccountEmail(previousProfile, email, { firstName, middleName, lastName, nameExtension });");
    expect(mockRepository).toContain("nameExtension: input.nameExtension");
    expect(mockRepository).toContain("generateAccountEmail(input.lastName, input.firstName, input.middleName, input.nameExtension)");
  });

  it("accepts a typed organizer email while keeping generated student emails separate", () => {
    const page = readFileSync("src/features/organizer/pages/OrganizerUserManagement.tsx", "utf8");
    expect(page).toContain('label className="text-sm font-medium sm:col-span-2">Email<input required type="email"');
    expect(page).toContain('email: row["Email"].trim()');
    expect(page).toContain('const generatedEmail = generateAccountEmail(formData.lastName, formData.firstName, formData.middleName, formData.nameExtension);');
    expect(worker).toContain("const email = normalizeInviteEmail(submittedEmail);");
  });

  it("keeps successful account saves on the shared refresh path", () => {
    expect(queries).toContain("const invalidateStudents = () => {");
    expect(queries).toContain("onSuccess: () => {");
    expect(queries).toContain('queryClient.invalidateQueries({ queryKey: ["organizerProfiles"] })');
  });
});
