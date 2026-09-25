import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

const styles = readFileSync("src/index.css", "utf8");

describe("dark-mode data grids", () => {
  it("uses theme surfaces and foreground colors for shared grids", () => {
    expect(styles).toContain(".ag-theme-plpass .ag-root");
    expect(styles).toContain(".ag-theme-plpass .ag-body-viewport");
    expect(styles).toContain("background-color: hsl(var(--surface)) !important;");
    expect(styles).toContain("color: hsl(var(--foreground)) !important;");
  });

  it("keeps the live attendance grid dark-mode compatible", () => {
    expect(styles).toContain(".live-attendance-grid .ag-root-wrapper");
    expect(styles).toContain(".live-attendance-grid .ag-header");
  });
});
