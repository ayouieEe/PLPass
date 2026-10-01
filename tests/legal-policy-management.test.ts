import { describe, expect, it } from "vitest";
import { simulatedLegalDocumentRepository } from "@/test-support/repositories";

describe("legal policy management", () => {
  it("keeps published Terms and Privacy revisions independent", async () => {
    const terms = await simulatedLegalDocumentRepository.getPublished("terms");
    const privacy = await simulatedLegalDocumentRepository.getPublished("privacy");
    const updated = await simulatedLegalDocumentRepository.publish("terms", [{ heading: "Updated", body: "Updated terms" }], terms.version, { actorUserId: "user-admin-1", actorRole: "admin" });
    expect(updated.sections).toEqual([{ heading: "Updated", body: "Updated terms" }]);
    expect(updated.version).not.toBe(terms.version);
    expect((await simulatedLegalDocumentRepository.getPublished("privacy")).version).toBe(privacy.version);
  });

  it("rejects non-admin publishing and invalid sections", async () => {
    const terms = await simulatedLegalDocumentRepository.getPublished("terms");
    await expect(simulatedLegalDocumentRepository.publish("terms", [{ heading: "", body: "body" }], terms.version, { actorUserId: "user-organizer-1", actorRole: "organizer" })).rejects.toMatchObject({ code: "PERMISSION_DENIED" });
    await expect(simulatedLegalDocumentRepository.publish("terms", [{ heading: "", body: "body" }], terms.version, { actorUserId: "user-admin-1", actorRole: "admin" })).rejects.toMatchObject({ code: "VALIDATION_ERROR" });
  });
});
