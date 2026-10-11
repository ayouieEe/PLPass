import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

const gridSource = readFileSync("src/components/data-display/PLPassDataGrid.tsx", "utf8");
const styles = readFileSync("src/index.css", "utf8");

describe("PLPass data grid filtering transition", () => {
  it("uses the shared thin scrollbar width for grid layout and native tracks", () => {
    expect(gridSource).toContain("const SCROLLBAR_WIDTH = 7");
    expect(gridSource).toContain("scrollbarWidth={SCROLLBAR_WIDTH}");
    expect(gridSource).toContain('"w-full overflow-hidden"');
    expect(gridSource).not.toContain('"w-full overflow-x-auto"');
    expect(styles).toContain("--plpass-scrollbar-size: 0.45rem");
    expect(styles).toContain(".ag-body-horizontal-scroll-viewport::-webkit-scrollbar-button");
    expect(styles).toMatch(/\.ag-horizontal-left-spacer,[\s\S]*?overflow-x: hidden;/);
  });

  it("fades removed rows before reflowing the remaining rows", () => {
    expect(gridSource).toContain("animateRows = true");
    expect(gridSource).toContain("setLeavingRowKeys(removedRowKeys)");
    expect(gridSource).toContain("}, 120)");
    expect(gridSource).toContain('"plpass-data-grid-row-exit"');
    expect(styles).toContain("@keyframes plpass-data-grid-row-exit");
  });
});
