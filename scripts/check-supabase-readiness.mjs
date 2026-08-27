import { existsSync, readFileSync, readdirSync, statSync } from "node:fs";
import { extname, join, resolve } from "node:path";
import process from "node:process";

const root = process.cwd();
const migrationDirectory = resolve(root, "supabase/migrations");
const failures = [];
const passes = [];

const required = [
  "supabase/config.toml",
  "src/lib/supabase/database.types.ts",
  "supabase/migrations",
];
for (const path of required) {
  if (!existsSync(resolve(root, path))) failures.push(`Missing ${path}.`);
  else passes.push(`Required Supabase artifact exists: ${path}`);
}

if (existsSync(migrationDirectory)) {
  const names = readdirSync(migrationDirectory)
    .filter((name) => name.endsWith(".sql"))
    .sort();
  const timestamps = names.map((name) => name.match(/^(\d{14})_/u)?.[1]);
  if (timestamps.some((value) => !value)) failures.push("Every migration must start with a 14-digit UTC timestamp.");
  else passes.push(`${names.length} timestamped migrations found`);
  if (new Set(timestamps).size !== timestamps.length) failures.push("Migration timestamps must be unique.");
  else passes.push("Migration timestamps are unique");

  const sql = names.map((name) => readFileSync(join(migrationDirectory, name), "utf8")).join("\n");
  const createdTables = [...sql.matchAll(/create\s+table(?:\s+if\s+not\s+exists)?\s+public\.([a-z_][a-z0-9_]*)/giu)].map((match) => match[1]);
  const rlsTables = new Set([...sql.matchAll(/alter\s+table\s+public\.([a-z_][a-z0-9_]*)\s+enable\s+row\s+level\s+security/giu)].map((match) => match[1]));
  const missingRls = [...new Set(createdTables)].filter((table) => !rlsTables.has(table));
  if (missingRls.length) failures.push(`Public tables without a tracked RLS enable statement: ${missingRls.join(", ")}.`);
  else passes.push(`All ${new Set(createdTables).size} tracked public tables enable RLS`);

  if (/auth\.jwt\(\)[\s\S]{0,100}(?:user_metadata|raw_user_meta_data)/iu.test(sql)) {
    failures.push("An RLS expression appears to authorize using editable user metadata.");
  } else passes.push("No RLS authorization based on editable user metadata detected");
}

const configPath = resolve(root, "supabase/config.toml");
if (existsSync(configPath)) {
  const config = readFileSync(configPath, "utf8");
  if (!/major_version\s*=\s*17/u.test(config)) failures.push("Local Supabase must use PostgreSQL 17.");
  else passes.push("Local Supabase targets PostgreSQL 17");
}

const secretFindings = [];
const sourceDirectory = resolve(root, "src");
if (existsSync(sourceDirectory)) walk(sourceDirectory, (path) => {
  if (![".ts", ".tsx", ".js", ".jsx"].includes(extname(path))) return;
  if (/service[_-]?role|SUPABASE_SERVICE_ROLE|SUPABASE_SECRET_KEY/iu.test(readFileSync(path, "utf8"))) secretFindings.push(path);
});
if (secretFindings.length) failures.push(`Privileged Supabase key reference in frontend source: ${secretFindings.join(", ")}.`);
else passes.push("No privileged Supabase key references in frontend source");

for (const pass of passes) process.stdout.write(`PASS  ${pass}\n`);
for (const failure of failures) process.stderr.write(`FAIL  ${failure}\n`);
if (failures.length) throw new Error(`Supabase readiness failed with ${failures.length} issue(s).`);
process.stdout.write("Supabase repository readiness passed.\n");

function walk(directory, visit) {
  for (const name of readdirSync(directory)) {
    const path = join(directory, name);
    if (statSync(path).isDirectory()) walk(path, visit);
    else visit(path);
  }
}
