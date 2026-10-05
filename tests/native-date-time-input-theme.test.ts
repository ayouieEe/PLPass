import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

const styles = readFileSync("src/index.css", "utf8");

describe("native date and time input theming", () => {
  it("uses the browser's dark controls for themed PLPass fields", () => {
    expect(styles).toContain('input.plpass-field[type="date"]');
    expect(styles).toContain('input.plpass-field[type="time"]');
    expect(styles).toContain("color-scheme: dark;");
  });
});
