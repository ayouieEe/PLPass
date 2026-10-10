begin;

create table public.student_enrollments (
  id uuid primary key default gen_random_uuid(),
  student_id uuid not null references public.students(id) on delete cascade,
  academic_year text not null,
  semester_id uuid not null references public.semesters(id) on delete restrict,
  program_id uuid not null references public.programs(id) on delete restrict,
  section_id uuid not null references public.sections(id) on delete restrict,
  year_level smallint not null,
  enrollment_status text not null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint student_enrollments_year_not_blank check (btrim(academic_year) <> ''),
  constraint student_enrollments_year_level_valid check (year_level between 1 and 8),
  constraint student_enrollments_status_valid check (enrollment_status in ('enrolled', 'loa', 'dropped', 'archived', 'graduated')),
  constraint student_enrollments_identity_unique unique (student_id, semester_id)
);
create index student_enrollments_student_id_idx on public.student_enrollments (student_id);
create index student_enrollments_academic_year_idx on public.student_enrollments (academic_year);
alter table public.student_enrollments enable row level security;

insert into public.student_enrollments (student_id, academic_year, semester_id, program_id, section_id, year_level, enrollment_status)
select s.id, settings.current_school_year, settings.current_semester_id, s.program_id, s.section_id, s.year_level, s.student_status
from public.students s
cross join lateral (select current_school_year, current_semester_id from public.system_settings order by updated_at desc limit 1) settings
on conflict (student_id, semester_id) do nothing;

create or replace function public.admin_preview_student_progression(p_target_school_year text, p_target_semester_id uuid)
returns table (
  student_id uuid,
  student_number text,
  display_name text,
  current_year_level smallint,
  target_year_level smallint,
  current_section text,
  target_section_id uuid,
  issue text
)
language plpgsql security definer set search_path = ''
as $$
declare
  v_current_year text;
  v_target_semester_year text;
  v_current_start integer;
  v_target_start integer;
begin
  if not (select private.is_active_admin()) then
    raise exception 'Only university administrators can advance students.' using errcode = '42501';
  end if;
  select current_school_year into v_current_year from public.system_settings order by updated_at desc limit 1;
  select academic_year into v_target_semester_year from public.semesters where id = p_target_semester_id;
  if p_target_school_year !~ '^\d{4}-\d{4}$' or v_target_semester_year is null then
    raise exception 'Select a valid target school year and semester.' using errcode = '22023';
  end if;
  if v_target_semester_year <> p_target_school_year then
    raise exception 'The selected semester must belong to the target school year.' using errcode = '22023';
  end if;
  v_current_start := split_part(v_current_year, '-', 1)::integer;
  v_target_start := split_part(p_target_school_year, '-', 1)::integer;
  if v_target_start <> v_current_start + 1 then
    raise exception 'Students can only be advanced to the next school year.' using errcode = '22023';
  end if;

  return query
  select s.id, s.student_id, trim(concat_ws(' ', p.first_name, p.middle_name, p.last_name)), s.year_level,
    s.year_level + 1, sec.section_name, target.id,
    case when target.id is null then 'No matching next-year section' else null end
  from public.students s
  join public.profiles p on p.id = s.profile_id
  join public.sections sec on sec.id = s.section_id
  left join public.semesters target_semester on target_semester.id = p_target_semester_id
  left join public.sections target on target.program_id = s.program_id
    and lower(target.section_name) = lower(sec.section_name)
    and target.year_level = s.year_level + 1
    and target.academic_year = p_target_school_year
    and lower(target.semester) = lower(target_semester.semester_name)
  where s.student_status = 'enrolled' and s.year_level < 8;
end;
$$;
revoke all on function public.admin_preview_student_progression(text, uuid) from public, anon, authenticated;
grant execute on function public.admin_preview_student_progression(text, uuid) to authenticated;

create or replace function public.admin_apply_student_progression(p_target_school_year text, p_target_semester_id uuid)
returns jsonb
language plpgsql security definer set search_path = ''
as $$
declare
  v_current_year text;
  v_target_semester_year text;
  v_target_semester_name text;
  v_current_start integer;
  v_target_start integer;
  v_count integer := 0;
  r record;
begin
  if not (select private.is_active_admin()) then
    raise exception 'Only university administrators can advance students.' using errcode = '42501';
  end if;
  select current_school_year into v_current_year from public.system_settings order by updated_at desc limit 1 for update;
  select academic_year, semester_name into v_target_semester_year, v_target_semester_name from public.semesters where id = p_target_semester_id;
  if p_target_school_year !~ '^\d{4}-\d{4}$' or v_target_semester_year <> p_target_school_year then
    raise exception 'The selected semester must belong to the target school year.' using errcode = '22023';
  end if;
  v_current_start := split_part(v_current_year, '-', 1)::integer;
  v_target_start := split_part(p_target_school_year, '-', 1)::integer;
  if v_target_start <> v_current_start + 1 then
    raise exception 'Students can only be advanced to the next school year.' using errcode = '22023';
  end if;

  for r in select * from public.admin_preview_student_progression(p_target_school_year, p_target_semester_id) where issue is not null loop
    raise exception 'Promotion stopped: no matching section for student %.', r.student_number using errcode = '22023';
  end loop;

  for r in select * from public.admin_preview_student_progression(p_target_school_year, p_target_semester_id) loop
    insert into public.student_enrollments (student_id, academic_year, semester_id, program_id, section_id, year_level, enrollment_status)
    select s.id, p_target_school_year, p_target_semester_id, s.program_id, r.target_section_id, s.year_level + 1, 'enrolled'
    from public.students s where s.id = r.student_id;
    update public.students set section_id = r.target_section_id, year_level = year_level + 1, updated_at = now() where id = r.student_id and student_status = 'enrolled' and year_level < 8;
    v_count := v_count + 1;
  end loop;

  insert into public.audit_logs (actor_user_id, action, target_type, metadata)
  values ((select auth.uid()), 'admin.student_progression.applied', 'student_enrollments', jsonb_build_object('targetSchoolYear', p_target_school_year, 'targetSemesterId', p_target_semester_id, 'updatedCount', v_count));
  return jsonb_build_object('updatedCount', v_count, 'targetSchoolYear', p_target_school_year, 'targetSemesterId', p_target_semester_id);
end;
$$;
revoke all on function public.admin_apply_student_progression(text, uuid) from public, anon, authenticated;
grant execute on function public.admin_apply_student_progression(text, uuid) to authenticated;

commit;
