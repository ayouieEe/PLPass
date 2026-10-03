import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

const source = readFileSync("src/features/organizer/pages/OrganizerUserManagement.tsx", "utf8");

describe("Student Details account actions", () => {
  it("groups account operations in an accessible menu", () => {
    expect(source).toContain('aria-label={`Account actions for ${student.name}`}');
    expect(source).toContain('role="menu" aria-label="Account actions"');
    expect(source).toContain('role="menuitem"');
    expect(source).toContain('onToggleAccountStatus(student.id, student.accountStatus === "active" ? "inactive" : "active")');
    expect(source).toContain('onRevokeSessions(student.userId, student.name)');
  });
});
