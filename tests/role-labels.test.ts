import { describe, expect, it } from "vitest";
import { getUserRoleLabel } from "@/lib/auth/roleLabels";

describe("profile role labels", () => {
  it.each([
    ["admin", "University Admin"],
    ["department_admin", "Department Admin"],
    ["organizer", "Organizer"],
    ["student", "Student"]
  ])("formats %s as %s", (role, label) => {
    expect(getUserRoleLabel(role)).toBe(label);
  });
});
