import { expect, test, type Page } from "@playwright/test";

async function loginAsFaculty(page: Page, accountName = "Faculty One") {
  await page.goto("/login");
  await page.getByText(accountName).click();
  await page.getByRole("button", { name: /sign in with selected account/i }).click();
  await expect(page.getByRole("heading", { name: "Faculty dashboard" })).toBeVisible();
}

async function logoutFromPortal(page: Page, accountName: string) {
  await page.locator("summary").filter({ hasText: accountName }).click();
  await page.getByRole("button", { name: "Logout" }).click();
  await expect(page.getByRole("heading", { name: /sign in to plpass/i })).toBeVisible();
}

test("faculty can access dashboard and scoped navigation", async ({ page }) => {
  await page.setViewportSize({ width: 1280, height: 900 });
  await loginAsFaculty(page);

  const sidebar = page.getByRole("navigation", { name: "faculty navigation" });
  await expect(sidebar).toBeVisible();
  await expect(sidebar.getByRole("link", { name: "My Classes" })).toBeVisible();
  await expect(sidebar.getByRole("link", { name: "Start Session" })).toBeVisible();
  await expect(page.getByRole("navigation", { name: "admin navigation" })).toHaveCount(0);
});

test("faculty can open classes and class details", async ({ page }) => {
  await page.setViewportSize({ width: 1280, height: 900 });
  await loginAsFaculty(page);

  await page.getByRole("navigation", { name: "faculty navigation" }).getByRole("link", { name: "My Classes" }).click();
  await expect(page).toHaveURL(/\/faculty\/classes$/);
  await expect(page.getByRole("heading", { name: "My Classes" })).toBeVisible();
  await expect(page.getByText("IT 204")).toBeVisible();
  await expect(page.getByText("ACC 101")).toHaveCount(0);

  await page.getByRole("link", { name: "View class" }).first().click();
  await expect(page).toHaveURL(/\/faculty\/classes\/class-1$/);
  await expect(page.getByRole("heading", { name: /IT 204/i })).toBeVisible();
  await expect(page.getByRole("tab", { name: "roster" })).toBeVisible();
});

test("faculty start session flow opens active session and can end it", async ({ page }) => {
  await page.setViewportSize({ width: 1280, height: 900 });
  await loginAsFaculty(page);

  await page.goto("/faculty/sessions/start?classId=class-1");
  await expect(page.getByRole("heading", { name: "Start class session" })).toBeVisible();
  await page.getByLabel("Room").fill("Room 302");
  await page.getByRole("button", { name: "Create mock active session" }).click();
  await expect(page).toHaveURL(/\/faculty\/sessions\/session-created-/);
  await expect(page.getByRole("heading", { name: /Active Session/i })).toBeVisible();
  await expect(page.getByText(/Development Simulation for keyboard-style NFC attendance/i)).toBeVisible();
  await page.getByRole("button", { name: "Valid Present scan" }).click();
  await expect(page.getByText("Present").first()).toBeVisible();
  await page.getByRole("button", { name: "Duplicate scan" }).click();
  await expect(page.getByText("Already Recorded").first()).toBeVisible();
  await page.getByRole("button", { name: "Invalid credential scan" }).click();
  await expect(page.getByText("Invalid Sticker").first()).toBeVisible();
  await page.getByRole("button", { name: "Enable" }).click();
  await page.getByRole("button", { name: "Simulate valid QR fallback" }).click();
  await expect(page.getByText(/Method: qr/i).first()).toBeVisible();
  const manualOverride = page.locator('[aria-label="Manual attendance override"]');
  await manualOverride.locator("select").first().selectOption("student-3");
  await manualOverride.locator("select").nth(1).selectOption("NFC reader issue");
  await manualOverride.getByLabel("Remarks").fill("Manual fallback approved during the simulated session.");
  await page.getByRole("button", { name: "Save manual attendance" }).click();
  await expect(page.getByText(/Method: manual/i).first()).toBeVisible();

  await page.getByRole("button", { name: "End Session" }).click();
  await page.locator("select").last().selectOption("Class ended early");
  await page.getByRole("button", { name: "End session", exact: true }).click();
  await expect(page).toHaveURL(/\/faculty\/attendance$/);
  await expect(page.getByRole("heading", { name: "Attendance Records" })).toBeVisible();
});

test("faculty reviews a correction request", async ({ page }) => {
  await page.setViewportSize({ width: 1280, height: 900 });
  await loginAsFaculty(page);

  await page.goto("/faculty/corrections");
  await expect(page.getByRole("heading", { name: "Correction Requests" })).toBeVisible();
  await page.getByRole("button", { name: "Review" }).first().click();
  await expect(page.getByRole("heading", { name: "Review correction request" })).toBeVisible();
  await page.getByRole("button", { name: "Approve", exact: true }).click();
  await expect(page.getByText("approved").first()).toBeVisible();
});

test("faculty analytics and reports render scoped pages", async ({ page }) => {
  await page.setViewportSize({ width: 1280, height: 900 });
  await loginAsFaculty(page);

  await page.goto("/faculty/analytics");
  await expect(page.getByRole("heading", { name: "Analytics and ML" })).toBeVisible();
  await expect(page.getByText("Absenteeism Risk Prediction")).toBeVisible();

  await page.goto("/faculty/reports");
  await expect(page.getByRole("heading", { name: "Reports" })).toBeVisible();
  await expect(page.getByRole("button", { name: "Generate PDF" })).toBeDisabled();
  await expect(page.getByRole("button", { name: "Generate XLSX" })).toBeDisabled();
});

