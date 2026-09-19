import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

const readMigration = (name: string) => readFileSync(resolve(process.cwd(), "supabase/migrations", name), "utf8");

describe("CPU stabilization migrations", () => {
  it("authenticates the email worker through the Edge Function JWT gateway", () => {
    const migration = readMigration("20260919115154_fix_event_email_worker_authorization.sql");
    expect(migration).toContain("event_email_worker_service_role_key");
    expect(migration).toContain("'Authorization', 'Bearer ' || v_service_role_key");
    expect(migration).toContain("'apikey', v_service_role_key");
    expect(migration).not.toContain("raise exception 'Email");
  });

  it("rate-limits offline sync per authenticated actor", () => {
    const migration = readMigration("20260919115204_protect_offline_sync_rate.sql");
    expect(migration).toContain("private.offline_sync_rate_limits");
    expect(migration).toContain("pg_advisory_xact_lock");
    expect(migration).toContain("interval '100 milliseconds'");
    expect(migration).toContain("revoke all on private.offline_sync_rate_limits");
  });

  it("does not turn throttle pressure into aborted transactions", () => {
    const migration = readMigration("20260919122000_make_offline_sync_throttle_non_throwing.sql");
    expect(migration).toContain("pg_try_advisory_xact_lock");
    expect(migration).toContain("return null;");
    expect(migration).not.toContain("55006");
  });

  it("caches auth identity evaluation without weakening policy roles", () => {
    const migration = readMigration("20260919115423_optimize_hot_path_rls_policies.sql");
    expect(migration).toContain("p.id = (select auth.uid())");
    expect(migration).toContain("to authenticated");
    expect(migration).not.toContain("to public");
  });

  it("reserves the shared daily email budget and never requeues historical request emails", () => {
    const migration = readMigration("20260919170000_harden_email_quota_and_retry_controls.sql");
    expect(migration).toContain("claim_event_email_outbox_batch_with_daily_cap");
    expect(migration).toContain("claim_request_email_outbox_batch_with_daily_cap");
    expect(migration).toContain("pg_advisory_xact_lock(hashtextextended('plpass_email_daily_budget', 0))");
    expect(migration).toContain("defer_due_email_outbox_deliveries");
    expect(migration).toContain("Only recent participant invitation email jobs may be retried.");
    expect(migration).toContain("notification_type = 'participant_added'");
    expect(migration).toContain("p_source is distinct from 'event_email'");
    expect(migration).toContain("revoke update on public.event_email_outbox from public, anon, authenticated;");
    expect(migration).toContain("revoke update on public.request_email_outbox from public, anon, authenticated;");
    expect(migration).toContain("drop policy if exists admin_system_health_event_email_retry");
    expect(migration).toContain("drop policy if exists admin_system_health_request_email_retry");
    expect(migration).toContain("from public.request_email_outbox");
    expect(migration).toContain("or (delivery_status = 'processing' and processing_started_at <= now() - interval '5 minutes')");
  });

  it("releases every lease from a quota-limited worker run", () => {
    const worker = readFileSync(resolve(process.cwd(), "supabase/functions/send-event-emails/index.ts"), "utf8");
    expect(worker).toContain("deferRemainingEventRows");
    expect(worker).toContain("deferRemainingRequestRows");
    expect(worker).toContain("rows.slice(startIndex)");
  });

  it("uses handler-level service-key authentication for the scheduled worker", () => {
    const config = readFileSync(resolve(process.cwd(), "supabase/config.toml"), "utf8");
    const worker = readFileSync(resolve(process.cwd(), "supabase/functions/send-event-emails/index.ts"), "utf8");
    expect(config).toMatch(/\[functions\.send-event-emails\][\s\S]*verify_jwt = true/);
    expect(worker).toContain("const isWorker = authorization === `Bearer ${serviceRoleKey}` && apiKey === serviceRoleKey;");
    expect(worker).toContain("supabase.auth.getUser(accessToken)");
  });
});
