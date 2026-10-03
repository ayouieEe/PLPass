import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

const gridSource = readFileSync("src/components/data-display/PLPassDataGrid.tsx", "utf8");
const styles = readFileSync("src/index.css", "utf8");

describe("PLPass data grid filtering transition", () => {
  it("fades removed rows before reflowing the remaining rows", () => {
    expect(gridSource).toContain("animateRows = true");
    expect(gridSource).toContain("setLeavingRowKeys(removedRowKeys)");
    expect(gridSource).toContain("}, 120)");
    expect(gridSource).toContain('"plpass-data-grid-row-exit"');
    expect(styles).toContain("@keyframes plpass-data-grid-row-exit");
  });
});