test("mobile faculty drawer is reachable", async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 840 });
  await loginAsFaculty(page);

  await page.getByRole("button", { name: "Open navigation menu" }).click();
  const drawer = page.getByRole("navigation", { name: "faculty navigation" });
  await expect(drawer).toBeVisible();
  await drawer.getByRole("link", { name: "Attendance Records" }).click();
  await expect(page).toHaveURL(/\/faculty\/attendance$/);
  await expect(page.getByRole("heading", { name: "Attendance Records" })).toBeVisible();
});

test("faculty pages avoid horizontal overflow across required widths", async ({ page }) => {
  await page.setViewportSize({ width: 1440, height: 900 });
  await loginAsFaculty(page);

  const routes = [
    { path: "/faculty/dashboard", heading: "Faculty dashboard" },
    { path: "/faculty/classes", heading: "My Classes" },
    { path: "/faculty/classes/class-1", heading: /IT 204/i },
    { path: "/faculty/sessions/start", heading: "Start class session" },
    { path: "/faculty/sessions/session-2", heading: "IT 301 Live Session" },
    { path: "/faculty/attendance", heading: "Attendance Records" },
    { path: "/faculty/corrections", heading: "Correction Requests" },
    { path: "/faculty/reports", heading: "Reports" },
    { path: "/faculty/analytics", heading: "Analytics and ML" }
  ] as const;

  for (const width of [1440, 1280, 1024, 768, 430, 375] as const) {
    await page.setViewportSize({ width, height: 900 });
    for (const route of routes) {
      await page.goto(route.path);
      await expect(page.getByRole("heading", { name: route.heading })).toBeVisible();
      const hasHorizontalOverflow = await page.evaluate(() => document.documentElement.scrollWidth > document.documentElement.clientWidth);
      expect(hasHorizontalOverflow).toBe(false);
    }
  }
});

test("both faculty accounts load every faculty route without leaking data", async ({ page }) => {
  const accounts = [
    {
      name: "Faculty One",
      ownedClass: "class-1",
      ownedSession: "session-2",
      classHeading: /IT 204/i,
      sessionHeading: "IT 301 Live Session",
      visibleClass: "IT 204",
      hiddenClass: "ACC 101"
    },
    {
      name: "Faculty Two",
      ownedClass: "class-3",
      ownedSession: "session-2",
      classHeading: /ACC 101/i,
      sessionHeading: "Session unavailable",
      visibleClass: "ACC 101",
      hiddenClass: "IT 204"
    }
  ] as const;

  for (const account of accounts) {
    await page.setViewportSize({ width: 1280, height: 900 });
    await loginAsFaculty(page, account.name);

    const routes = [
      { path: "/faculty/dashboard", heading: "Faculty dashboard" },
      { path: "/faculty/classes", heading: "My Classes" },
      { path: `/faculty/classes/${account.ownedClass}`, heading: account.classHeading },
      { path: "/faculty/sessions/start", heading: "Start class session" },
      { path: `/faculty/sessions/${account.ownedSession}`, heading: account.sessionHeading },
      { path: "/faculty/attendance", heading: "Attendance Records" },
      { path: "/faculty/corrections", heading: "Correction Requests" },
      { path: "/faculty/reports", heading: "Reports" },
      { path: "/faculty/analytics", heading: "Analytics and ML" },
      { path: "/faculty/profile", heading: "Profile" }
    ] as const;

    for (const route of routes) {
      await page.goto(route.path);
      await expect(
        page.getByRole("heading", {
          name: route.heading,
          exact: typeof route.heading === "string"
        })
      ).toBeVisible();
    }

    await page.goto("/faculty/classes");
    await expect(page.getByText(account.visibleClass)).toBeVisible();
    await expect(page.getByText(account.hiddenClass)).toHaveCount(0);

    await logoutFromPortal(page, account.name);
  }
});

test("faculty account switching refreshes scoped query data", async ({ page }) => {
  await page.setViewportSize({ width: 1280, height: 900 });
  await loginAsFaculty(page, "Faculty One");
  await page.goto("/faculty/classes");
  await expect(page.getByText("IT 204")).toBeVisible();
  await expect(page.getByText("ACC 101")).toHaveCount(0);
  await logoutFromPortal(page, "Faculty One");

  await loginAsFaculty(page, "Faculty Two");
  await page.goto("/faculty/classes");
  await expect(page.getByText("ACC 101")).toBeVisible();
  await expect(page.getByText("IT 204")).toHaveCount(0);
  await page.goto("/faculty/attendance");
  await expect(page.getByRole("heading", { name: "No attendance sessions" })).toBeVisible();
});

test("faculty navigation links do not produce runtime errors", async ({ page }) => {
  const consoleErrors: string[] = [];
  page.on("console", (message) => {
    if (message.type() === "error") {
      consoleErrors.push(message.text());
    }
  });

  await page.setViewportSize({ width: 1280, height: 900 });
  await loginAsFaculty(page, "Faculty Two");
  const sidebar = page.getByRole("navigation", { name: "faculty navigation" });

  for (const label of ["Dashboard", "My Classes", "Start Session", "Attendance Records", "Correction Requests", "Reports", "Analytics and ML", "Profile"]) {
    await sidebar.getByRole("link", { name: label }).click();
    await expect(page.getByRole("heading").first()).toBeVisible();
  }

  expect(consoleErrors).toEqual([]);
});
