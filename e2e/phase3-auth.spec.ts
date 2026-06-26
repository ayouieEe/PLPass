import { expect, test } from "@playwright/test";

const storageKey = "plpass-development-session";

const accounts = [
  { name: "Admin One", dashboard: "Admin dashboard placeholder" },
  { name: "Faculty One", dashboard: "Faculty dashboard placeholder" },
  { name: "Organizer One", dashboard: "Organizer dashboard placeholder" },
  { name: "Student 01", dashboard: "Student dashboard placeholder" }
];

async function loginAs(page: import("@playwright/test").Page, accountName: string) {
  await page.goto("/login");
  await page.getByText(accountName).click();
  await page.getByRole("button", { name: /sign in with selected account/i }).click();
}

test("logs in as every role and restores sessions after refresh", async ({ page }) => {
  for (const account of accounts) {
    await page.goto("/");
    await page.evaluate((key) => window.localStorage.removeItem(key), storageKey);
    await loginAs(page, account.name);
    await expect(page.getByRole("heading", { name: account.dashboard })).toBeVisible();

    await page.reload();
    await expect(page.getByRole("heading", { name: account.dashboard })).toBeVisible();
  }
});

test("student opening admin dashboard sees access denied", async ({ page }) => {
  await loginAs(page, "Student 01");
  await page.goto("/admin/dashboard");

  await expect(page.getByRole("heading", { name: "Access denied" })).toBeVisible();
  await expect(page.getByText(/does not have permission/i)).toBeVisible();
});

test("notifications support mark one read and mark all read", async ({ page }) => {
  await loginAs(page, "Student 01");
  await page.goto("/notifications");

  await expect(page.getByText("Attendance recorded")).toBeVisible();
  await expect(page.getByText("2 unread")).toBeVisible();

  await page.getByRole("button", { name: "Mark read" }).first().click();
  await expect(page.getByText("1 unread")).toBeVisible();

  await page.getByRole("button", { name: "Mark all as read" }).click();
  await expect(page.getByText("0 unread")).toBeVisible();
});

test("logout then protected URL returns to login", async ({ page }) => {
  await loginAs(page, "Faculty One");
  await page.goto("/profile");
  await expect(page.getByRole("heading", { name: "Profile" })).toBeVisible();

  await page.getByRole("button", { name: "Logout" }).last().click();
  await expect(page.getByRole("heading", { name: /sign in to plpass/i })).toBeVisible();

  await page.goto("/faculty/dashboard");
  await expect(page.getByRole("heading", { name: /sign in to plpass/i })).toBeVisible();
});
