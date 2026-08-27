import { execFileSync } from "node:child_process";
import process from "node:process";

export default function globalSetup() {
  execFileSync(process.execPath, ["scripts/test-local-supabase-integration.mjs"], {
    cwd: process.cwd(),
    env: process.env,
    stdio: "inherit"
  });
}
