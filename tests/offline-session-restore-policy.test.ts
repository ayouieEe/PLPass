import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

const provider = readFileSync("src/app/providers/DevelopmentSessionProvider.tsx", "utf8");

describe("offline session restoration", () => {
  it("does not collapse a Supabase transport failure into an absent session", () => {
    expect(provider).toContain("if (error) throw error;");
    expect(provider).toContain("if (!data.user) return null;");
    expect(provider).toContain("const offlineSession = await readDesktopOfflineSession();");
  });
});
