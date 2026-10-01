import { beforeEach, describe, expect, it } from "vitest";
import {
  resetSimulatedRepositoryState,
  simulatedUserManagementRepository
} from "@/test-support/repositories";

const organizerOne = { actorUserId: "user-organizer-1", actorRole: "organizer" as const };
const organizerTwo = { actorUserId: "user-organizer-2", actorRole: "organizer" as const };
const departmentAdmin = { actorUserId: "user-admin-1", actorRole: "department_admin" as const, departmentId: "dept-ccs" };

beforeEach(() => resetSimulatedRepositoryState());

describe("branding ownership", () => {
  it("resolves an organizer's branding from their department", async () => {
    await expect(simulatedUserManagementRepository.getOrganizerBranding("organizer-1", organizerOne)).resolves.toMatchObject({
      collegeName: "College of Computer Studies"
    });
  });

  it("rejects organizer branding edits", async () => {
    await expect(simulatedUserManagementRepository.updateOrganizerBranding({
      organizerId: "organizer-1",
      collegeName: "College of Computing",
    }, organizerOne)).rejects.toMatchObject({ code: "PERMISSION_DENIED" });
  });

  it("rejects cross-organizer branding access", async () => {
    await expect(simulatedUserManagementRepository.getOrganizerBranding("organizer-2", organizerOne)).rejects.toMatchObject({ code: "PERMISSION_DENIED" });
    await expect(simulatedUserManagementRepository.updateOrganizerBranding({ organizerId: "organizer-1", collegeName: "Not allowed" }, organizerTwo)).rejects.toMatchObject({ code: "PERMISSION_DENIED" });
  });

  it("persists department-admin branding and exposes it to the department organizer", async () => {
    await simulatedUserManagementRepository.updateDepartmentBranding({
      departmentId: "dept-ccs",
      displayName: "CCS Innovation Lab",
      primaryColor: "#766865",
      secondaryColor: "#d1d1d1"
    }, departmentAdmin);

    await expect(simulatedUserManagementRepository.getDepartmentBranding("dept-ccs", departmentAdmin)).resolves.toMatchObject({
      displayName: "CCS Innovation Lab",
      primaryColor: "#766865",
      secondaryColor: "#d1d1d1"
    });
    await expect(simulatedUserManagementRepository.getOrganizerBranding("organizer-1", organizerOne)).resolves.toMatchObject({
      collegeName: "CCS Innovation Lab",
      primaryColor: "#766865",
      secondaryColor: "#d1d1d1"
    });
  });
});
