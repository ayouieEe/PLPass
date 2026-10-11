import { describe, expect, it } from "vitest";
import { formatSurnameFirstName } from "@/lib/utils/names";

describe("surname-first student table names", () => {
  it("keeps a student's surname, middle initial, and extension in the canonical order", () => {
    expect(formatSurnameFirstName({
      firstName: "John Martin",
      middleName: "Garcia",
      lastName: "Leones",
      nameExtension: "Jr."
    })).toBe("Leones, John Martin G. Jr.");
  });

  it("retains the available name safely when a legacy row has no surname", () => {
    expect(formatSurnameFirstName({ firstName: "Madonna" }, "Unknown student")).toBe("Madonna");
    expect(formatSurnameFirstName({ fullName: "Legacy Student" }, "Unknown student")).toBe("Legacy Student");
    expect(formatSurnameFirstName({}, "Unknown student")).toBe("Unknown student");
  });
});
