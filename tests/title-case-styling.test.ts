import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

const stylesheet = readFileSync("src/index.css", "utf8");

describe("heading title case styling", () => {
  it("formats standard headings while allowing intentional casing to be preserved", () => {
    expect(stylesheet).toMatch(/h1,\s+h2,\s+h3,\s+h4\s*{\s*text-transform: capitalize;/);
    expect(stylesheet).toMatch(/\[data-title-case="preserve"\]\s*{\s*text-transform: none;/);
  });
});
