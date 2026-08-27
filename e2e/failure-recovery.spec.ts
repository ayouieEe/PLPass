import { expect, test, type Page } from "@playwright/test";

const studentSession = {
  userId: "user-student-1",
  role: "student",
  displayName: "Student 01",
  email: "student.1@plpass.test",
  isAuthenticated: true
};

const organizerTwoSession = {
  userId: "user-organizer-2",
  role: "organizer",
  displayName: "Organizer Two",
  email: "organizer.two@plpass.test",
  isAuthenticated: true
};

async function seedSession(page: Page, session: object) {
  await page.addInitScript((value) => {
    window.localStorage.clear();
    window.localStorage.setItem("plpass-development-session", JSON.stringify(value));
  }, session);
}

test.describe("session and authorization recovery", () => {
  test("redirects an unauthenticated protected route to sign in", async ({ page }) => {
    await page.goto("/student/attendance");
    await expect(page).toHaveURL(/\/login$/);
    await expect(page.getByRole("heading", { name: "Sign in to PLPass" })).toBeVisible();
  });

  test("rejects an unsupported legacy session", async ({ page }) => {
    await seedSession(page, {
      userId: "user-faculty-1",
      role: "faculty",
      displayName: "Legacy Faculty",
      email: "faculty@plpass.test",
      isAuthenticated: true
    });
    await page.goto("/student/dashboard");
    await expect(page).toHaveURL(/\/login$/);
    await expect(page.getByRole("heading", { name: "Sign in to PLPass" })).toBeVisible();
  });

  test("hides another organizer's event details", async ({ page }) => {
    await seedSession(page, organizerTwoSession);
    await page.goto("/organizer/events/event-1");
    await expect(page.getByRole("heading", { name: "Event unavailable" })).toBeVisible();
    await expect(page.getByText(/outside the signed-in organizer scope/i)).toBeVisible();
  });

  test("offers a safe recovery action for an unknown route", async ({ page }) => {
    await seedSession(page, studentSession);
    await page.goto("/this-route-does-not-exist");
    await expect(page.getByRole("heading", { name: "Page not found" })).toBeVisible();
    const recovery = page.getByRole("link", { name: "Return to authorized area" });
    await expect(recovery).toBeVisible();
    await recovery.click();
    await expect(page).toHaveURL(/\/student\/dashboard$/);
  });
});

test.describe("student validation and device recovery", () => {
  test.beforeEach(async ({ page }) => seedSession(page, studentSession));

  test("prevents an empty correction request", async ({ page }) => {
    await page.goto("/student/corrections");
    await expect(page.getByRole("heading", { name: "Correction Requests" })).toBeVisible();
    await page.getByRole("button", { name: "Submit correction request" }).click();
    await expect(page.getByText("Select a related attendance record.")).toBeVisible();
  });

  test("prevents an unexplained attendance issue report", async ({ page }) => {
    await page.goto("/student/methods");
    await expect(page.getByRole("heading", { name: "Attendance Methods" })).toBeVisible();
    await page.getByRole("button", { name: "Report attendance issue" }).click();
    await page.getByRole("button", { name: "Submit report" }).click();
    await expect(page.getByText("Explanation must be at least 10 characters.")).toBeVisible();
  });

  test("provides a fallback when camera permission is denied", async ({ page }) => {
    await page.addInitScript(() => {
      Object.defineProperty(navigator, "mediaDevices", {
        configurable: true,
        value: {
          getUserMedia: () => Promise.reject(new DOMException("Permission denied", "NotAllowedError"))
        }
      });
    });
    await page.goto("/student/methods");
    await page.getByRole("button", { name: "Enroll face" }).click();
    await expect(page.getByRole("dialog").getByRole("heading", { name: "Enroll facial backup" })).toBeVisible();
    await expect(page.getByText("Camera access was blocked or unavailable. Use the fallback photo picker below.")).toBeVisible();
    await expect(page.getByText("Use fallback")).toBeVisible();
  });
});
