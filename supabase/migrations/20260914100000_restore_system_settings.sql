create table if not exists public.system_settings (
  id uuid primary key default gen_random_uuid(),
  institution_name text not null default 'PLPass',
  current_school_year text not null default '2026-2027',
  current_semester_id uuid references public.semesters(id) on delete set null,
  attendance_late_cutoff_minutes integer not null default 15,
  default_session_duration_minutes integer not null default 90,
  verification_policy text not null default 'Use an approved QR reader or facial verification device.',
  notification_preferences jsonb not null default '{}'::jsonb,
  updated_by uuid references public.profiles(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint system_settings_institution_not_blank check (btrim(institution_name) <> ''),
  constraint system_settings_school_year_not_blank check (btrim(current_school_year) <> ''),
  constraint system_settings_late_cutoff_valid check (attendance_late_cutoff_minutes between 0 and 240),
  constraint system_settings_duration_valid check (default_session_duration_minutes between 1 and 1440),
  constraint system_settings_verification_policy_not_blank check (btrim(verification_policy) <> ''),
  constraint system_settings_notification_object check (jsonb_typeof(notification_preferences) = 'object')
);

alter table public.system_settings enable row level security;
grant select, update on public.system_settings to authenticated;

drop policy if exists system_settings_read on public.system_settings;
create policy system_settings_read on public.system_settings for select to authenticated
  using ((select private.is_active_user()));

drop policy if exists system_settings_update_organizer on public.system_settings;
create policy system_settings_update_organizer on public.system_settings for update to authenticated
  using ((select private.is_active_organizer()))
  with check ((select private.is_active_organizer()));

insert into public.system_settings (
  institution_name,
  current_school_year,
  current_semester_id,
  verification_policy,
  notification_preferences
)
select
  'Pamantasan ng Lungsod ng Pasig',
  '2026-2027',
       (select id from public.semesters order by start_date desc nulls last limit 1),
  'Use an approved QR reader or facial verification device.',
  jsonb_build_object(
    'readerPolicy', 'Use an approved QR reader or facial verification device.',
    'credentialStatusPolicy', 'Blocked and lost credentials require administrator review.',
    'notificationPreferencePlaceholder', 'Notifications are sent for important attendance and account updates.'
  )
where not exists (select 1 from public.system_settings);
