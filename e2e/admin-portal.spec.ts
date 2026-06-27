import { expect, test, type Page } from "@playwright/test";

async function loginAsAdmin(page: Page) {
  await page.goto("/login");
  await page.getByText("Admin One").click();
  await page.getByRole("button", { name: /sign in with selected account/i }).click();
  await expect(page.getByRole("heading", { name: "Admin dashboard" })).toBeVisible();
}

test("admin can open required admin portal routes", async ({ page }) => {
  await page.setViewportSize({ width: 1280, height: 900 });
  await loginAsAdmin(page);

  for (const [path, heading] of [
    ["/admin/users", "Users and roles"],
    ["/admin/academic", "Academic management"],
    ["/admin/attendance", "Attendance monitoring"],
    ["/admin/nfc-credentials", "Authentication methods"],
    ["/admin/nfc-readers", "NFC readers"],
    ["/admin/reports", "Reports"],
    ["/admin/analytics", "Analytics"],
    ["/admin/audit-logs", "Audit logs"],
    ["/admin/settings", "System settings"]
  ] as const) {
    await page.goto(path);
    await expect(page.getByRole("heading", { name: heading })).toBeVisible();
  }
});

test("desktop admin sidebar shows required links and active state", async ({ page }) => {
  await page.setViewportSize({ width: 1280, height: 900 });
  await loginAsAdmin(page);

  const sidebar = page.getByRole("navigation", { name: "admin navigation" });
  await expect(sidebar).toBeVisible();

  for (const label of [
    "Dashboard",
    "User Management",
    "Academic Management",
    "Attendance Records",
    "NFC Credentials",
    "NFC Readers",
    "Reports",
    "Analytics and ML",
    "Audit Logs",
    "System Settings"
  ]) {
    await expect(sidebar.getByRole("link", { name: label })).toBeVisible();
  }

  await sidebar.getByRole("link", { name: "User Management" }).click();
  await expect(page).toHaveURL(/\/admin\/users$/);
  await expect(page.getByRole("heading", { name: "Users and roles" })).toBeVisible();
  await expect(sidebar.getByRole("link", { name: "User Management" })).toHaveAttribute("aria-current", "page");
  await expect(page.getByRole("link", { name: "Components" })).toHaveCount(0);
  await expect(page.getByRole("link", { name: "My area" })).toHaveCount(0);
});

test("component preview remains development-only and outside normal navigation", async ({ page }) => {
  await page.goto("/components");

  await expect(page.getByRole("heading", { name: "PLPass Component Library" })).toBeVisible();
  await expect(page.getByText(/Internal component preview only/i)).toBeVisible();
  await expect(page.getByRole("navigation", { name: "faculty navigation" })).toHaveCount(0);
});

test("public login page does not render authenticated sidebar", async ({ page }) => {
  await page.goto("/login");

  await expect(page.getByRole("heading", { name: /sign in to plpass/i })).toBeVisible();
  await expect(page.getByRole("navigation", { name: "admin navigation" })).toHaveCount(0);
  await expect(page.getByRole("navigation", { name: "student navigation" })).toHaveCount(0);
});

test("each authenticated role receives only its own navigation", async ({ page }) => {
  for (const account of [
    { name: "Faculty One", navigation: "faculty navigation", link: "My Classes" },
    { name: "Organizer One", navigation: "organizer navigation", link: "Events" },
    { name: "Student 01", navigation: "student navigation", link: "Attendance Records" }
  ]) {
    await page.goto("/login");
    await page.getByText(account.name).click();
    await page.getByRole("button", { name: /sign in with selected account/i }).click();
    const sidebar = page.getByRole("navigation", { name: account.navigation });
    await expect(sidebar).toBeVisible();
    await expect(sidebar.getByRole("link", { name: account.link })).toBeVisible();
    await expect(page.getByRole("navigation", { name: "admin navigation" })).toHaveCount(0);
    await page.locator("summary").filter({ hasText: account.name }).click();
    await page.getByRole("button", { name: "Logout" }).click();
    await expect(page.getByRole("heading", { name: /sign in to plpass/i })).toBeVisible();
  }
});

