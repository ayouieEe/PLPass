import { describe, expect, it } from "vitest";
import { normalizeInviteEmail } from "../supabase/functions/_shared/accountEmail";

describe("account invitation email validation", () => {
  it("accepts any normal email domain and normalizes whitespace and case", () => {
    expect(normalizeInviteEmail("  Juan.DelaCruz@PLPASIG.EDU.PH ")).toBe("juan.delacruz@plpasig.edu.ph");
    expect(normalizeInviteEmail("employee@company.org")).toBe("employee@company.org");
  });

  it.each(["", "not-an-email", "missing@domain", "two@@example.com", "name @example.com"]) ("rejects invalid email: %s", (value) => {
    expect(() => normalizeInviteEmail(value)).toThrow("Enter a valid email address.");
  });
});
