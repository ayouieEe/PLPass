import { expect, test } from "@playwright/test";

test("loads the development home page", async ({ page }) => {
  await page.goto("/");

  await expect(page.getByRole("heading", { name: /PLPass is ready for Phase 0 development/i })).toBeVisible();
  await expect(page.getByText("Supabase", { exact: true })).toBeVisible();
});

test("loads the component preview page", async ({ page }) => {
  await page.goto("/components");

  await expect(page.getByRole("heading", { name: "PLPass Component Library" })).toBeVisible();
  await expect(page.getByText("Development Simulation NFC reader")).toBeVisible();
});
