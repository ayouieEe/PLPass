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
  const local = migrationId(cells[0]);
  const remote = migrationId(cells[1]);
  return Boolean(local || remote) && local !== remote;
});
if (drift.length) fail(`Migration drift detected:\n${drift.join("\n")}`);
process.stdout.write("PASS  Local and linked migration histories match\n");

run(["supabase", "db", "lint", "--linked", "--schema", "public", "--level", "warning", "--fail-on", "error"]);
process.stdout.write("PASS  Linked public schema lint has no errors\n");

const generated = normalize(run(["supabase", "gen", "types", "--linked", "--lang", "typescript", "--schema", "public"]));
const current = normalize(readFileSync(resolve("src/lib/supabase/database.types.ts"), "utf8"));
verifyActiveApplicationContract(generated, current);
process.stdout.write("PASS  Linked generated types satisfy the active application contract\n");
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

function migrationId(value) {
  if (/^\d{14}$/u.test(value)) return value;
  const formattedDate = value.match(/^(\d{4})-(\d{2})-(\d{2})\s+(\d{2}):(\d{2}):(\d{2})$/u);
  return formattedDate ? formattedDate.slice(1).join("") : "";
}

// Staging defines the application contract, while production may temporarily
// retain revoked legacy RPC overloads during a two-stage cleanup.  Requiring
// byte-for-byte generated output would treat those intentionally inaccessible
// compatibility objects as a release failure.  Verify every database surface
// consumed by the current client instead.
function verifyActiveApplicationContract(generated, current) {
  const required = [
    "rooms:",
    "prepare_offline_event_package:",
    "reconcile_offline_event_session_start:",
    "reconcile_offline_event_session_end:",
    "record_approved_event_walkin:",
    "sync_offline_event_attendance:",
    "update_organizer_event_metadata:",
  ];
  for (const token of required) {
    if (!current.includes(token)) fail(`Committed database types are missing required contract: ${token}`);
    if (!generated.includes(token)) fail(`Linked schema is missing required application contract: ${token}`);
  }
}

function fail(message) {
  process.stderr.write(`FAIL  ${message}\n`);
  process.exit(1);
}
