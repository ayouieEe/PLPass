import { defineConfig, devices } from "@playwright/test";

const localUrl = process.env.LOCAL_SUPABASE_URL;
const localPublishableKey = process.env.LOCAL_SUPABASE_PUBLISHABLE_KEY;

if (!localUrl || !localPublishableKey || !process.env.LOCAL_SUPABASE_SECRET_KEY) {
  throw new Error("Local Supabase URL, publishable key, and secret key are required.");
}

if (!/^https?:\/\/(127\.0\.0\.1|localhost)(:\d+)?$/u.test(localUrl)) {
  throw new Error(`Refusing to run browser integration tests against non-local URL: ${localUrl}`);
}

export default defineConfig({
  testDir: "./e2e-supabase",
  fullyParallel: false,
  workers: 1,
  reporter: "list",
  globalSetup: "./e2e-supabase/global-setup.ts",
  use: {
    baseURL: "http://127.0.0.1:4174",
    trace: "retain-on-failure",
    screenshot: "only-on-failure"
  },
  webServer: {
    command: "npm run build && npm run preview -- --host 127.0.0.1 --port 4174",
    url: "http://127.0.0.1:4174",
    reuseExistingServer: false,
    env: {
      ...process.env,
      VITE_DATA_SOURCE: "supabase",
      VITE_SUPABASE_URL: localUrl,
      VITE_SUPABASE_PUBLISHABLE_KEY: localPublishableKey
    }
  },
  projects: [
    { name: "chromium", use: { ...devices["Desktop Chrome"] } },
    { name: "firefox", use: { ...devices["Desktop Firefox"] } },
    { name: "webkit", use: { ...devices["Desktop Safari"] } }
  ]
});
