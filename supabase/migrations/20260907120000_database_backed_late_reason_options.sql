begin;

create table if not exists public.attendance_late_reason_options (
  id uuid primary key default gen_random_uuid(),
  code text not null unique,
  default_label text not null,
  sort_order smallint not null default 0,
  is_active boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint attendance_late_reason_options_code_not_blank check (btrim(code) <> ''),
  constraint attendance_late_reason_options_label_not_blank check (btrim(default_label) <> '')
);

create table if not exists public.attendance_late_reason_option_translations (
  option_id uuid not null references public.attendance_late_reason_options(id) on delete cascade,
  locale text not null,
  label text not null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  primary key (option_id, locale),
  constraint attendance_late_reason_translations_locale_not_blank check (btrim(locale) <> ''),
  constraint attendance_late_reason_translations_label_not_blank check (btrim(label) <> '')
);

insert into public.attendance_late_reason_options (code, default_label, sort_order)
values
  ('traffic_commute', 'Traffic / Commute', 10),
  ('class_academic_conflict', 'Class or Academic Conflict', 20),
  ('personal_health', 'Personal / Health', 30),
  ('weather_force_majeure', 'Weather / Force Majeure', 40),
  ('other', 'Other', 50)
on conflict (code) do update
set default_label = excluded.default_label,
    sort_order = excluded.sort_order,
    updated_at = now();

alter table public.attendance_records
  add column if not exists late_reason_option_id uuid references public.attendance_late_reason_options(id);

create index if not exists attendance_late_reason_options_active_order_idx
  on public.attendance_late_reason_options (is_active, sort_order, default_label);
create index if not exists attendance_records_late_reason_option_idx
  on public.attendance_records (late_reason_option_id);

update public.attendance_records ar
set late_reason_option_id = opt.id
from public.attendance_late_reason_options opt
where ar.late_reason_option_id is null
  and ar.late_reason_category = opt.default_label;

create or replace function private.sync_late_reason_option_id()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  if new.late_reason_option_id is null and new.late_reason_category is not null then
    select id into new.late_reason_option_id
    from public.attendance_late_reason_options
    where default_label = new.late_reason_category or code = new.late_reason_category
    order by is_active desc, sort_order
    limit 1;
  end if;
  return new;
end;
$$;

drop trigger if exists attendance_records_sync_late_reason_option on public.attendance_records;
create trigger attendance_records_sync_late_reason_option
before insert or update of late_reason_category, late_reason_option_id on public.attendance_records
for each row execute function private.sync_late_reason_option_id();

alter table public.attendance_late_reason_options enable row level security;
alter table public.attendance_late_reason_option_translations enable row level security;

grant select on public.attendance_late_reason_options, public.attendance_late_reason_option_translations to authenticated;
grant insert, update, delete on public.attendance_late_reason_options, public.attendance_late_reason_option_translations to authenticated;

drop policy if exists attendance_late_reason_options_read on public.attendance_late_reason_options;
create policy attendance_late_reason_options_read on public.attendance_late_reason_options
for select to authenticated
using ((select private.is_active_user()) and (is_active or (select private.is_active_organizer())));

drop policy if exists attendance_late_reason_options_manage on public.attendance_late_reason_options;
create policy attendance_late_reason_options_manage on public.attendance_late_reason_options
for all to authenticated
using ((select private.is_active_organizer()))
with check ((select private.is_active_organizer()));

drop policy if exists attendance_late_reason_translations_read on public.attendance_late_reason_option_translations;
create policy attendance_late_reason_translations_read on public.attendance_late_reason_option_translations
for select to authenticated
using (
  (select private.is_active_user())
  and exists (
    select 1 from public.attendance_late_reason_options opt
    where opt.id = option_id and (opt.is_active or (select private.is_active_organizer()))
  )
);

drop policy if exists attendance_late_reason_translations_manage on public.attendance_late_reason_option_translations;
create policy attendance_late_reason_translations_manage on public.attendance_late_reason_option_translations
for all to authenticated
using ((select private.is_active_organizer()))
with check ((select private.is_active_organizer()));

drop function if exists public.submit_late_reason(uuid, text, text);
drop function if exists public.submit_late_reason(uuid, text);
create or replace function public.submit_late_reason(
  p_attendance_record_id uuid,
  p_late_reason_option_id uuid,
  p_late_reason text default null
)
returns public.attendance_records
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_student_id uuid;
  v_option public.attendance_late_reason_options;
  v_record public.attendance_records;
begin
  v_student_id := private.current_student_id();
  if v_student_id is null then
    raise exception 'Authenticated student profile is required.' using errcode = '42501';
  end if;

  select * into v_option
  from public.attendance_late_reason_options
  where id = p_late_reason_option_id and is_active;
  if not found then
    raise exception 'Invalid or inactive late reason option.' using errcode = '22023';
  end if;
  if v_option.code = 'other' and nullif(btrim(coalesce(p_late_reason, '')), '') is null then
    raise exception 'A custom late reason is required for Other.' using errcode = '22023';
  end if;

  update public.attendance_records
  set late_reason_option_id = v_option.id,
      late_reason_category = v_option.default_label,
      late_reason = case when v_option.code = 'other' then btrim(p_late_reason) else null end,
      updated_at = now()
  where id = p_attendance_record_id
    and student_id = v_student_id
    and attendance_status = 'late'
  returning * into v_record;
  if not found then
    raise exception 'Late attendance record was not found for this student.' using errcode = 'P0002';
  end if;
  return v_record;
end;
$$;

revoke all on function public.submit_late_reason(uuid, uuid, text) from public, anon;
grant execute on function public.submit_late_reason(uuid, uuid, text) to authenticated;

create or replace function public.submit_late_reason(
  p_attendance_record_id uuid,
  p_late_reason_category text,
  p_late_reason text default null
)
returns public.attendance_records
language plpgsql
security invoker
set search_path = ''
as $$
declare
  v_option_id uuid;
begin
  select id into v_option_id
  from public.attendance_late_reason_options
  where is_active and (code = p_late_reason_category or default_label = p_late_reason_category)
  order by sort_order
  limit 1;
  if v_option_id is null then
    raise exception 'Invalid or inactive late reason option.' using errcode = '22023';
  end if;
  return public.submit_late_reason(p_attendance_record_id, v_option_id, p_late_reason);
end;
$$;

revoke all on function public.submit_late_reason(uuid, text, text) from public, anon;
grant execute on function public.submit_late_reason(uuid, text, text) to authenticated;

commit;
