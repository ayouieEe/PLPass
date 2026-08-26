import { expect, test, type Page } from "@playwright/test";

const sessions = {
  student: {
    userId: "user-student-1",
    role: "student",
    displayName: "Student 01",
    email: "student.1@plpass.test",
    isAuthenticated: true
  },
  organizer: {
    userId: "user-organizer-1",
    role: "organizer",
    displayName: "Organizer One",
    email: "organizer.one@plpass.test",
    isAuthenticated: true
  }
} as const;

async function openWorkspace(page: Page, role: keyof typeof sessions, path: string, heading: RegExp) {
  await page.addInitScript((session) => {
    window.localStorage.clear();
    window.localStorage.setItem("plpass-development-session", JSON.stringify(session));
  }, sessions[role]);
  await page.goto(path);
  await expect(page.getByRole("heading", { name: heading }).first()).toBeVisible();
}

async function expectNoPageOverflow(page: Page) {
  const overflow = await page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth);
  expect(overflow).toBeLessThanOrEqual(1);
}

test.describe("400 percent reflow equivalent", () => {
  test.use({ viewport: { width: 320, height: 800 } });

  for (const [role, path, heading] of [
    ["student", "/student/dashboard", /Welcome back/i],
    ["organizer", "/organizer/dashboard", /^Dashboard$/i]
  ] as const) {
    test(`${role} dashboard remains usable at a 320 CSS-pixel viewport`, async ({ page }) => {
      await openWorkspace(page, role, path, heading);
      await expect(page.getByRole("button", { name: "Open navigation menu" })).toBeVisible();
      await expectNoPageOverflow(page);
    });
  }
});

test.describe("WCAG text spacing overrides", () => {
  for (const [role, path, heading] of [
    ["student", "/student/dashboard", /Welcome back/i],
    ["organizer", "/organizer/events", /^Events$/i]
  ] as const) {
    test(`${role} workspace tolerates increased text spacing`, async ({ page }) => {
      await openWorkspace(page, role, path, heading);
      await page.addStyleTag({
        content: `
          * { letter-spacing: 0.12em !important; line-height: 1.5 !important; word-spacing: 0.16em !important; }
          p { margin-bottom: 2em !important; }
        `
      });
      await expect(page.getByRole("heading", { name: heading }).first()).toBeVisible();
      await expectNoPageOverflow(page);
    });
  }
});

test.describe("forced colors", () => {
  test.skip(({ browserName }) => browserName !== "chromium", "Forced-colors emulation is supported by Chromium.");
  test.use({ forcedColors: "active" });

  for (const [role, path, heading] of [
    ["student", "/student/dashboard", /Welcome back/i],
    ["organizer", "/organizer/dashboard", /^Dashboard$/i]
  ] as const) {
    test(`${role} controls remain available in forced-colors mode`, async ({ page }) => {
      await page.emulateMedia({ forcedColors: "active" });
      await openWorkspace(page, role, path, heading);
      expect(await page.evaluate(() => matchMedia("(forced-colors: active)").matches)).toBe(true);
      const themeButton = page.getByRole("button", { name: "Toggle theme" });
      await expect(themeButton).toBeVisible();
      await themeButton.focus();
      expect(await themeButton.evaluate((element) => getComputedStyle(element).outlineStyle)).not.toBe("none");
      await expect(page.getByRole("link", { name: /Notifications/i })).toBeVisible();
    });
  }
});
