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

  it("does not make successful account saves wait for list refetches", () => {
    expect(queries).toContain("const invalidateStudents = () => {");
    expect(queries).toContain("onSuccess: () => {");
    expect(queries).not.toContain("onSuccess: async () => {\n      await Promise.all([\n        queryClient.invalidateQueries({ queryKey: [\"organizerProfiles\"] })");
  });
});
