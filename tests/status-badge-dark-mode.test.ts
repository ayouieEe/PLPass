import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

const styles = readFileSync("src/index.css", "utf8");

describe("status badge dark-mode contrast", () => {
  it("uses readable warning text in each theme", () => {
    expect(styles).toMatch(/\.plpass-status-warning\s*\{\s*@apply bg-warning-muted text-warning-foreground;/);
    expect(styles).toMatch(/\.dark \.plpass-status-warning\s*\{\s*@apply text-warning;/);
  });
});
