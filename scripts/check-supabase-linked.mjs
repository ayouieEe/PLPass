import { spawnSync } from "node:child_process";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import process from "node:process";

const runner = "npx";
const environment = { ...process.env, SUPABASE_TELEMETRY_DISABLED: "1" };

const migrationOutput = run(["supabase", "migration", "list", "--linked"]);
const drift = migrationOutput.split(/\r?\n/u).filter((line) => {
  const cells = line.split("|").map((cell) => cell.trim());
  if (cells.length < 2) return false;
  const local = /^\d{14}$/u.test(cells[0]);
  const remote = /^\d{14}$/u.test(cells[1]);
  return local !== remote;
});
if (drift.length) fail(`Migration drift detected:\n${drift.join("\n")}`);
process.stdout.write("PASS  Local and linked migration histories match\n");

run(["supabase", "db", "lint", "--linked", "--schema", "public", "--level", "warning", "--fail-on", "warning"]);
process.stdout.write("PASS  Linked public schema lint has no warnings\n");

const generated = normalize(run(["supabase", "gen", "types", "--linked", "--lang", "typescript", "--schema", "public"]));
const current = normalize(readFileSync(resolve("src/lib/supabase/database.types.ts"), "utf8"));
if (generated !== current) fail("Generated database types are stale. Reconcile migrations first, then run npm run generate:db-types.");
process.stdout.write("PASS  Generated TypeScript database types match the linked schema\n");
process.stdout.write("Linked Supabase readiness passed.\n");

function run(args) {
  const result = spawnSync(runner, args, {
    cwd: process.cwd(),
    env: environment,
    encoding: "utf8",
    shell: process.platform === "win32",
  });
  if (result.error) fail(`Could not start ${args.join(" ")}: ${result.error.message}`);
  if (result.status !== 0) fail(result.stderr?.trim() || result.stdout?.trim() || `${args.join(" ")} failed.`);
  return result.stdout;
}

function normalize(value) {
  return value.replace(/\r\n/gu, "\n").trim();
}

function fail(message) {
  process.stderr.write(`FAIL  ${message}\n`);
  process.exit(1);
}
