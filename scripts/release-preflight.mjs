import { existsSync, readFileSync, readdirSync, statSync } from "node:fs";
import { extname, join, resolve } from "node:path";
import process from "node:process";

const root = process.cwd();
const productionMode = process.argv.includes("--production");
const failures = [];
const checks = [];

requireNodeVersion(20);
requireFiles([
  "package.json",
  "package-lock.json",
  ".env.example",
  ".github/workflows/quality.yml",
  "playwright.config.ts",
  "supabase/config.toml",
  "PHASE_10_RELEASE_READINESS.md",
  "docs/DEPLOYMENT_RUNBOOK.md",
  "docs/UAT_CHECKLIST.md",
  "docs/BIOMETRIC_PRIVACY_CHECKLIST.md"
]);
requireMigration("harden_biometric_and_event_email_functions");
rejectFrontendServiceSecrets();
checkBuiltArtifact();

if (productionMode) checkProductionEnvironment();

for (const check of checks) process.stdout.write(`PASS  ${check}\n`);
for (const failure of failures) process.stderr.write(`FAIL  ${failure}\n`);

if (failures.length > 0) {
  throw new Error(`Release preflight failed with ${failures.length} issue(s).`);
}
process.stdout.write(`Release preflight passed${productionMode ? " for the supplied production environment" : " for repository readiness"}.\n`);

function requireNodeVersion(minimumMajor) {
  const major = Number(process.versions.node.split(".")[0]);
  if (major < minimumMajor) failures.push(`Node.js ${minimumMajor}+ is required; found ${process.versions.node}.`);
  else checks.push(`Node.js ${process.versions.node}`);
}

function requireFiles(paths) {
  for (const path of paths) {
    if (!existsSync(resolve(root, path))) failures.push(`Missing required release artifact: ${path}`);
    else checks.push(`Required artifact exists: ${path}`);
  }
}

function requireMigration(fragment) {
  const migrationDirectory = resolve(root, "supabase/migrations");
  const found = existsSync(migrationDirectory) && readdirSync(migrationDirectory).some((name) => name.includes(fragment));
  if (!found) failures.push(`Missing required Supabase migration containing: ${fragment}`);
  else checks.push(`Required Supabase security migration: ${fragment}`);
}

function rejectFrontendServiceSecrets() {
  const sourceDirectory = resolve(root, "src");
  const findings = [];
  walk(sourceDirectory, (path) => {
    if (![".ts", ".tsx", ".js", ".jsx"].includes(extname(path))) return;
    const source = readFileSync(path, "utf8");
    if (/service[_-]?role|SUPABASE_SERVICE_ROLE|SUPABASE_SECRET_KEY/i.test(source)) findings.push(path);
  });
  if (findings.length) failures.push(`Possible service-role/secret-key reference found in frontend source: ${findings.join(", ")}`);
  else checks.push("No service-role or secret-key references in frontend source");
}

function checkBuiltArtifact() {
  const indexPath = resolve(root, "dist/index.html");
  if (!existsSync(indexPath)) {
    failures.push("Production build is missing. Run npm run build before preflight.");
    return;
  }
  const html = readFileSync(indexPath, "utf8");
  if (!html.includes("PLPass") || !html.includes("/assets/")) failures.push("dist/index.html does not look like a complete PLPass production build.");
  else checks.push("Production build artifact is present");
}

function checkProductionEnvironment() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL || process.env.VITE_SUPABASE_URL;
  const key = process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY || process.env.VITE_SUPABASE_ANON_KEY || process.env.VITE_SUPABASE_PUBLISHABLE_KEY;
  if (!url || !/^https:\/\/[^/]+\.supabase\.co\/?$/.test(url)) failures.push("A valid HTTPS Supabase project URL is required.");
  else checks.push("Production Supabase URL is valid");
  if (!key || /YOUR_|service_role|secret/i.test(key)) failures.push("A publishable Supabase browser key is required; secret/service-role keys are forbidden.");
  else checks.push("Production browser key is present and not labeled as privileged");
  if (process.env.VITE_DATA_SOURCE === "mock") failures.push("VITE_DATA_SOURCE=mock is forbidden for a production release.");
  else checks.push("Production data source is not mock");
}

function walk(directory, visit) {
  for (const name of readdirSync(directory)) {
    const path = join(directory, name);
    if (statSync(path).isDirectory()) walk(path, visit);
    else visit(path);
  }
}
