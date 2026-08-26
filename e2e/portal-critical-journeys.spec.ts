import { expect, test, type Page } from "@playwright/test";

const studentSession = {
  userId: "user-student-1",
  role: "student",
  displayName: "Student 01",
  email: "student.1@plpass.test",
  isAuthenticated: true
};

const organizerSession = {
  userId: "user-organizer-1",
  role: "organizer",
  displayName: "Organizer One",
  email: "organizer.one@plpass.test",
  isAuthenticated: true
};

async function seedSession(page: Page, session: typeof studentSession | typeof organizerSession) {
  await page.addInitScript((value) => {
    window.localStorage.clear();
    window.localStorage.setItem("plpass-development-session", JSON.stringify(value));
  }, session);
}

async function expectBasicPageStructure(page: Page) {
  await expect(page.locator("main")).toBeVisible();
  await expect(page.locator("h1")).toHaveCount(1);
  const duplicateIds = await page.evaluate(() => {
    const ids = [...document.querySelectorAll<HTMLElement>("[id]")].map((element) => element.id);
    return ids.filter((id, index) => id && ids.indexOf(id) !== index);
  });
  expect(duplicateIds).toEqual([]);
}

test.describe("student critical journeys", () => {
  test.beforeEach(async ({ page }) => seedSession(page, studentSession));

  test("opens dashboard tasks and attendance details", async ({ page }) => {
    await page.goto("/student/dashboard");
    await expect(page.getByRole("heading", { name: /Welcome back/i })).toBeVisible();
    await expect(page.getByRole("navigation", { name: "student navigation" })).toBeVisible();
    await page.getByRole("button", { name: "Open pending tasks" }).click();
    await expect(page.getByRole("dialog").getByRole("heading", { name: "Pending Tasks" })).toBeVisible();

    await page.goto("/student/attendance?status=feedback-due&focus=event-5");
    await expect(page.getByRole("heading", { name: "Attendance Records", exact: true })).toBeVisible();
    const detail = page.getByRole("dialog");
    await expect(detail.getByRole("heading", { name: "PLP Campus Sustainability Series" })).toBeVisible();
    await expect(detail.getByRole("button", { name: "Answer Feedback" })).toBeVisible();
  });

  test("loads every primary student workspace", async ({ page }) => {
    for (const [path, heading] of [
      ["/student/attendance", "Attendance Records"],
      ["/student/schedule", "Events"],
      ["/student/methods", "Attendance Methods"],
      ["/student/request-history", "Request History"],
      ["/student/corrections", "Correction Requests"],
      ["/student/profile", "Profile"]
    ] as const) {
      await page.goto(path);
      await expect(page.getByRole("heading", { name: heading, exact: true })).toBeVisible();
      await expectBasicPageStructure(page);
    }
  });

  test("cannot enter an organizer workspace", async ({ page }) => {
    await page.goto("/organizer/events");
    await expect(page.getByRole("heading", { name: "Access denied" })).toBeVisible();
  });
});

test.describe("organizer critical journeys", () => {
  test.beforeEach(async ({ page }) => seedSession(page, organizerSession));

  test("loads management and analytics workspaces", async ({ page }) => {
    await page.goto("/organizer/dashboard");
    await expect(page.getByRole("heading", { name: "Dashboard", exact: true })).toBeVisible();
    await expect(page.getByRole("navigation", { name: "organizer navigation" })).toBeVisible();

    await page.goto("/organizer/events");
    await expect(page.getByRole("heading", { name: "Events", exact: true })).toBeVisible();
    await expect(page.getByText("CCS Orientation").first()).toBeVisible();

    await page.goto("/organizer/analytics");
    await expect(page.getByRole("heading", { name: "Event Attendance Prediction" })).toBeVisible();
    await expect(page.getByRole("button", { name: /Attendance Trends/i })).toBeVisible();
    await expect(page.getByRole("button", { name: /Feedback & Sentiment/i })).toBeVisible();
    await expect(page.getByRole("button", { name: /Late Arrival Patterns/i })).toBeVisible();
  });

  test("validates event publishing and opens report credentials", async ({ page }) => {
    await page.goto("/organizer/events/create");
    await expect(page.getByRole("heading", { name: "Create Event" })).toBeVisible();
    await page.getByRole("button", { name: "Publish Event" }).click();
    await expect(page.getByText("Select at least one participant.")).toBeVisible();

    await page.goto("/organizer/reports");
    await page.getByRole("button", { name: /view qr/i }).first().click();
    await expect(page.getByRole("dialog", { name: /qr credential details/i })).toBeVisible();
  });

  test("loads correction controls", async ({ page }) => {
    await page.goto("/organizer/corrections");
    await expect(page.getByRole("heading", { name: "Correction Requests", exact: true })).toBeVisible();
    for (const name of [/^all$/i, /pending/i, /approved/i, /rejected/i]) {
      await expect(page.getByRole("button", { name })).toBeVisible();
    }
    await expectBasicPageStructure(page);
  });
});

test.describe("mobile and accessibility smoke", () => {
  test.use({ viewport: { width: 390, height: 844 } });

  for (const [role, session, path, heading] of [
    ["student", studentSession, "/student/dashboard", /Welcome back/i],
    ["organizer", organizerSession, "/organizer/dashboard", /^Dashboard$/i]
  ] as const) {
    test(`${role} navigation works without horizontal overflow`, async ({ page }) => {
      await seedSession(page, session);
      await page.goto(path);
      await expect(page.getByRole("heading", { name: heading })).toBeVisible();
      await expect(page.getByRole("button", { name: "Open navigation menu" })).toBeVisible();
      await page.getByRole("button", { name: "Open navigation menu" }).click();
      await expect(page.getByRole("button", { name: "Close navigation menu" })).toBeVisible();
      await expectBasicPageStructure(page);

      const overflow = await page.evaluate(() => document.documentElement.scrollWidth - window.innerWidth);
      expect(overflow).toBeLessThanOrEqual(1);
    });
  }
});
