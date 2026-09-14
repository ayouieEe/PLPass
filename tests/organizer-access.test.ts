import { beforeEach, describe, expect, it } from "vitest";
import {
  resetSimulatedRepositoryState,
  simulatedAuditLogRepository,
  simulatedEventManagementRepository,
  simulatedSystemSettingsRepository,
  simulatedUserManagementRepository
} from "@/test-support/repositories";

const organizerOne = { actorUserId: "user-organizer-1", actorRole: "organizer" as const };

beforeEach(() => resetSimulatedRepositoryState());

async function expectDenied(action: () => Promise<unknown>) {
  await expect(action()).rejects.toMatchObject({ code: "PERMISSION_DENIED" });
}

describe("organizer access boundaries", () => {
  it("does not allow organizer account management mutations", async () => {
    await expectDenied(() => simulatedUserManagementRepository.createStudent({
      studentNumber: "2026-9999",
      email: "new.student@plpass.test",
      firstName: "New",
      lastName: "Student",
      programId: "program-1",
      departmentId: "department-1",
      yearLevel: 1,
      sectionId: "section-1"
    }, organizerOne));
  });

  it("does not allow an organizer to open another organizer's event", async () => {
    await expectDenied(() => simulatedEventManagementRepository.getEventById("event-2", organizerOne));
  });

  it("returns only the signed-in organizer's audit entries", async () => {
    const result = await simulatedAuditLogRepository.listAuditLogs({ pageIndex: 0, pageSize: 100 }, organizerOne);
    expect(result.items.length).toBeGreaterThan(0);
    expect(result.items.every((entry) => entry.actorUserId === organizerOne.actorUserId)).toBe(true);
  });

  it("keeps system settings Admin-only", async () => {
    await expectDenied(() => simulatedSystemSettingsRepository.getSettings(organizerOne));
  });
});
