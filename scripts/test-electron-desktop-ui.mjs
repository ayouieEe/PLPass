import assert from "node:assert/strict";
import { mkdtemp, rm } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { _electron as electron } from "playwright";

const projectRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const userDataDirectory = await mkdtemp(path.join(os.tmpdir(), "plpass-electron-ui-"));
const email = process.env.PLPASS_E2E_EMAIL ?? "organizer.one@plpass.test";
const password = process.env.PLPASS_E2E_PASSWORD ?? "desktop-test-password";
let app;

try {
  console.log("Desktop UI smoke: launching packaged test renderer.");
  console.log("Desktop UI smoke: launching Electron.");
  app = await electron.launch({
    // The Windows test host has no usable GPU DLL stack. This flag applies
    // only to the isolated Playwright process, never a normal PLPass launch.
    args: [projectRoot, `--user-data-dir=${userDataDirectory}`, "--disable-gpu"],
    cwd: projectRoot,
    env: { ...process.env, PLPASS_E2E_ISOLATED: "1" }
  });
  const desktopProcess = app.process();
  desktopProcess?.stdout?.on("data", (value) => process.stderr.write(`[desktop] ${value}`));
  desktopProcess?.stderr?.on("data", (value) => process.stderr.write(`[desktop] ${value}`));
  app.on("window", (window) => console.log(`Desktop UI smoke: window opened at ${window.url()}.`));
  app.on("close", () => console.error("Desktop UI smoke: Electron closed before the test completed."));
  const page = await app.firstWindow();
  page.on("console", (message) => console.error(`[renderer:${message.type()}] ${message.text()}`));
  page.on("pageerror", (error) => console.error(`[renderer:pageerror] ${error.message}`));
  console.log("Desktop UI smoke: waiting for sign-in page.");
  try {
    await page.getByRole("heading", { name: "Sign in to PLPass" }).waitFor({ timeout: 8_000 });
  } catch (error) {
    throw new Error(`Sign-in page did not load at ${page.url()}; renderer text: ${await page.locator("body").innerText().catch(() => "<unavailable>")}; ${error instanceof Error ? error.message : String(error)}`);
  }
  await page.getByLabel("Email").fill(email);
  await page.getByLabel("Password", { exact: true }).fill(password);
  await page.getByRole("button", { name: "Sign in", exact: true }).click();
  console.log("Desktop UI smoke: verifying organizer workspace.");
  try {
    await page.waitForURL("**/organizer/dashboard", { timeout: 5_000 });
  } catch (error) {
    throw new Error(`Mock sign-in did not reach the organizer dashboard. Current URL: ${page.url()}; renderer text: ${await page.locator("body").innerText().catch(() => "<unavailable>")}; ${error instanceof Error ? error.message : String(error)}`);
  }
  assert.match(page.url(), /\/organizer\/dashboard$/u, `Expected organizer dashboard after mock sign-in; got ${page.url()}`);
  await page.waitForTimeout(1_000);
  const workspaceText = await page.locator("body").innerText();
  assert.match(workspaceText, /Dashboard/u, `Dashboard content did not render after sign-in:\n${workspaceText}`);
  assert.equal(await page.evaluate(() => typeof window.plpassDesktop), "object");
  await page.goto("plpass://app/organizer/events");
  await page.getByRole("heading", { name: "Events", exact: true }).waitFor();
  console.log("Desktop UI smoke passed: mock sign-in, organizer routing, events UI, and preload bridge succeeded.");
} finally {
  await app?.close();
  await rm(userDataDirectory, { recursive: true, force: true });
}
