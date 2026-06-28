-- Phase 9.1 review migration: attendance logs, correction requests, and credential request metadata.
-- Do not apply until reviewed. Direct browser writes should remain blocked by RLS.

alter table public.attendance_logs
  alter column device_id drop not null,
  add column if not exists recorded_by uuid references public.profiles(id) on delete set null,
  add column if not exists remarks text,
  add column if not exists created_at timestamptz not null default now();

create index if not exists attendance_logs_recorded_by_idx
  on public.attendance_logs (recorded_by);

alter table public.attendance_requests
  add column if not exists explanation text,
  add column if not exists submitted_at timestamptz not null default now(),
  add column if not exists reviewed_by uuid references public.profiles(id) on delete set null,
  add column if not exists reviewed_at timestamptz,
  add column if not exists rejection_reason text,
  add column if not exists updated_at timestamptz;

create index if not exists attendance_requests_reviewed_by_idx
  on public.attendance_requests (reviewed_by);

create unique index if not exists attendance_requests_one_pending_per_student_record_type
  on public.attendance_requests (student_id, attendance_record_id, request_type)
  where request_status = 'pending';

alter table public.credential_requests
  add column if not exists created_at timestamptz,
  add column if not exists reviewed_by uuid references public.profiles(id) on delete set null,
  add column if not exists reviewed_at timestamptz,
  add column if not exists review_remarks text,
  add column if not exists resolved_at timestamptz;

alter table public.credential_requests
  alter column created_at set default now();

do $$
begin
  if not exists (
    select 1
    from public.credential_requests
    where created_at is null
  ) then
    alter table public.credential_requests
      alter column created_at set not null;
  end if;
end $$;

create index if not exists credential_requests_reviewed_by_idx
  on public.credential_requests (reviewed_by);
