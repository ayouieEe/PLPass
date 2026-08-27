import { defineConfig, devices } from "@playwright/test";

export default defineConfig({
  testDir: "./e2e",
  snapshotPathTemplate: "{testDir}/{testFilePath}-snapshots/{arg}{ext}",
  fullyParallel: true,
  reporter: "list",
  use: {
    baseURL: "http://127.0.0.1:4173",
    trace: "on-first-retry"
  },
  webServer: {
    command: "npm run build && npm run preview -- --host 127.0.0.1",
    url: "http://127.0.0.1:4173",
    reuseExistingServer: !process.env.CI,
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
