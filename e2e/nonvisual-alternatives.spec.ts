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

test("organizer dashboard exposes chart values as readable summaries", async ({ page }) => {
  await seedSession(page, "organizer");
  await page.goto("/organizer/dashboard");
  await expect(page.getByRole("heading", { name: "Dashboard", exact: true })).toBeVisible();

  const summaries = page.locator("[data-chart-summary]");
  await expect(summaries).toHaveCount(1);
  await expect(summaries).toContainText("Prediction chart data:");
  await expect(summaries).toContainText("Attendance trend chart data:");
  await expect(summaries).toContainText("Feedback sentiment chart data:");
  await expect(summaries).toContainText("Late-arrival chart data:");
});

test("student QR credential has a named image and equivalent instructions", async ({ page }) => {
  await seedSession(page, "student");
  await page.goto("/student/methods");
  await expect(page.getByRole("heading", { name: "Attendance Methods" })).toBeVisible();
  await expect(page.getByRole("img", { name: /PLPass student QR credential/i })).toBeVisible();
  await expect(page.getByText("Use this for Time In and Time Out scans when attending onsite events.")).toBeVisible();
  await expect(page.getByText("Let the organizer scan your QR.", { exact: false })).toBeVisible();
});
