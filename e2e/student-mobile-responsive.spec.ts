import { expect, test, type Page } from "@playwright/test";

const studentSession = {
  userId: "user-student-1",
  role: "student",
  displayName: "Student 01",
  email: "student.1@plpass.test",
  isAuthenticated: true
};

const studentRoutes = [
  ["/student", /Welcome back/i],
  ["/student/dashboard", /Welcome back/i],
  ["/student/schedule", "Events"],
  ["/student/events", "Events"],
  ["/student/events/event-5", "PLP Campus Sustainability Series"],
  ["/student/attendance", "Attendance Records"],
  ["/student/methods", "Attendance Methods"],
  ["/student/request-history", "Request History"],
  ["/student/corrections", "Correction Requests"],
  ["/student/profile", "Profile"],
  ["/notifications", "Notifications"]
] as const;

async function seedStudentSession(page: Page) {
  await page.addInitScript((session) => {
    window.localStorage.clear();
    window.localStorage.setItem("plpass-development-session", JSON.stringify(session));
  }, studentSession);
}

async function expectNoHorizontalOverflow(page: Page) {
  const overflow = await page.evaluate(() => document.documentElement.scrollWidth - window.innerWidth);
  expect(overflow).toBeLessThanOrEqual(1);
}

test.describe("student workspace mobile responsiveness", () => {
  test.use({ viewport: { width: 320, height: 800 } });

  test.beforeEach(async ({ page }) => seedStudentSession(page));

  for (const [path, heading] of studentRoutes) {
    test(`${path} fits and remains navigable at 320px`, async ({ page }) => {
      await page.goto(path);
      await expect(page.getByRole("heading", { name: heading, exact: typeof heading === "string" }).first()).toBeVisible();
      await expect(page.getByRole("button", { name: "Open navigation menu" })).toBeVisible();
      await expectNoHorizontalOverflow(page);

      if (path === "/student/profile") {
        const logoutButton = page.getByRole("button", { name: "Logout" });
        await expect(logoutButton).toBeVisible();
        const layout = await logoutButton.evaluate((button) => {
          const bounds = button.getBoundingClientRect();
          return { right: bounds.right, width: bounds.width, viewportWidth: window.innerWidth };
        });
        expect(layout.right).toBeLessThanOrEqual(layout.viewportWidth);
        expect(layout.width).toBeGreaterThan(200);
      }
    });
  }

  test("keeps profile values and feedback choices inside the phone viewport", async ({ page }) => {
    await page.goto("/student/profile");
    const profileFieldValues = page.locator(".student-glass-card .grid > div p");
    for (const value of await profileFieldValues.all()) {
      const layout = await value.evaluate((element) => {
        const bounds = element.getBoundingClientRect();
        return { right: bounds.right, viewportWidth: window.innerWidth, whiteSpace: getComputedStyle(element).whiteSpace };
      });
      expect(layout.right).toBeLessThanOrEqual(layout.viewportWidth);
      expect(layout.whiteSpace).not.toBe("nowrap");
    }
    const profileFields = page.locator(".student-glass-card .grid > div");
    for (const field of await profileFields.all()) {
      const height = await field.evaluate((element) => element.getBoundingClientRect().height);
      expect(height).toBeGreaterThanOrEqual(96);
    }

    await page.goto("/student/events/event-5");
    await page.getByRole("button", { name: "Answer Feedback" }).click();
    const dialog = page.getByRole("dialog");
    await expect(dialog.getByRole("heading", { name: "Share your feedback" })).toBeVisible();
    const choices = dialog.getByRole("button", { name: /: (Needs improvement|Below expectations|Okay|Good|Excellent)/ });
    const choiceCount = await choices.count();
    if (choiceCount === 0) {
      await expect(dialog.getByText("Your ratings")).toBeVisible();
    }
    for (const choice of await choices.all()) {
      const layout = await choice.evaluate((element) => {
        const bounds = element.getBoundingClientRect();
        return { left: bounds.left, right: bounds.right, viewportWidth: window.innerWidth };
      });
      expect(layout.left).toBeGreaterThanOrEqual(0);
      expect(layout.right).toBeLessThanOrEqual(layout.viewportWidth);
    }
    await expectNoHorizontalOverflow(page);
  });

  test("keeps the sign-in form scrollable when a mobile keyboard reduces the visible area", async ({ page }) => {
    await page.goto("/login");
    const layout = await page.locator("main.plpass-auth-scene").evaluate((element) => {
      const style = getComputedStyle(element);
      return { overflowX: style.overflowX, overflowY: style.overflowY };
    });
    expect(layout.overflowX).toBe("hidden");
    expect(layout.overflowY).toBe("auto");
    await expectNoHorizontalOverflow(page);
  });
});
