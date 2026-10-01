import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

const provider = readFileSync("src/app/providers/DevelopmentSessionProvider.tsx", "utf8");

describe("startup session restoration", () => {
  it("does not display a sign-in error before the user attempts to sign in", () => {
    const restoreCatch = provider.slice(
      provider.indexOf("async function restoreSession()"),
      provider.indexOf("const refreshOfflineWork")
    );
    expect(restoreCatch).toContain("setAuthError(undefined);");
    expect(restoreCatch).not.toContain("setAuthError(error instanceof RequestTimeoutError");
  });
});