test("mobile admin navigation is reachable by keyboard", async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 840 });
  await loginAsAdmin(page);

  const menu = page.getByRole("button", { name: "Open navigation menu" });
  await expect(menu).toBeVisible();
  await menu.focus();
  await page.keyboard.press("Enter");
  await page.getByRole("navigation", { name: "admin navigation" }).getByRole("link", { name: "Audit Logs" }).click();

  await expect(page).toHaveURL(/\/admin\/audit-logs$/);
  await expect(page.getByRole("heading", { name: "Audit logs" })).toBeVisible();
});

test("desktop sidebar collapse state persists", async ({ page }) => {
  await page.setViewportSize({ width: 1280, height: 900 });
  await loginAsAdmin(page);

  await page.getByRole("button", { name: "Collapse sidebar" }).click();
  await expect(page.getByRole("button", { name: "Expand sidebar" })).toBeVisible();
  await page.reload();
  await expect(page.getByRole("button", { name: "Expand sidebar" })).toBeVisible();
  await expect(page.getByRole("navigation", { name: "admin navigation" }).getByRole("link", { name: "Dashboard" })).toHaveAttribute("title", "Dashboard");
});

test("application shell responds correctly across required widths", async ({ page }) => {
  await page.setViewportSize({ width: 1440, height: 900 });
  await loginAsAdmin(page);

  for (const width of [1440, 1280, 1024] as const) {
    await page.setViewportSize({ width, height: 900 });
    await page.goto("/admin/dashboard");

    await expect(page.getByRole("navigation", { name: "admin navigation" })).toBeVisible();
    await expect(page.getByRole("button", { name: "Open navigation menu" })).toBeHidden();
    await expect(page.getByRole("button", { name: "Close navigation overlay" })).toHaveCount(0);

    const sidebarWidth = await page.getByRole("navigation", { name: "admin navigation" }).locator("..").evaluate((element) => Math.round(element.getBoundingClientRect().width));
    expect(sidebarWidth).toBe(260);

    const hasHorizontalOverflow = await page.evaluate(() => document.documentElement.scrollWidth > document.documentElement.clientWidth);
    expect(hasHorizontalOverflow).toBe(false);
  }

  for (const width of [768, 430, 375] as const) {
    await page.setViewportSize({ width, height: 840 });
    await page.goto("/admin/dashboard");

    await expect(page.getByRole("button", { name: "Open navigation menu" })).toBeVisible();
    await expect(page.getByRole("navigation", { name: "admin navigation" })).toHaveCount(0);
    await page.getByRole("button", { name: "Open navigation menu" }).click();
    await expect(page.getByRole("navigation", { name: "admin navigation" })).toBeVisible();
    await expect(page.getByRole("button", { name: "Close navigation overlay" })).toBeVisible();
    await page.keyboard.press("Escape");
    await expect(page.getByRole("navigation", { name: "admin navigation" })).toHaveCount(0);

    const hasHorizontalOverflow = await page.evaluate(() => document.documentElement.scrollWidth > document.documentElement.clientWidth);
    expect(hasHorizontalOverflow).toBe(false);
  }
});

test("admin pages expose required internal tabs and sections", async ({ page }) => {
  await page.setViewportSize({ width: 1280, height: 900 });
  await loginAsAdmin(page);

  await page.goto("/admin/users");
  await page.getByRole("tab", { name: "Faculty" }).click();
  await expect(page.getByText("F-1001")).toBeVisible();
  await page.getByRole("tab", { name: "Organizers" }).click();
  await expect(page.getByText("Student Affairs")).toBeVisible();

  await page.goto("/admin/academic");
  await page.getByRole("tab", { name: "Events" }).click();
  await expect(page.getByRole("tab", { name: "Approved Events" })).toBeVisible();
  await expect(page.getByText("CCS Orientation")).toBeVisible();
  await page.getByRole("tab", { name: "Pending Events" }).click();
  await expect(page.getByText("Business Forum")).toBeVisible();

  await page.goto("/admin/attendance");
  await expect(page.getByText("IT 204 Week 1")).toBeVisible();
  await page.getByRole("tab", { name: "Event Sessions" }).click();
  await expect(page.getByText("CCS Orientation Attendance")).toBeVisible();
});

