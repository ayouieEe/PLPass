import { describe, expect, it } from "vitest";
import { buildStudentQrPayload, extractStudentNumber, studentIdentityMatchesPayload } from "@/lib/credentials/qrCredential";

describe("student QR payload format", () => {
  it("uses and recognizes the school student number format", () => {
    expect(buildStudentQrPayload(" 23-00001 ")).toBe("23-00001");
    expect(extractStudentNumber("23-00001")).toBe("23-00001");
    expect(extractStudentNumber("PLPASS-QR:23-00001")).toBe("23-00001");
  });

  it("does not treat credential IDs or malformed values as student numbers", () => {
    expect(extractStudentNumber("PLPASS-DEMO-1001")).toBe("");
    expect(extractStudentNumber("2026-0001")).toBe("");
    expect(extractStudentNumber("23-0001")).toBe("");
  });

  it("matches a name and ID inside a formatted school QR payload", () => {
    expect(studentIdentityMatchesPayload(
      "BALBACAL, CHRISHA MAZEL F.[23-00226]BSIT",
      "23-00226",
      "Chrisha Mazel F. Balbacal"
    )).toBe(true);
  });
});
