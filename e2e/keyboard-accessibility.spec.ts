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

async function seedSession(page: Page, role: keyof typeof sessions) {
  await page.addInitScript((session) => {
    window.localStorage.clear();
    window.localStorage.setItem("plpass-development-session", JSON.stringify(session));
  }, sessions[role]);
}

for (const [role, path, heading] of [
  ["student", "/student/dashboard", /Welcome back/i],
  ["organizer", "/organizer/dashboard", /^Dashboard$/i]
] as const) {
  test(`${role} can bypass navigation with the keyboard`, async ({ page, browserName }) => {
    await seedSession(page, role);
    await page.goto(path);
    await expect(page.getByRole("heading", { name: heading }).first()).toBeVisible();

    const skipLink = page.getByRole("link", { name: "Skip to main content" });
    if (browserName === "webkit") {
      // WebKit follows the host macOS full-keyboard-access preference for link tabbing.
      await skipLink.focus();
    } else {
      await page.keyboard.press("Tab");
    }
    await expect(skipLink).toBeFocused();
    await page.keyboard.press("Enter");
    await expect(page.locator("#main-content")).toBeFocused();
  });
}

test("student modal traps focus, closes with Escape, and restores its trigger", async ({ page }) => {
  await seedSession(page, "student");
  await page.goto("/student/dashboard");
  const trigger = page.getByRole("button", { name: "Open pending tasks" });
  await trigger.focus();
  await page.keyboard.press("Enter");

  const dialog = page.getByRole("dialog");
  await expect(dialog).toBeVisible();
  const closeButton = dialog.getByRole("button", { name: "Close modal" });
  await expect(closeButton).toBeFocused();
  await page.keyboard.press("Shift+Tab");
  const lastFocusable = dialog.locator(
    'button:not([disabled]), a[href], input:not([disabled]), select:not([disabled]), textarea:not([disabled]), [tabindex]:not([tabindex="-1"])'
  ).last();
  await expect(lastFocusable).toBeFocused();
  await page.keyboard.press("Escape");
  await expect(dialog).toBeHidden();
  await expect(trigger).toBeFocused();
});

test.describe("mobile keyboard navigation", () => {
  test.use({ viewport: { width: 390, height: 844 } });

  for (const [role, path, heading] of [
    ["student", "/student/dashboard", /Welcome back/i],
    ["organizer", "/organizer/dashboard", /^Dashboard$/i]
  ] as const) {
    test(`${role} drawer traps focus and restores the menu trigger`, async ({ page }) => {
      await seedSession(page, role);
      await page.goto(path);
      await expect(page.getByRole("heading", { name: heading }).first()).toBeVisible();
      const trigger = page.getByRole("button", { name: "Open navigation menu" });
      await trigger.focus();
      await page.keyboard.press("Enter");

      const closeButton = page.getByRole("button", { name: "Close navigation menu" });
      await expect(closeButton).toBeFocused();
      await page.keyboard.press("Escape");
      await expect(closeButton).toBeHidden();
      await expect(trigger).toBeFocused();
    });
  }
});

test.describe("reduced motion", () => {
  test.use({ reducedMotion: "reduce" });

  for (const [role, path, heading] of [
    ["student", "/student/dashboard", /Welcome back/i],
    ["organizer", "/organizer/dashboard", /^Dashboard$/i]
  ] as const) {
    test(`${role} workspace honors the operating-system motion preference`, async ({ page }) => {
      await seedSession(page, role);
      await page.emulateMedia({ reducedMotion: "reduce" });
      await page.goto(path);
      await expect(page.getByRole("heading", { name: heading }).first()).toBeVisible();

      const result = await page.locator("#main-content").evaluate((element) => {
        const toMilliseconds = (duration: string) =>
          duration.endsWith("ms") ? Number.parseFloat(duration) : Number.parseFloat(duration) * 1_000;
        const style = getComputedStyle(element);
        return {
          preferenceMatches: window.matchMedia("(prefers-reduced-motion: reduce)").matches,
          animationDurationMs: toMilliseconds(style.animationDuration),
          transitionDurationMs: toMilliseconds(style.transitionDuration)
        };
      });
      expect(result.preferenceMatches).toBe(true);
      expect(result.animationDurationMs).toBeLessThanOrEqual(0.001);
      expect(result.transitionDurationMs).toBeLessThanOrEqual(0.001);
    });
  }
});
