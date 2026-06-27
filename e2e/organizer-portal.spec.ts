import { expect, test, type Page } from "@playwright/test";

async function loginAsOrganizer(page: Page, accountName = "Organizer One") {
  await page.goto("/login");
  await page.getByText(accountName).click();
  await page.getByRole("button", { name: /sign in with selected account/i }).click();
  await expect(page.getByRole("heading", { name: "Organizer dashboard" })).toBeVisible();
}

async function logoutFromPortal(page: Page, accountName: string) {
  await page.locator("summary").filter({ hasText: accountName }).click();
  await page.getByRole("button", { name: "Logout" }).click();
  await expect(page.getByRole("heading", { name: /sign in to plpass/i })).toBeVisible();
}

test("organizer can access dashboard and scoped navigation", async ({ page }) => {
  await page.setViewportSize({ width: 1280, height: 900 });
  await loginAsOrganizer(page);

  const sidebar = page.getByRole("navigation", { name: "organizer navigation" });
  await expect(sidebar).toBeVisible();
  await expect(sidebar.getByRole("link", { name: "Events" })).toBeVisible();
  await expect(sidebar.getByRole("link", { name: "Create Session" })).toBeVisible();
  await expect(page.getByRole("navigation", { name: "admin navigation" })).toHaveCount(0);
});

test("organizer can open events and event details", async ({ page }) => {
  await page.setViewportSize({ width: 1280, height: 900 });
  await loginAsOrganizer(page);

  await page.goto("/organizer/events");
  await expect(page.getByRole("heading", { name: "Events" })).toBeVisible();
  await expect(page.getByText("CCS Orientation")).toBeVisible();
  await expect(page.getByText("Business Forum")).toHaveCount(0);

  await page.getByRole("link", { name: "View event" }).first().click();
  await expect(page).toHaveURL(/\/organizer\/events\/event-1$/);
  await expect(page.getByRole("heading", { name: /EVT-001/i })).toBeVisible();
  await expect(page.getByRole("button", { name: "participants" })).toBeVisible();
});

test("organizer create event form validates participant selection", async ({ page }) => {
  await page.setViewportSize({ width: 1280, height: 900 });
  await loginAsOrganizer(page);

  await page.goto("/organizer/events/create");
  await expect(page.getByRole("heading", { name: "Create Event" })).toBeVisible();
  await page.getByRole("button", { name: "Create pending event" }).click();
  await expect(page.getByText("Event code is required.")).toBeVisible();
  await expect(page.getByText("Select at least one participant.")).toBeVisible();
});

test("organizer can create an event, start a session, and end it", async ({ page }) => {
  await page.setViewportSize({ width: 1280, height: 900 });
  await loginAsOrganizer(page);

  await page.goto("/organizer/events/create");
  await page.getByLabel("Event code").fill("EVT-E2E");
  await page.getByLabel("Event name").fill("E2E Mock Event");
  await page.getByLabel("Category").fill("Forum");
  await page.getByLabel("Venue").fill("Main Hall");
  await page.getByLabel("Date").fill("2026-07-20");
  await page.getByLabel("Start time").fill("09:00");
  await page.getByLabel("End time").fill("10:00");
  await page.getByRole("button", { name: "Select all filtered students" }).click();
  await page.getByRole("button", { name: "Create pending event" }).click();
  await expect(page).toHaveURL(/\/organizer\/events\/event-created-/);
  await expect(page.getByRole("heading", { name: /EVT-E2E/i })).toBeVisible();

  await page.getByRole("button", { name: "Start mock event session" }).click();
  await expect(page).toHaveURL(/\/organizer\/sessions\/session-created-/);
  await expect(page.getByRole("heading", { name: "E2E Mock Event", exact: true })).toBeVisible();
  await expect(page.getByText(/Development Simulation for keyboard-style NFC attendance/i)).toBeVisible();
  await page.getByRole("button", { name: "Valid Present scan" }).click();
  await expect(page.getByText("Present").first()).toBeVisible();
  const manualOverride = page.locator('[aria-label="Manual attendance override"]');
  await manualOverride.locator("select").first().selectOption("student-1");
  await manualOverride.locator("select").nth(1).selectOption("Approved by faculty");
  await manualOverride.getByLabel("Remarks").fill("Organizer accepted a manual fallback during simulation.");
  await page.getByRole("button", { name: "Save manual attendance" }).click();
  await expect(page.getByText(/Method: manual/i).first()).toBeVisible();

  await page.getByRole("button", { name: "End Session" }).click();
  await page.locator("select").last().selectOption("Event ended early");
  await page.getByRole("button", { name: "End session", exact: true }).click();
  await expect(page).toHaveURL(/\/organizer\/records$/);
  await expect(page.getByRole("heading", { name: "Event Records" })).toBeVisible();
});

