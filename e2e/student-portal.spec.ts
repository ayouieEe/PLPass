import { expect, test, type Page } from "@playwright/test";

async function loginAsStudent(page: Page, accountName = "Student 01") {
  await page.goto("/login");
  await page.getByText(accountName).click();
  await page.getByRole("button", { name: /sign in with selected account/i }).click();
  await expect(page.getByRole("heading", { name: "Student dashboard" })).toBeVisible();
}

async function logoutFromPortal(page: Page, accountName: string) {
  await page.locator("summary").filter({ hasText: accountName }).click();
  await page.getByRole("button", { name: "Logout" }).click();
  await expect(page.getByRole("heading", { name: /sign in to plpass/i })).toBeVisible();
}

test("student can access dashboard and scoped navigation", async ({ page }) => {
  await page.setViewportSize({ width: 1280, height: 900 });
  await loginAsStudent(page);

  const sidebar = page.getByRole("navigation", { name: "student navigation" });
  await expect(sidebar).toBeVisible();
  await expect(sidebar.getByRole("link", { name: "Attendance Records" })).toBeVisible();
  await expect(sidebar.getByRole("link", { name: "NFC Credential" })).toBeVisible();
  await expect(page.getByRole("navigation", { name: "admin navigation" })).toHaveCount(0);
});

test("student attendance tabs and calendar/list views render", async ({ page }) => {
  await page.setViewportSize({ width: 1280, height: 900 });
  await loginAsStudent(page);

  await page.goto("/student/attendance");
  await expect(page.getByRole("heading", { name: "Attendance Records" })).toBeVisible();
  await expect(page.getByText("IT 204")).toBeVisible();
  await page.getByRole("tab", { name: "Events" }).click();
  await expect(page.getByText("EVT-001")).toBeVisible();
  await page.getByRole("button", { name: "Calendar view" }).click();
  await expect(page.getByLabel("Attendance calendar items")).toBeVisible();
});

test("student schedule and details render", async ({ page }) => {
  await page.setViewportSize({ width: 1280, height: 900 });
  await loginAsStudent(page);

  await page.goto("/student/schedule");
  await expect(page.getByRole("heading", { name: "Schedule" })).toBeVisible();
  await expect(page.getByText("IT 204")).toBeVisible();
  await page.getByRole("button", { name: "Calendar view" }).click();
  await expect(page.getByText("EVT-001")).toBeVisible();
});

test("student correction request validates and submits", async ({ page }) => {
  await page.setViewportSize({ width: 1280, height: 900 });
  await loginAsStudent(page);

  await page.goto("/student/corrections");
  await expect(page.getByRole("heading", { name: "Correction Requests", exact: true })).toBeVisible();
  await page.getByRole("button", { name: "Submit correction request" }).click();
  await expect(page.getByText("Select a related attendance record.")).toBeVisible();
  await page.getByLabel("Category, class or event").selectOption("record-1");
  await page.getByLabel("Request type").selectOption("late");
  await page.getByLabel("Explanation").fill("Please correct my recorded attendance status.");
  await page.getByRole("button", { name: "Submit correction request" }).click();
  await expect(page.getByText("correction-created-").or(page.getByText("late").first())).toBeVisible();
});

test("student NFC credential page supports issue request validation and submission", async ({ page }) => {
  await page.setViewportSize({ width: 1280, height: 900 });
  await loginAsStudent(page);

  await page.goto("/student/nfc-credential");
  await expect(page.getByRole("heading", { name: "NFC Credential" })).toBeVisible();
  await expect(page.getByText(/PLP-\*+-001/)).toBeVisible();
  await page.getByRole("button", { name: "Submit NFC issue request" }).click();
  await expect(page.getByText("Reason must be at least 10 characters.")).toBeVisible();
  await page.getByLabel("Replacement request action").selectOption("lost");
  await page.getByLabel("Reason").fill("I lost my NFC sticker after my last class.");
  await page.getByRole("button", { name: "Submit NFC issue request" }).click();
  await expect(page.getByText("lost").first()).toBeVisible();
});

test("student reports and profile render", async ({ page }) => {
  await page.setViewportSize({ width: 1280, height: 900 });
  await loginAsStudent(page);

  await page.goto("/student/reports");
  await expect(page.getByRole("heading", { name: "Report History" })).toBeVisible();
  await expect(page.getByRole("button", { name: "Download PDF" })).toBeDisabled();
  await expect(page.getByText("Student Attendance History")).toBeVisible();

  await page.goto("/student/profile");
  await expect(page.getByRole("heading", { name: "Profile" })).toBeVisible();
  await expect(page.getByText("2026-0001")).toBeVisible();
});

test("mobile student drawer is reachable", async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 840 });
  await loginAsStudent(page);

  await page.getByRole("button", { name: "Open navigation menu" }).click();
  const drawer = page.getByRole("navigation", { name: "student navigation" });
  await expect(drawer).toBeVisible();
  await drawer.getByRole("link", { name: "NFC Credential" }).click();
  await expect(page).toHaveURL(/\/student\/nfc-credential$/);
  await expect(page.getByRole("heading", { name: "NFC Credential" })).toBeVisible();
});

test("second student account stays isolated", async ({ page }) => {
  await page.setViewportSize({ width: 1280, height: 900 });
  await loginAsStudent(page, "Student 02");

  const routes = [
    { path: "/student/dashboard", heading: "Student dashboard" },
    { path: "/student/attendance", heading: "Attendance Records" },
    { path: "/student/schedule", heading: "Schedule" },
    { path: "/student/corrections", heading: "Correction Requests" },
    { path: "/student/nfc-credential", heading: "NFC Credential" },
    { path: "/student/reports", heading: "Report History" },
    { path: "/student/profile", heading: "Profile" }
  ] as const;

  for (const route of routes) {
    await page.goto(route.path);
    await expect(page.getByRole("heading", { name: route.heading, exact: true })).toBeVisible();
  }

  await page.goto("/student/attendance");
  await expect(page.getByText("EVT-001")).toHaveCount(0);
  await logoutFromPortal(page, "Student 02");
});

test("student account switching refreshes scoped data", async ({ page }) => {
  await page.setViewportSize({ width: 1280, height: 900 });
  await loginAsStudent(page, "Student 01");
  await page.goto("/student/attendance");
  await page.getByRole("tab", { name: "Events" }).click();
  await expect(page.getByText("EVT-001")).toBeVisible();
  await logoutFromPortal(page, "Student 01");

  await loginAsStudent(page, "Student 02");
  await page.goto("/student/attendance");
  await page.getByRole("tab", { name: "Events" }).click();
  await expect(page.getByText("EVT-001")).toHaveCount(0);
});
