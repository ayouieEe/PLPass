import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

const read = (path: string) => readFileSync(resolve(process.cwd(), path), "utf8");

describe("priority five organizer credential workflows", () => {
  it("keeps user management authoritative to repository data", () => {
    const source = read("src/features/organizer/pages/OrganizerUserManagement.tsx");
    expect(source).not.toContain("loadOrganizerUiState");
    expect(source).not.toContain("updated locally only");
    expect(source).toContain("useStudentCredentialStatuses");
  });

  it("shows credential records instead of inferring them from enrollment", () => {
    const source = read("src/features/organizer/pages/AuthenticationMethodsPage.tsx");
    expect(source).toContain("credentialMap.get(student.id)?.qrCredential");
    expect(source).toContain("credentialMap.get(student.id)?.facialProfile");
    expect(source).not.toContain('student.status === "enrolled" ? "Active"');
  });

  it("exports the human-readable student number instead of the internal UUID", () => {
    const source = read("src/features/organizer/pages/AuthenticationMethodsPage.tsx");
    expect(source).toContain("studentId: r.studentNumber");
    expect(source).not.toContain("const data: ExportQrCredentialRow[] = filteredQr.map((r) => ({\n        studentId: r.studentId");
    expect(source).not.toContain("const data: ExportFacialProfileRow[] = filteredFacial.map((r) => ({\n        studentId: r.studentId");
  });

  it("uses explicit deactivate/reactivate confirmations without nesting action content", () => {
    const source = read("src/features/organizer/pages/AuthenticationMethodsPage.tsx");
    expect(source).toContain('title: "Deactivate QR credential"');
    expect(source).toContain('title: "Reactivate QR credential"');
    expect(source).toContain('title: "Deactivate facial credential"');
    expect(source).toContain('title: "Reactivate facial credential"');
    expect(source).toContain('confirmLabel: canManage ? (isActive ? "Deactivate" : "Reactivate") : "Close"');
    expect(source).toContain('{activeModal?.type === "facial" && activeModal.title === "Facial enrollment details"');
    expect(source).toContain('{activeModal?.type === "qr" && activeModal.title === "QR credential details"');
  });

  it("keeps QR credentials limited to active/deactivated and preserves the QR confirmation step", () => {
    const source = read("src/features/organizer/pages/AuthenticationMethodsPage.tsx");
    expect(source).toContain('type QRStatus = "Active" | "Deactivated";');
    expect(source).toContain('matchesStatus = false;');
    expect(source).toContain('if (activeModal.title === "QR credential details")');
    expect(source).toContain('if (student.status === "Active") handleDisableQr(student);');
    expect(source).toContain('else handleActivateQr(student);');
    expect(source).toContain('<option value="Pending">Pending</option>');
    expect(read("src/components/modals/ConfirmModal.tsx")).toContain("Children.toArray(children).length > 0");
  });

  it("does not expose facial credential actions while enrollment is pending", () => {
    const source = read("src/features/organizer/pages/AuthenticationMethodsPage.tsx");
    expect(source).toContain('const canToggleFacialStatus = data.status === "Active" || data.status === "Deactivated";');
    expect(source).toContain('if (student.status === "Pending") return;');
    expect(source).toContain('selectedStudentFacialInfo.status === "Active" || selectedStudentFacialInfo.status === "Deactivated"');
    expect(source).toContain('if (student.status === "Pending") {');
  });

  it("loads organizer credential status only for the supplied owned-event participants", () => {
    const source = read("src/services/supabase/repositories.ts");
    expect(source).toContain("async listStudentCredentialStatuses(context, studentIds)");
    expect(source).toContain('qrQuery = qrQuery.in("student_id", scopedStudentIds)');
    expect(source).toContain('facialQuery = facialQuery.in("student_id", scopedStudentIds)');
    expect(source).toContain('from("qr_credentials")');
    expect(source).toContain('from("facial_profiles")');
  });
});
