-- Phase 9.1 review migration: system audit logs, notification metadata, and report metadata.
-- Do not apply until reviewed. Session-specific history remains in public.session_audit_logs.

create table if not exists public.audit_logs (
  id uuid primary key default gen_random_uuid(),
  actor_user_id uuid references public.profiles(id) on delete set null,
  action text not null,
  target_type text not null,
  target_id uuid,
  metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now()
);

create index if not exists audit_logs_actor_user_id_idx
  on public.audit_logs (actor_user_id);

create index if not exists audit_logs_target_idx
  on public.audit_logs (target_type, target_id);

create index if not exists audit_logs_created_at_idx
  on public.audit_logs (created_at desc);

alter table public.notifications
  add column if not exists read_at timestamptz,
  add column if not exists action_url text,
  add column if not exists reference_type text,
  add column if not exists reference_id uuid;

create index if not exists notifications_reference_idx
  on public.notifications (reference_type, reference_id);

alter table public.generated_reports
  add column if not exists report_status text not null default 'queued',
  add column if not exists generated_at timestamptz,
  add column if not exists expires_at timestamptz,
  add column if not exists error_message text;

do $$
begin
  if not exists (
    select 1
    from pg_constraint
    where conname = 'generated_reports_report_status_check'
      and conrelid = 'public.generated_reports'::regclass
  ) then
    alter table public.generated_reports
      add constraint generated_reports_report_status_check
      check (report_status in ('queued', 'processing', 'ready', 'failed')) not valid;
  end if;
end $$;

create index if not exists generated_reports_status_idx
  on public.generated_reports (report_status);

create index if not exists generated_reports_generated_at_idx
  on public.generated_reports (generated_at desc);
