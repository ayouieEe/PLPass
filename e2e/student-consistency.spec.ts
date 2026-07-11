import { expect, test, type Page } from "@playwright/test";

const studentSession = {
  userId: "user-student-1",
  role: "student",
  displayName: "Student 01",
  email: "student.1@plpass.test",
  isAuthenticated: true
};

async function seedStudentSession(page: Page) {
  await page.addInitScript((session) => {
    window.localStorage.clear();
    window.localStorage.setItem("plpass-development-session", JSON.stringify(session));
    window.localStorage.setItem("plpass-student-student-1-event-records", JSON.stringify([
      {
        id: "student-local-duplicate-event-1",
        eventId: "event-1",
        eventCode: "EVT-001",
        eventName: "CCS Orientation",
        category: "Orientation",
        venue: "Main Hall",
        startsAt: "2026-06-27T01:00:00.000Z",
        endsAt: "2026-06-27T04:00:00.000Z",
        status: "present",
        method: "QR",
        recordedAt: "2026-06-27T01:04:00.000Z"
      }
    ]));
    window.localStorage.setItem("plpass-student-student-1-support-requests", JSON.stringify([
      {
        id: "student-local-request-playwright-auth",
        studentId: "student-1",
        kind: "authentication_issue",
        title: "Authentication issue",
        description: "QR scanner failed during venue check-in.",
        status: "pending",
        submittedAt: "2026-06-28T02:00:00.000Z"
      }
    ]));
  }, studentSession);
}

function statCard(page: Page, title: string) {
  return page.locator("article").filter({ has: page.getByText(title, { exact: true }) }).first();
}

async function expectStat(page: Page, title: string, value: string) {
  await expect(statCard(page, title).getByText(value, { exact: true })).toBeVisible();
}

test.beforeEach(async ({ page }) => {
  await seedStudentSession(page);
});

test("student data is consistent across dashboard, attendance, profile, methods, request history, and corrections", async ({ page }) => {
  await page.goto("/student/dashboard");
  await expect(page.getByRole("heading", { name: "Student dashboard" })).toBeVisible();
  await expectStat(page, "Events Attended", "5");
  await expectStat(page, "Attendance Rate", "83%");

  await page.goto("/student/attendance");
  await expect(page.getByRole("heading", { name: "Attendance Records" })).toBeVisible();
  await expect(page.getByText("5 attended events")).toBeVisible();
  await expect(page.getByText("Front Office Simulation Challenge")).toBeVisible();
  await expect(page.getByText("Hospitality Career Fair & Industry Talk")).toBeVisible();
  await expect(page.getByText("AHTOMP General Assembly & Orientation")).toBeVisible();
  await expect(page.getByText("AHTOMP Membership Orientation Archive")).toBeVisible();

  await page.goto("/student/profile");
  await expect(page.getByRole("heading", { name: "Profile" })).toBeVisible();
  await expect(page.getByText("QR UID Status")).toBeVisible();
  await expect(page.getByText("Ready")).toBeVisible();
  await expect(page.locator("div").filter({ hasText: /^Facial Enrollment\s*Enrolled$/ }).first()).toBeVisible();
  await expect(page.locator("div").filter({ hasText: /^Event Records\s*6$/ }).first()).toBeVisible();
  await expect(page.locator("div").filter({ hasText: /^Attendance Rate\s*83%$/ }).first()).toBeVisible();

  await page.goto("/student/methods");
  await expect(page.getByRole("heading", { name: "Attendance Methods" })).toBeVisible();
  await expect(page.getByText("QR - Ready")).toBeVisible();
  await expect(page.getByText("Face - Ready")).toBeVisible();
  await expect(page.getByText("PLPASS-QR-2026-0001")).toBeVisible();

  await page.goto("/student/request-history");
  await expect(page.getByRole("heading", { name: "Request History" })).toBeVisible();
  await expect(page.getByText("Submitted Requests")).toBeVisible();
  await expect(page.getByText("Authentication Issue", { exact: true })).toBeVisible();
  await expect(page.getByText("QR scanner failed during venue check-in.")).toBeVisible();

  await page.goto("/student/corrections");
  await expect(page.getByRole("heading", { name: "Correction Requests" })).toBeVisible();
  await page.getByText("Select attendance record...").click();
  await expect(page.getByText("Food & Beverage Service Skills Workshop (absent)")).toBeVisible();
  await expect(page.getByText("AHTOMP General Assembly & Orientation (late)")).toBeVisible();
  await expect(page.getByText("Front Office Simulation Challenge (late)")).toBeVisible();
});
