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

test("organizer participant failure is announced without relying on a toast", async ({ page }) => {
  await seedSession(page, "organizer");
  await page.goto("/organizer/events/create");
  await page.getByRole("button", { name: "Publish Event" }).click();
  const participantAlert = page.getByRole("alert").filter({ hasText: "Select at least one participant." });
  await expect(participantAlert).toBeVisible();
  await expect(participantAlert).toHaveAttribute("aria-live", "assertive");
});

test("student correction success remains available as an inline status", async ({ page }) => {
  await seedSession(page, "student");
  await page.goto("/student/corrections");
  const recordTrigger = page.getByRole("button", { name: "Related Attendance Record" });
  await recordTrigger.click();
  await page.getByRole("option", { name: /Business Forum.*absent/i }).click();
  await page.getByLabel("Reason & Explanation").fill("I attended the event but my attendance was not recorded correctly.");
  await page.getByRole("button", { name: "Submit correction request" }).click();

  const success = page.getByRole("status").filter({ hasText: "Correction request submitted successfully." });
  await expect(success).toBeVisible();
  await expect(page.getByRole("button", { name: "Submit correction request" })).toBeEnabled();
});
