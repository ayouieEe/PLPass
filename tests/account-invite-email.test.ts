import { describe, expect, it } from "vitest";
import { normalizeInviteEmail, normalizeStaffEmail } from "../supabase/functions/_shared/accountEmail";

describe("account invitation email validation", () => {
  it("accepts any normal email domain and normalizes whitespace and case", () => {
    expect(normalizeInviteEmail("  Juan.DelaCruz@PLPASIG.EDU.PH ")).toBe("juan.delacruz@plpasig.edu.ph");
    expect(normalizeInviteEmail("employee@company.org")).toBe("employee@company.org");
  });

  it.each(["", "not-an-email", "missing@domain", "two@@example.com", "name @example.com"]) ("rejects invalid email: %s", (value) => {
    expect(() => normalizeInviteEmail(value)).toThrow("Enter a valid email address.");
  });

  it("accepts only the institutional domain for new or changed staff emails", () => {
    expect(normalizeStaffEmail("  Juan.DelaCruz@PLPASIG.EDU.PH ")).toBe("juan.delacruz@plpasig.edu.ph");
    expect(() => normalizeStaffEmail("employee@gmail.com")).toThrow("Use an @plpasig.edu.ph email address for staff accounts.");
    expect(() => normalizeStaffEmail("employee@plpasig.edu.ph.example")).toThrow("Use an @plpasig.edu.ph email address for staff accounts.");
  });
});
