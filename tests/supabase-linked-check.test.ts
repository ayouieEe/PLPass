import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

describe("linked Supabase migration check", () => {
  it("normalizes the CLI's formatted remote migration timestamps", () => {
    const source = readFileSync(resolve(process.cwd(), "scripts/check-supabase-linked.mjs"), "utf8");

    expect(source).toContain("function migrationId(value)");
    expect(source).toContain("formattedDate.slice(1).join(\"\")");
    expect(source).toContain("local !== remote");
  });
});
