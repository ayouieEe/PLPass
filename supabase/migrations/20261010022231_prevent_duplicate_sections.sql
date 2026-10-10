begin;

-- Section identity is program + name + year level + academic year.  Preserve
-- referenced rows and keep any duplicate that has no references as inactive.
with ranked as (
  select
    s.id,
    row_number() over (
      partition by s.program_id, lower(btrim(s.section_name)), s.year_level, s.academic_year
      order by
        (select count(*) from public.students st where st.section_id = s.id)
          + (select count(*) from public.student_enrollments se where se.section_id = s.id) desc,
        s.created_at,
        s.id
    ) as duplicate_rank
  from public.sections s
  where s.is_active
)
update public.sections s
set is_active = false, updated_at = now()
from ranked r
where s.id = r.id and r.duplicate_rank > 1;

create unique index if not exists sections_active_identity_unique_idx
  on public.sections (program_id, lower(btrim(section_name)), year_level, academic_year)
  where is_active;

create or replace function public.admin_manage_catalog_entry(
  p_table text,
  p_id uuid default null,
  p_values jsonb default '{}'::jsonb
) returns uuid
language plpgsql security definer set search_path = ''
as $$
declare
  v_id uuid;
  v_program_id uuid;
  v_section_name text;
  v_year_level integer;
  v_academic_year text;
begin
  if not (select private.is_active_admin()) then
    raise exception 'An active administrator account is required.' using errcode = '42501';
  end if;
  if p_values is null or jsonb_typeof(p_values) <> 'object' then
    raise exception 'Catalog values must be an object.' using errcode = '22023';
  end if;

  case p_table
    when 'departments' then
      if p_id is null then
        insert into public.departments (department_code, department_name, is_active)
        values (btrim(p_values->>'department_code'), btrim(p_values->>'department_name'), coalesce((p_values->>'is_active')::boolean, true)) returning id into v_id;
      else
        update public.departments set department_code = coalesce(nullif(btrim(p_values->>'department_code'), ''), department_code), department_name = coalesce(nullif(btrim(p_values->>'department_name'), ''), department_name), is_active = coalesce((p_values->>'is_active')::boolean, is_active) where id = p_id returning id into v_id;
      end if;
    when 'programs' then
      if p_id is null then
        insert into public.programs (department_id, program_code, program_name, is_active)
        values ((p_values->>'department_id')::uuid, btrim(p_values->>'program_code'), btrim(p_values->>'program_name'), coalesce((p_values->>'is_active')::boolean, true)) returning id into v_id;
      else
        update public.programs set department_id = coalesce((p_values->>'department_id')::uuid, department_id), program_code = coalesce(nullif(btrim(p_values->>'program_code'), ''), program_code), program_name = coalesce(nullif(btrim(p_values->>'program_name'), ''), program_name), is_active = coalesce((p_values->>'is_active')::boolean, is_active) where id = p_id returning id into v_id;
      end if;
    when 'sections' then
      v_program_id := (p_values->>'program_id')::uuid;
      v_section_name := btrim(p_values->>'section_name');
      v_year_level := (p_values->>'year_level')::integer;
      v_academic_year := btrim(p_values->>'academic_year');
      if coalesce((p_values->>'is_active')::boolean, true) and exists (
        select 1 from public.sections s
        where s.program_id = v_program_id
          and lower(btrim(s.section_name)) = lower(v_section_name)
          and s.year_level = v_year_level
          and s.academic_year = v_academic_year
          and s.is_active
          and (p_id is null or s.id <> p_id)
      ) then
        raise exception 'A section with this name already exists for the selected program, year level, and school year.' using errcode = '23505';
      end if;
      if p_id is null then
        insert into public.sections (program_id, section_name, year_level, academic_year, semester, is_active)
        values (v_program_id, v_section_name, v_year_level, v_academic_year, btrim(p_values->>'semester'), coalesce((p_values->>'is_active')::boolean, true)) returning id into v_id;
      else
        update public.sections set program_id = coalesce(v_program_id, program_id), section_name = coalesce(nullif(v_section_name, ''), section_name), year_level = coalesce(v_year_level, year_level), academic_year = coalesce(nullif(v_academic_year, ''), academic_year), semester = coalesce(nullif(btrim(p_values->>'semester'), ''), semester), is_active = coalesce((p_values->>'is_active')::boolean, is_active) where id = p_id returning id into v_id;
      end if;
    when 'event_categories' then
      if p_id is null then
        insert into public.event_categories (category_name, is_active)
        values (btrim(p_values->>'category_name'), coalesce((p_values->>'is_active')::boolean, true)) returning id into v_id;
      else
        update public.event_categories set category_name = coalesce(nullif(btrim(p_values->>'category_name'), ''), category_name), is_active = coalesce((p_values->>'is_active')::boolean, is_active) where id = p_id returning id into v_id;
      end if;
    else
      raise exception 'Unsupported catalog table.' using errcode = '22023';
  end case;

  if v_id is null then raise exception 'Catalog entry was not found.' using errcode = 'P0002'; end if;
  insert into public.audit_logs (actor_user_id, action, target_type, target_id, metadata)
  values ((select auth.uid()), format('admin.catalog.%s', case when p_id is null then 'created' else 'updated' end), p_table, v_id, p_values);
  return v_id;
end;
$$;

revoke all on function public.admin_manage_catalog_entry(text, uuid, jsonb) from public, anon;
grant execute on function public.admin_manage_catalog_entry(text, uuid, jsonb) to authenticated;

commit;
