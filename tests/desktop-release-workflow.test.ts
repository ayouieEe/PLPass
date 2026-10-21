import { existsSync, readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

const read = (path: string) => readFileSync(resolve(process.cwd(), path), "utf8");

describe("desktop release configuration", () => {
  it("builds the installer with GitHub-provided public Supabase configuration and verifies the renderer", () => {
    const workflow = read(".github/workflows/desktop-release.yml");
    const preflight = read("scripts/release-preflight.mjs");

    expect(workflow).toContain("VITE_SUPABASE_URL: ${{ secrets.VITE_SUPABASE_URL }}");
    expect(workflow).toContain("VITE_SUPABASE_PUBLISHABLE_KEY: ${{ secrets.VITE_SUPABASE_PUBLISHABLE_KEY }}");
    expect(workflow).toContain("npm run build:desktop");
    expect(workflow).toContain("npm run check:release -- --production");
    expect(workflow).toContain("npx electron-builder --win nsis --publish never");
    expect(preflight).toContain("checkDesktopSupabaseConfig()");
    expect(preflight).toContain("Desktop renderer is missing the configured Supabase URL or publishable key.");
  });

  it("uses the PLPass Windows icon for the installer and installed application", () => {
    const packageJson = JSON.parse(read("package.json"));

    expect(packageJson.build.win.icon).toBe("build/icon.ico");
    expect(existsSync(resolve(process.cwd(), packageJson.build.win.icon))).toBe(true);
  });
});
