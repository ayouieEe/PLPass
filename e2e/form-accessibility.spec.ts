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

async function expectConnectedError(control: ReturnType<Page["getByLabel"]>, message: string) {
  await expect(control).toHaveAttribute("aria-invalid", "true");
  const errorId = await control.getAttribute("aria-describedby");
  expect(errorId).toBeTruthy();
  const error = control.page().locator(`#${errorId}`);
  await expect(error).toHaveRole("alert");
  await expect(error).toHaveText(message);
}

test("organizer event validation connects errors to shared fields", async ({ page }) => {
  await seedSession(page, "organizer");
  await page.goto("/organizer/events/create");
  await expect(page.getByRole("heading", { name: "Create Event" })).toBeVisible();
  await page.getByRole("button", { name: "Publish Event" }).click();
  await expectConnectedError(page.getByLabel("Event Name"), "Event title is required");
  await expectConnectedError(page.getByLabel("Category"), "Category is required");
});

test("student correction validation connects a listbox error to its trigger", async ({ page }) => {
  await seedSession(page, "student");
  await page.goto("/student/corrections");
  await page.getByRole("button", { name: "Submit correction request" }).click();
  await expectConnectedError(page.getByRole("button", { name: "Related Attendance Record" }), "Select a related attendance record.");
});

test("student attendance-issue validation connects its error to the explanation", async ({ page }) => {
  await seedSession(page, "student");
  await page.goto("/student/methods");
  await page.getByRole("button", { name: "Report attendance issue" }).click();
  await page.getByRole("button", { name: "Submit report" }).click();
  await expectConnectedError(page.getByLabel("What happened?"), "Explanation must be at least 10 characters.");
});
