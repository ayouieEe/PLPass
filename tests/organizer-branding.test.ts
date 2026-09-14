import { beforeEach, describe, expect, it } from "vitest";
import {
  resetSimulatedRepositoryState,
  simulatedUserManagementRepository
} from "@/test-support/repositories";

const organizerOne = { actorUserId: "user-organizer-1", actorRole: "organizer" as const };
const organizerTwo = { actorUserId: "user-organizer-2", actorRole: "organizer" as const };

beforeEach(() => resetSimulatedRepositoryState());

describe("organizer-owned branding", () => {
  it("allows an organizer to update their own college branding", async () => {
    const updated = await simulatedUserManagementRepository.updateOrganizerBranding({
      organizerId: "organizer-1",
      collegeName: "College of Computing",
    }, organizerOne);
    expect(updated.collegeName).toBe("College of Computing");
    expect((await simulatedUserManagementRepository.getOrganizerBranding("organizer-1", organizerOne)).collegeName).toBe("College of Computing");
  });

  it("rejects cross-organizer branding access", async () => {
    await expect(simulatedUserManagementRepository.getOrganizerBranding("organizer-2", organizerOne)).rejects.toMatchObject({ code: "PERMISSION_DENIED" });
    await expect(simulatedUserManagementRepository.updateOrganizerBranding({ organizerId: "organizer-1", collegeName: "Not allowed" }, organizerTwo)).rejects.toMatchObject({ code: "PERMISSION_DENIED" });
  });
});
