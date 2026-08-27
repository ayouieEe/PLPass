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

for (const [role, path, heading, userLabel] of [
  ["student", "/student/dashboard", /Welcome back/i, "Student 01"],
  ["organizer", "/organizer/dashboard", /^Dashboard$/i, "Organizer One"]
] as const) {
  test(`${role} account menu opens with ArrowDown and restores focus on Escape`, async ({ page }) => {
    await seedSession(page, role);
    await page.goto(path);
    await expect(page.getByRole("heading", { name: heading }).first()).toBeVisible();

    const trigger = page.getByRole("button", { name: `Open account menu for ${userLabel}` });
    await trigger.focus();
    await page.keyboard.press("ArrowDown");
    await expect(trigger).toHaveAttribute("aria-expanded", "true");
    const firstAction = page.getByRole("menuitem").first();
    await expect(firstAction).toBeFocused();
    await page.keyboard.press("Escape");
    await expect(trigger).toHaveAttribute("aria-expanded", "false");
    await expect(trigger).toBeFocused();
  });
}

test("student correction selector supports listbox arrow keys and focus return", async ({ page }) => {
  await seedSession(page, "student");
  await page.goto("/student/corrections");
  await expect(page.getByRole("heading", { name: "Correction Requests" })).toBeVisible();

  const trigger = page.getByRole("button", { name: "Related Attendance Record" });
  await trigger.focus();
  await page.keyboard.press("ArrowDown");
  await expect(trigger).toHaveAttribute("aria-expanded", "true");
  const listbox = page.getByRole("listbox", { name: "Related Attendance Record" });
  await expect(listbox).toBeVisible();
  await expect(listbox.getByRole("option").first()).toBeFocused();
  await page.keyboard.press("ArrowDown");
  await page.keyboard.press("Enter");
  await expect(listbox).toBeHidden();
  await expect(trigger).toBeFocused();
});
