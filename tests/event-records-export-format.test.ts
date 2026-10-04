import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

const source = readFileSync("src/features/organizer/pages/EventRecordsPage.tsx", "utf8");

describe("Event Records export format selection", () => {
  it("uses the shared animated theme-aware format controls", () => {
    expect(source).toContain('import { ReportFormatOption } from "@/components/exports/ReportFormatOption"');
    expect(source).toContain('<ReportFormatOption format="xlsx" selectedFormat={exportFormat} onSelect={setExportFormat}');
    expect(source).toContain('<ReportFormatOption format="pdf" selectedFormat={exportFormat} onSelect={setExportFormat}');
  });
});
