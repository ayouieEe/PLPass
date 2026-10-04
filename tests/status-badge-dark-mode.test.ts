import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

const styles = readFileSync("src/index.css", "utf8");

describe("status badge dark-mode contrast", () => {
  it("uses the readable warning token over the dark warning-muted surface", () => {
    expect(styles).toMatch(/\.plpass-status-warning\s*\{\s*@apply bg-warning-muted text-warning;/);
  });
});
