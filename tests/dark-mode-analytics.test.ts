import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

const page = readFileSync("src/features/organizer/pages/OrganizerAnalyticsPage.tsx", "utf8");
const styles = readFileSync("src/index.css", "utf8");

describe("analytics dark-mode compatibility", () => {
  it("marks the analytics surface for scoped theme overrides", () => {
    expect(page).toContain('className="analytics-page space-y-6 pb-12"');
  });

  it("maps legacy light analytics surfaces and text to theme tokens", () => {
    expect(styles).toContain('.dark .analytics-page [class~="bg-white"]');
    expect(styles).toContain('.dark .analytics-page [class~="bg-slate-50/80"]');
    expect(styles).toContain('.dark .analytics-page [class~="text-slate-900"]');
    expect(styles).toContain('.dark [class~="bg-white"][class*="border-slate"]');
    expect(styles).toContain('.dark [class~="text-slate-500"]');
  });
});
