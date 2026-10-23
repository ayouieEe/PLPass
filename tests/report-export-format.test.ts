import { describe, expect, it } from "vitest";
import { fitPdfChartSize, institutionHeader, scoreCardColor } from "@/lib/exports/reportExport";

describe("report export header", () => {
  it("keeps university-admin exports institution-wide", () => {
    expect(institutionHeader({ plpLogoUrl: "/plp-institution-logo.png", systemName: "PLPass", collegeName: "International Hospitality Management Department" }, { schoolYear: "2026-2027" }, "admin")).toEqual([
      "PAMANTASAN NG LUNGSOD NG PASIG",
      "SCHOOL YEAR 2026-2027"
    ]);
  });

  it("removes the unnecessary department suffix for scoped exports", () => {
    expect(institutionHeader({ plpLogoUrl: "/plp-institution-logo.png", systemName: "PLPass", collegeName: "International Hospitality Management Department" }, { schoolYear: "2026-2027" }, "department_admin")).toEqual([
      "PAMANTASAN NG LUNGSOD NG PASIG",
      "COLLEGE OF INTERNATIONAL HOSPITALITY MANAGEMENT",
      "SCHOOL YEAR 2026-2027"
    ]);
  });

  it("fits generated chart dimensions inside the printable PDF area", () => {
    const size = fitPdfChartSize(580, 280, 269, 95);
    expect(size.width).toBeCloseTo(196.7857, 3);
    expect(size.height).toBe(95);
  });

  it("uses clear green, yellow, and red score-card colors", () => {
    expect(scoreCardColor(8, 9).accent).toEqual([22, 128, 61]);
    expect(scoreCardColor(6, 9).accent).toEqual([217, 119, 6]);
    expect(scoreCardColor(5, 9).accent).toEqual([220, 38, 38]);
  });
});
