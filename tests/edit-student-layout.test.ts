import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

const page = readFileSync("src/features/organizer/pages/OrganizerUserManagement.tsx", "utf8");
const styles = readFileSync("src/index.css", "utf8");

describe("Edit Student layout", () => {
  it("groups fields into clear sections while preserving mobile stacking", () => {
    expect(page).toContain('Update the student’s name and contact details.');
    expect(page).toContain('Keep the student’s department, program, and class placement accurate.');
    expect(page).toContain('Control whether this student can access their account.');
    expect(page).toContain('grid grid-cols-2 gap-4');
    expect(styles).toContain('.account-edit-student-form .grid.grid-cols-2');
  });
});
