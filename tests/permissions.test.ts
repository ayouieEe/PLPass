import { describe, expect, it } from "vitest";
import {
  CAPABILITIES,
  ROLE_CAPABILITIES,
  hasAnyCapability,
  hasCapability,
  type Capability
} from "@/lib/auth/permissions";

describe("role capabilities", () => {
  it("gives admins only the defined system and read/support capabilities", () => {
    expect(hasCapability("admin", "users.read.all")).toBe(true);
    expect(hasCapability("admin", "system.settings.manage")).toBe(true);
    expect(CAPABILITIES).not.toContain("attendance.session.recover");
    expect(hasCapability("admin", "events.read.all")).toBe(true);
    expect(hasCapability("admin", "users.invitation.resend")).toBe(true);
    expect(hasCapability("admin", "events.create")).toBe(false);
    expect(hasCapability("admin", "events.manage.owned")).toBe(false);
    expect(hasCapability("admin", "attendance.manage.owned")).toBe(false);
    expect(hasCapability("admin", "corrections.review.owned")).toBe(false);
  });

  it("keeps organizer capabilities scoped to owned operations", () => {
    expect(hasCapability("organizer", "events.create")).toBe(true);
    expect(hasCapability("organizer", "events.manage.owned")).toBe(true);
    expect(hasCapability("organizer", "events.read.all")).toBe(false);
    expect(hasCapability("organizer", "system.settings.manage")).toBe(false);
    expect(hasCapability("organizer", "audit.read.all")).toBe(false);
    expect(hasCapability("organizer", "audit.export")).toBe(true);
    expect(CAPABILITIES).not.toContain("reports.read.owned");
    expect(hasCapability("organizer", "users.status.manage")).toBe(false);
    expect(hasCapability("organizer", "users.invitation.resend")).toBe(false);
  });

  it("supports shared route guards without granting either role extra capabilities", () => {
    const eventRead: Capability[] = ["events.read.owned", "events.read.all"];

    expect(hasAnyCapability("organizer", eventRead)).toBe(true);
    expect(hasAnyCapability("admin", eventRead)).toBe(true);
    expect(hasAnyCapability("student", eventRead)).toBe(false);
  });

  it("defaults unknown capabilities to denied", () => {
    expect(hasCapability("admin", "database.write.all" as Capability)).toBe(false);
    expect(hasCapability("organizer", "arbitrary_sql" as Capability)).toBe(false);
    expect(hasCapability("student", "biometric_data.read" as Capability)).toBe(false);
  });

  it("keeps the role map complete and uses only declared capabilities", () => {
    for (const capabilities of Object.values(ROLE_CAPABILITIES)) {
      expect(capabilities.every((capability) => CAPABILITIES.includes(capability))).toBe(true);
    }
  });
});
