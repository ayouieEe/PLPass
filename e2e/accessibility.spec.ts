import AxeBuilder from "@axe-core/playwright";
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

async function expectNoWcagViolations(page: Page) {
  await page.evaluate(() => {
    for (const animation of document.getAnimations()) {
      if (animation.effect?.getTiming().iterations !== Infinity) {
        try {
          animation.finish();
        } catch {
          // Some browser-managed transitions cannot be finished manually.
        }
      }
    }
  });
  const results = await new AxeBuilder({ page })
    .withTags(["wcag2a", "wcag2aa", "wcag21a", "wcag21aa"])
    .analyze();

  const violations = results.violations.map(({ id, impact, help, nodes }) => ({
    id,
    impact,
    help,
    nodes: nodes.slice(0, 8).map((node) => ({
      target: node.target.join(" "),
      html: node.html,
      reason: node.failureSummary
    }))
  }));
  expect(violations).toEqual([]);
}

test.describe("automated WCAG 2.1 AA smoke", () => {
  test("student dashboard", async ({ page }) => {
    await openWorkspace(page, "student", "/student/dashboard", /Welcome back/i);
    await expectNoWcagViolations(page);
  });

  test("student attendance", async ({ page }) => {
    await openWorkspace(page, "student", "/student/attendance", /^Attendance Records$/i);
    await expectNoWcagViolations(page);
  });

  test("organizer dashboard", async ({ page }) => {
    await openWorkspace(page, "organizer", "/organizer/dashboard", /^Dashboard$/i);
    await expectNoWcagViolations(page);
  });

  test("organizer event management", async ({ page }) => {
    await openWorkspace(page, "organizer", "/organizer/events", /^Events$/i);
    await expect(page.getByText("CCS Orientation").first()).toBeVisible();
    await expectNoWcagViolations(page);
  });
});

test.describe("mobile WCAG 2.1 AA smoke", () => {
  test.use({ viewport: { width: 390, height: 844 } });

  test("student dashboard", async ({ page }) => {
    await openWorkspace(page, "student", "/student/dashboard", /Welcome back/i);
    await expectNoWcagViolations(page);
  });

  test("organizer dashboard", async ({ page }) => {
    await openWorkspace(page, "organizer", "/organizer/dashboard", /^Dashboard$/i);
    await expectNoWcagViolations(page);
  });
});
