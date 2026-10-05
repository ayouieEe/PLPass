import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

const source = readFileSync("src/features/organizer/pages/OrganizerUserManagement.tsx", "utf8");
const addAdminModal = source.slice(source.indexOf("function AddAdminModalAutomatic"), source.indexOf("type OrganizerCreationForm"));

describe("Add Admin modal layout", () => {
  it("keeps related fields in equal-width rows", () => {
    expect(addAdminModal.indexOf(">First name<")).toBeLessThan(addAdminModal.indexOf(">Last name<"));
    expect(addAdminModal.indexOf(">Last name<")).toBeLessThan(addAdminModal.indexOf(">Middle name <"));
    expect(addAdminModal).toContain('className="text-sm font-medium">Department<select');
    expect(addAdminModal).not.toContain('className="text-sm font-medium sm:col-span-2">Department<select');
  });
});