test("organizer records, reports, and analytics render scoped pages", async ({ page }) => {
  await page.setViewportSize({ width: 1280, height: 900 });
  await loginAsOrganizer(page);

  await page.goto("/organizer/records");
  await expect(page.getByRole("heading", { name: "Event Records" })).toBeVisible();
  await expect(page.getByText("Correction Request Review")).toBeVisible();

  await page.goto("/organizer/reports");
  await expect(page.getByRole("heading", { name: "Reports" })).toBeVisible();
  await expect(page.getByRole("button", { name: "Generate PDF" })).toBeDisabled();
  await expect(page.getByRole("button", { name: "Generate XLSX" })).toBeDisabled();

  await page.goto("/organizer/analytics");
  await expect(page.getByRole("heading", { name: "Analytics and ML" })).toBeVisible();
  await expect(page.getByText("Absenteeism Risk Prediction")).toBeVisible();
});

test("mobile organizer drawer is reachable", async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 840 });
  await loginAsOrganizer(page);

  await page.getByRole("button", { name: "Open navigation menu" }).click();
  const drawer = page.getByRole("navigation", { name: "organizer navigation" });
  await expect(drawer).toBeVisible();
  await drawer.getByRole("link", { name: "Event Records" }).click();
  await expect(page).toHaveURL(/\/organizer\/records$/);
  await expect(page.getByRole("heading", { name: "Event Records" })).toBeVisible();
});

test("second organizer account stays isolated across routes", async ({ page }) => {
  await page.setViewportSize({ width: 1280, height: 900 });
  await loginAsOrganizer(page, "Organizer Two");

  const routes = [
    { path: "/organizer/dashboard", heading: "Organizer dashboard" },
    { path: "/organizer/events", heading: "Events" },
    { path: "/organizer/events/event-2", heading: /EVT-002/i },
    { path: "/organizer/sessions/session-4", heading: "Session unavailable" },
    { path: "/organizer/records", heading: "Event Records" },
    { path: "/organizer/reports", heading: "Reports" },
    { path: "/organizer/analytics", heading: "Analytics and ML" },
    { path: "/organizer/profile", heading: "Profile" }
  ] as const;

  for (const route of routes) {
    await page.goto(route.path);
    await expect(page.getByRole("heading", { name: route.heading, exact: typeof route.heading === "string" })).toBeVisible();
  }

  await page.goto("/organizer/events");
  await expect(page.getByText("Business Forum")).toBeVisible();
  await expect(page.getByText("CCS Orientation")).toHaveCount(0);

  await logoutFromPortal(page, "Organizer Two");
});

test("organizer account switching refreshes scoped query data", async ({ page }) => {
  await page.setViewportSize({ width: 1280, height: 900 });
  await loginAsOrganizer(page, "Organizer One");
  await page.goto("/organizer/events");
  await expect(page.getByText("CCS Orientation")).toBeVisible();
  await expect(page.getByText("Business Forum")).toHaveCount(0);
  await logoutFromPortal(page, "Organizer One");

  await loginAsOrganizer(page, "Organizer Two");
  await page.goto("/organizer/events");
  await expect(page.getByText("Business Forum")).toBeVisible();
  await expect(page.getByText("CCS Orientation")).toHaveCount(0);
});
