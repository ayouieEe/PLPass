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

async function expectAccessibleGrid(page: Page, label: string, browserName: string) {
  const region = page.getByRole("region", { name: label });
  await expect(region).toBeVisible();
  await expect(region).toContainText("Data grid. Use the arrow keys to move between cells.");

  const grid = region.locator('[role="grid"]');
  await expect(grid).toHaveAttribute("aria-label", label);
  const firstCell = grid.locator('[role="gridcell"]').first();
  if (browserName === "webkit") {
    // WebKit follows the host full-keyboard-access preference for focusing
    // tabindex=-1 grid cells, so verify direct cell interaction instead.
    await firstCell.click();
    return;
  }
  await firstCell.focus();
  await expect(firstCell).toBeFocused();
  await page.keyboard.press("ArrowRight");
  expect(await grid.evaluate((element) => element.contains(document.activeElement))).toBe(true);
}

test("organizer student-account grid provides keyboard and screen-reader context", async ({ page, browserName }) => {
  const gridErrors: string[] = [];
  page.on("console", (message) => {
    if (message.type() === "error" && message.text().includes("AG Grid")) gridErrors.push(message.text());
  });
  await seedSession(page, "organizer");
  await page.goto("/organizer/users");
  await expect(page.getByRole("heading", { name: "User Management" })).toBeVisible();
  await expectAccessibleGrid(page, "Student accounts", browserName);
  expect(gridErrors).toEqual([]);
});

test("student correction-history grid provides keyboard and screen-reader context", async ({ page, browserName }) => {
  await seedSession(page, "student");
  await page.goto("/student/corrections");
  await expect(page.getByRole("heading", { name: "Correction Requests" })).toBeVisible();
  await expectAccessibleGrid(page, "Correction request history", browserName);
});
