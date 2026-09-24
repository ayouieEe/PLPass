-- Department branding is the canonical brand for every organizer assigned to it.
-- Keep the legacy organizer fields synchronized for compatibility with existing
-- account-management records while all reads resolve through the department.

create or replace function private.sync_organizer_branding_from_department()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  department_brand record;
begin
  if new.department_id is null then
    return new;
  end if;

  select
    d.department_name,
    d.brand_name_override,
    d.logo_path
  into department_brand
  from public.departments d
  where d.id = new.department_id;

  if found then
    new.organization_name := coalesce(nullif(btrim(department_brand.brand_name_override), ''), department_brand.department_name);
    new.college_logo_path := department_brand.logo_path;
  end if;

  return new;
end;
$$;

revoke all on function private.sync_organizer_branding_from_department() from public;

drop trigger if exists sync_organizer_branding_from_department on public.organizers;
create trigger sync_organizer_branding_from_department
before insert or update of department_id, organization_name, college_logo_path
on public.organizers
for each row
execute function private.sync_organizer_branding_from_department();

create or replace function private.propagate_department_branding_to_organizers()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  update public.organizers o
  set
    organization_name = coalesce(nullif(btrim(new.brand_name_override), ''), new.department_name),
    college_logo_path = new.logo_path
  where o.department_id = new.id
    and (
      o.organization_name is distinct from coalesce(nullif(btrim(new.brand_name_override), ''), new.department_name)
      or o.college_logo_path is distinct from new.logo_path
    );

  return new;
end;
$$;

revoke all on function private.propagate_department_branding_to_organizers() from public;

drop trigger if exists propagate_department_branding_to_organizers on public.departments;
create trigger propagate_department_branding_to_organizers
after update of department_name, brand_name_override, logo_path
on public.departments
for each row
execute function private.propagate_department_branding_to_organizers();

update public.organizers o
set
  organization_name = coalesce(nullif(btrim(d.brand_name_override), ''), d.department_name),
  college_logo_path = d.logo_path
from public.departments d
where o.department_id = d.id
  and (
    o.organization_name is distinct from coalesce(nullif(btrim(d.brand_name_override), ''), d.department_name)
    or o.college_logo_path is distinct from d.logo_path
  );

drop policy if exists branding_assets_read on storage.objects;
create policy branding_assets_read on storage.objects for select to authenticated
  using (
    bucket_id = 'branding-assets'
    and (
      (select private.is_active_admin())
      or (storage.foldername(name))[1] = (select private.current_organizer_id())::text
      or (
        (storage.foldername(name))[1] = 'departments'
        and exists (
          select 1
          from public.organizers o
          where o.profile_id = (select auth.uid())
            and o.department_id::text = (storage.foldername(name))[2]
        )
      )
      or (
        (select private.is_active_department_admin())
        and (storage.foldername(name))[1] = 'departments'
        and (storage.foldername(name))[2] = (select private.current_department_id())::text
      )
    )
  );
