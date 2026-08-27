import { expect, test, type Page } from "@playwright/test";

const sessions = {
  student: {
    userId: "user-student-1",
    role: "student",
    displayName: "Student 01",
    email: "student.1@plpass.test",
    isAuthenticated: true,
  },
  organizer: {
    userId: "user-organizer-1",
    role: "organizer",
    displayName: "Organizer One",
    email: "organizer.one@plpass.test",
    isAuthenticated: true,
  },
} as const;

test.describe("high-risk visual regression", () => {
  test.skip(({ browserName }) => browserName !== "chromium", "Chromium owns the canonical visual baselines.");

  test.beforeEach(async ({ page }) => {
    await page.emulateMedia({ reducedMotion: "reduce" });
  });

  test("student dashboard desktop", async ({ page }) => {
    await seedSession(page, sessions.student);
    await page.goto("/student/dashboard");
    await expect(page.getByRole("heading", { name: /Welcome back/i })).toBeVisible();
    await expectStableScreenshot(page, "student-dashboard-desktop.png");
  });

  test("organizer event management desktop", async ({ page }) => {
    await seedSession(page, sessions.organizer);
    await page.goto("/organizer/events");
    await expect(page.getByRole("heading", { name: "Events", exact: true })).toBeVisible();
    await expect(page.getByText("CCS Orientation").first()).toBeVisible();
    await expectStableScreenshot(page, "organizer-events-desktop.png");
  });

  test.describe("mobile", () => {
    test.use({ viewport: { width: 390, height: 844 } });

    for (const [role, path, heading] of [
      ["student", "/student/dashboard", /Welcome back/i],
      ["organizer", "/organizer/dashboard", /^Dashboard$/i],
    ] as const) {
      test(`${role} dashboard mobile`, async ({ page }) => {
        await seedSession(page, sessions[role]);
        await page.goto(path);
        await expect(page.getByRole("heading", { name: heading })).toBeVisible();
        await expect(page.getByRole("button", { name: "Open navigation menu" })).toBeVisible();
        await expectStableScreenshot(page, `${role}-dashboard-mobile.png`);
      });
    }
  });
});

async function seedSession(page: Page, session: (typeof sessions)[keyof typeof sessions]) {
  await page.addInitScript((value) => {
    window.localStorage.clear();
    window.localStorage.setItem("plpass-development-session", JSON.stringify(value));
  }, session);
}

async function expectStableScreenshot(page: Page, name: string) {
  await page.evaluate(() => document.fonts.ready);
  await expect(page).toHaveScreenshot(name, {
    animations: "disabled",
    caret: "hide",
    fullPage: true,
    maxDiffPixelRatio: 0.01,
  });
}
