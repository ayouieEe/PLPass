import { defineConfig, devices } from "@playwright/test";

// Keep the test server separate from the desktop/dev preview port. Reusing a
// running server can silently run the mock E2E suite against staging instead.
const testServerPort = process.env.PLAYWRIGHT_TEST_PORT ?? "4174";
const testServerUrl = `http://127.0.0.1:${testServerPort}`;

export default defineConfig({
  testDir: "./e2e",
  snapshotPathTemplate: "{testDir}/{testFilePath}-snapshots/{arg}{ext}",
  fullyParallel: true,
  reporter: "list",
  retries: process.env.CI ? 2 : 0,
  workers: process.env.CI ? 2 : undefined,
  expect: { timeout: 15000 },
  use: {
    baseURL: testServerUrl,
    trace: "on-first-retry"
  },
  webServer: {
    command: `npm run build && npm run preview -- --host 127.0.0.1 --port ${testServerPort}`,
    url: testServerUrl,
    reuseExistingServer: process.env.PLAYWRIGHT_REUSE_EXISTING_SERVER === "true",
    timeout: 120 * 1000,
    env: {
      ...process.env,
      VITE_DATA_SOURCE: "mock"
    }
  },
  projects: [
    {
      name: "chromium",
      testIgnore: /visual-regression\.spec\.ts/,
      use: { ...devices["Desktop Chrome"] }
    },
    {
      name: "firefox",
      testIgnore: /visual-regression\.spec\.ts/,
      use: { ...devices["Desktop Firefox"] }
    },
    {
      name: "webkit",
      testIgnore: /visual-regression\.spec\.ts/,
      use: { ...devices["Desktop Safari"] }
    },
    {
      name: "visual-chromium",
      testMatch: /visual-regression\.spec\.ts/,
      use: { ...devices["Desktop Chrome"] }
    }
  ]
});
