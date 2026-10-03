import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

const source = readFileSync("src/features/offline/ScannerStationsPanel.tsx", "utf8");

describe("scanner stations layout", () => {
  it("keeps the join code compact and groups its supporting details beside it", () => {
    expect(source).toContain('className="h-32 w-32"');
    expect(source).toContain('flex flex-col justify-center rounded-xl border bg-background p-4 text-center');
    expect(source).toContain('xl:grid-cols-[minmax(0,1fr)_minmax(19rem,0.8fr)]');
    expect(source).toContain('border-warning/30 bg-warning-muted');
  });
});
