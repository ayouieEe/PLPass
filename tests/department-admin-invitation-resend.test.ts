import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

const read = (path: string) => readFileSync(resolve(process.cwd(), path), "utf8");

describe("department-admin organizer invitation resend", () => {
  it("allows the department role through the client guard while keeping admin resends restricted", () => {
    const repositories = read("src/services/supabase/repositories.ts");
    const mockRepositories = read("src/test-support/repositories.ts");

    expect(repositories).toContain('context?.actorRole !== "admin" && context?.actorRole !== "department_admin"');
    expect(repositories).toContain('Only university administrators can resend administrator invitations.');
    expect(mockRepositories).toContain('beforeRead("userManagement", context, ["admin", "department_admin"])');
  });
});
