import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { join } from "node:path";

const migration = readFileSync(join(process.cwd(), "supabase", "migrations", "20260912040412_optimize_empty_event_email_dispatch.sql"), "utf8");

describe("event email worker idle optimization", () => {
  it("does not invoke the edge function when neither due nor abandoned email work exists", () => {
    expect(migration).toMatch(/delivery_status = 'pending'[\s\S]*next_attempt_at <= now\(\)/);
    expect(migration).toMatch(/delivery_status = 'processing'[\s\S]*processing_started_at <= now\(\) - interval '5 minutes'/);
    expect(migration.indexOf("if not exists")).toBeLessThan(migration.indexOf("perform net.http_post"));
  });

  it("uses a per-project Vault URL rather than targeting a specific project", () => {
    expect(migration).toContain("event_email_worker_function_url");
    expect(migration).toContain("url := v_function_url");
    expect(migration).not.toContain("ouwyhaozkqvhjalqdsvc.supabase.co");
  });
});
