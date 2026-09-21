import { describe, expect, it } from "vitest";
import { formatStudentNumber, isStudentNumber } from "@/lib/utils/studentNumber";
import { extractStudentNumber } from "@/lib/credentials/qrCredential";

describe("student number formatting", () => {
  it("formats seven digits as NN-NNNNN", () => {
    expect(formatStudentNumber("2300211")).toBe("23-00211");
    expect(formatStudentNumber("23-00211")).toBe("23-00211");
    expect(isStudentNumber(formatStudentNumber("2300211"))).toBe(true);
  });

  it("normalizes numeric QR input to the canonical student number", () => {
    expect(extractStudentNumber("PLPASS-QR:2300211")).toBe("23-00211");
  });

  it("does not accept incomplete or oversized values", () => {
    expect(isStudentNumber(formatStudentNumber("23-0001"))).toBe(false);
    expect(isStudentNumber(formatStudentNumber("2026-0001"))).toBe(false);
  });
});