test("authentication methods show NFC plus deferred QR and facial recognition tabs", async ({ page }) => {
  await loginAsAdmin(page);
  await page.goto("/admin/nfc-credentials");

  await expect(page.getByRole("heading", { name: "Authentication methods" })).toBeVisible();
  await expect(page.getByText(/PLP-\*+-001/).first()).toBeVisible();
  await page.getByRole("tab", { name: "QR Credentials" }).click();
  await expect(page.getByText("QR attendance fallback will be implemented in Phase 11.")).toBeVisible();
  await page.getByRole("tab", { name: "Facial Recognition" }).click();
  await expect(page.getByText("Facial Recognition is outside the PLPass MVP and will not be implemented in the current version.")).toBeVisible();
});

test("analytics and reports match Overview Plan sections", async ({ page }) => {
  await loginAsAdmin(page);

  await page.goto("/admin/analytics");
  await expect(page.getByText("Absenteeism Risk Prediction")).toBeVisible();
  await expect(page.getByText("Attendance Anomaly Detection")).toBeVisible();
  await expect(page.getByText("Participation Clustering")).toBeVisible();
  await expect(page.getByText("Review-only").first()).toBeVisible();

  await page.goto("/admin/reports");
  await expect(page.getByText("Report filters")).toBeVisible();
  await expect(page.getByRole("button", { name: "Generate PDF" })).toBeDisabled();
  await expect(page.getByRole("button", { name: "Generate XLSX" })).toBeDisabled();
  await expect(page.getByText(/Phase 12 functionality/i)).toBeVisible();
});

test("admin academic page supports mock roster and event actions", async ({ page }) => {
  await loginAsAdmin(page);
  await page.goto("/admin/academic");

  await page.locator("select").first().selectOption("class-1");
  await page.locator("select").nth(1).selectOption("student-7");
  await page.getByRole("button", { name: "Add" }).click();
  await page.getByRole("button", { name: "Remove" }).click();
  await page.getByRole("tab", { name: "Events" }).click();
  await page.getByRole("tab", { name: "Pending Events" }).click();
  await page.getByRole("button", { name: "Approve" }).first().click();

  await expect(page.getByRole("heading", { name: "Academic management" })).toBeVisible();
});

test("admin NFC and audit pages expose Phase 4 controls", async ({ page }) => {
  await loginAsAdmin(page);

  await page.goto("/admin/nfc-credentials");
  await page.getByRole("button", { name: "Block" }).first().click();
  await expect(page.getByText("blocked").first()).toBeVisible();

  await page.goto("/admin/nfc-readers");
  await page.getByRole("button", { name: "Maintenance" }).first().click();
  await expect(page.getByText("maintenance").first()).toBeVisible();

  await page.goto("/admin/audit-logs");
  await page.getByPlaceholder("Filter audit logs").fill("missing-audit-action");
  await expect(page.getByRole("heading", { name: "No audit logs found" })).toBeVisible();
});

test("non-admin users do not see admin navigation", async ({ page }) => {
  await page.goto("/login");
  await page.getByText("Student 01").click();
  await page.getByRole("button", { name: /sign in with selected account/i }).click();

  await expect(page.getByRole("heading", { name: "Student dashboard" })).toBeVisible();
  await expect(page.getByRole("navigation", { name: "admin navigation" })).toHaveCount(0);
  await expect(page.getByRole("link", { name: "User Management" })).toHaveCount(0);
  await page.goto("/admin/nfc-credentials");
  await expect(page.getByRole("heading", { name: "Access denied" })).toBeVisible();
  await expect(page.getByRole("tab", { name: "NFC Credentials" })).toHaveCount(0);
});

test("report generation remains disabled in Phase 4", async ({ page }) => {
  await loginAsAdmin(page);
  await page.goto("/admin/reports");

  await expect(page.getByRole("button", { name: "Generate report" })).toBeDisabled();
  await expect(page.getByRole("button", { name: "Generate PDF" })).toBeDisabled();
  await expect(page.getByRole("button", { name: "Generate XLSX" })).toBeDisabled();
});
