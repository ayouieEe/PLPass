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

  it("uses semantic tokens for the four overview cards", () => {
    expect(page).toContain('rounded-xl border border-border bg-surface p-4');
    expect(page).toContain('bg-info-muted text-info');
    expect(page).toContain('bg-success-muted text-success');
    expect(page).toContain('bg-warning-muted text-warning');
    expect(page).toContain('bg-primary/10 text-primary');
  });

  it("uses semantic tokens for prediction-factor panels", () => {
    expect(page).toContain('hover:bg-surface-muted');
    expect(page).toContain('border-info/30 bg-info-muted text-info');
    expect(page).toContain('border-border bg-surface-muted text-muted-foreground');
    expect(page).toContain('ChevronDown className="h-5 w-5 text-muted-foreground"');
    expect(page).toContain('border-t border-primary/10 bg-surface');
  });
});
