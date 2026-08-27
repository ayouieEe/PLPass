import { expect, test, type Page } from "@playwright/test";

const password = "PLPass-Local-Integration-2026!";
const accounts = {
  organizer: "organizer.integration@plpass.local",
  student: "student.integration@plpass.local"
};

async function signIn(page: Page, email: string) {
  await page.goto("/login");
  await page.getByLabel("Email").fill(email);
  await page.getByLabel("Password", { exact: true }).fill(password);
  await page.getByRole("button", { name: "Sign in", exact: true }).click();
}

test("logged-out visitors are returned to sign in", async ({ page }) => {
  await page.goto("/organizer/dashboard");
  await expect(page).toHaveURL(/\/login$/u);
  await expect(page.getByRole("heading", { name: "Sign in to PLPass" })).toBeVisible();
});

test("organizer signs in and sees locally persisted event and request data", async ({ page }) => {
  await signIn(page, accounts.organizer);
  await expect(page).toHaveURL(/\/organizer\/dashboard$/u);
  await expect(page.getByRole("navigation", { name: "organizer navigation" })).toBeVisible();

  await page.goto("/organizer/events");
  await expect(page.getByRole("heading", { name: "Events", exact: true })).toBeVisible();
  await expect(page.getByText("PLPass Local Integration Event", { exact: true })).toBeVisible();

  await page.goto("/organizer/corrections");
  await expect(page.getByRole("heading", { name: "Correction Requests", exact: true, level: 1 })).toBeVisible();
  await expect(page.getByRole("grid", { name: "Correction requests" }).getByText("approved", { exact: true })).toBeVisible();

  await page.goto("/student/dashboard");
  await expect(page).toHaveURL(/\/access-denied$/u);
});

test("student signs in and sees organizer changes through the real backend", async ({ page }) => {
  await signIn(page, accounts.student);
  await expect(page).toHaveURL(/\/student\/dashboard$/u);
  await expect(page.getByRole("navigation", { name: "student navigation" })).toBeVisible();

  await page.goto("/student/events");
  await page.getByRole("button", { name: /Upcoming/i }).click();
  await expect(page.getByText("PLPass Upcoming Student Event", { exact: true })).toBeVisible();

  await page.goto("/student/attendance");
  await expect(page.getByText("PLPass Local Integration Event", { exact: true })).toBeVisible();
  await expect(page.getByText("present", { exact: true })).toBeVisible();

  await page.goto("/student/request-history");
  await expect(page.getByText(/Local integration replacement test/i)).toBeVisible();
  await expect(page.getByText("approved", { exact: true }).first()).toBeVisible();

  await page.goto("/organizer/dashboard");
  await expect(page).toHaveURL(/\/access-denied$/u);
});
