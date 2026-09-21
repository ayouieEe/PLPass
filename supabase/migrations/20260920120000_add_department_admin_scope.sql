-- Department administrator foundation for PLPass Current.
-- Review against Current's live pg_policies before applying. PLPass Events is
-- intentionally not covered by this migration.
begin;

-- API roles must not be able to truncate, trigger, or reference admin metadata.
-- Keep authenticated SELECT/UPDATE because RLS remains the row-level boundary;
-- service-role Edge Functions handle admin-profile creation.
revoke all on public.admin_profiles from anon;
revoke references, trigger, truncate on public.admin_profiles from authenticated;
grant select, update on public.admin_profiles to authenticated;

alter table public.profiles drop constraint if exists profiles_role_valid;
alter table public.profiles add constraint profiles_role_valid
  check (role = any (array['admin', 'department_admin', 'organizer', 'student']));

alter table public.profiles drop constraint if exists profiles_role_identifier_valid;
alter table public.profiles add constraint profiles_role_identifier_valid
  check (
    (role = any (array['admin', 'department_admin', 'organizer']) and employee_id is not null and student_id is null)
    or (role = 'student' and student_id is not null and employee_id is null)
  );

alter table public.departments add column if not exists brand_name_override text;
alter table public.departments add column if not exists logo_path text;
alter table public.departments add column if not exists primary_color text;
alter table public.departments add column if not exists secondary_color text;

create or replace function private.is_active_department_admin()
returns boolean
language sql stable security definer set search_path = ''
as $$
  select exists (
    select 1
    from public.profiles p
    join public.admin_profiles ap on ap.profile_id = p.id
    where p.id = (select auth.uid())
      and p.role = 'department_admin'
      and p.account_status = 'active'
      and ap.department_id is not null
  );
$$;
revoke all on function private.is_active_department_admin() from public, anon, authenticated;
grant execute on function private.is_active_department_admin() to authenticated;

create or replace function private.current_department_id()
returns uuid
language sql stable security definer set search_path = ''
as $$
  select ap.department_id
  from public.profiles p
  join public.admin_profiles ap on ap.profile_id = p.id
  where p.id = (select auth.uid())
    and p.role = 'department_admin'
    and p.account_status = 'active'
  limit 1;
$$;
revoke all on function private.current_department_id() from public, anon, authenticated;
grant execute on function private.current_department_id() to authenticated;

drop policy if exists admin_profiles_read_admin on public.admin_profiles;
create policy admin_profiles_read_admin on public.admin_profiles for select to authenticated
  using (
    (select private.is_active_admin())
    or (profile_id = (select auth.uid()) and (select private.is_active_department_admin()))
  );

-- Replace the known blanket read policies. Other policies must be checked in
-- pg_policies before this migration is applied, because permissive policies
-- combine with OR semantics.
drop policy if exists admin_profiles_read_all on public.admin_profiles;
drop policy if exists departments_read on public.departments;
create policy departments_read on public.departments for select to authenticated
  using (
    (select private.is_active_user())
    and (
      not (select private.is_active_department_admin())
      or id = (select private.current_department_id())
    )
  );

drop policy if exists departments_branding_update_department_admin on public.departments;
create policy departments_branding_update_department_admin on public.departments
  for update to authenticated
  using ((select private.is_active_department_admin()) and id = (select private.current_department_id()))
  with check ((select private.is_active_department_admin()) and id = (select private.current_department_id()));

grant select on public.departments to authenticated;
grant update (brand_name_override, logo_path, primary_color, secondary_color, updated_at)
  on public.departments to authenticated;

drop policy if exists branding_assets_read on storage.objects;
create policy branding_assets_read on storage.objects for select to authenticated
  using (
    bucket_id = 'branding-assets'
    and (
      (select private.is_active_admin())
      or (storage.foldername(name))[1] = (select private.current_organizer_id())::text
      or ((select private.is_active_department_admin()) and (storage.foldername(name))[1] = 'departments' and (storage.foldername(name))[2] = (select private.current_department_id())::text)
    )
  );

drop policy if exists branding_assets_insert on storage.objects;
create policy branding_assets_insert on storage.objects for insert to authenticated
  with check (
    bucket_id = 'branding-assets'
    and (
      (select private.is_active_admin())
      or (storage.foldername(name))[1] = (select private.current_organizer_id())::text
      or ((select private.is_active_department_admin()) and (storage.foldername(name))[1] = 'departments' and (storage.foldername(name))[2] = (select private.current_department_id())::text)
    )
  );

drop policy if exists branding_assets_update on storage.objects;
create policy branding_assets_update on storage.objects for update to authenticated
  using (
    bucket_id = 'branding-assets'
    and (
      (select private.is_active_admin())
      or (storage.foldername(name))[1] = (select private.current_organizer_id())::text
      or ((select private.is_active_department_admin()) and (storage.foldername(name))[1] = 'departments' and (storage.foldername(name))[2] = (select private.current_department_id())::text)
    )
  )
  with check (
    bucket_id = 'branding-assets'
    and (
      (select private.is_active_admin())
      or (storage.foldername(name))[1] = (select private.current_organizer_id())::text
      or ((select private.is_active_department_admin()) and (storage.foldername(name))[1] = 'departments' and (storage.foldername(name))[2] = (select private.current_department_id())::text)
    )
  );

drop policy if exists branding_assets_delete on storage.objects;
create policy branding_assets_delete on storage.objects for delete to authenticated
  using (
    bucket_id = 'branding-assets'
    and (
      (select private.is_active_admin())
      or (storage.foldername(name))[1] = (select private.current_organizer_id())::text
      or ((select private.is_active_department_admin()) and (storage.foldername(name))[1] = 'departments' and (storage.foldername(name))[2] = (select private.current_department_id())::text)
    )
  );

drop policy if exists students_read on public.students;
create policy students_read on public.students for select to authenticated
  using (
    profile_id = (select auth.uid())
    or (select private.is_active_organizer())
    or ((select private.is_active_department_admin()) and department_id = (select private.current_department_id()))
  );

drop policy if exists events_read on public.events;
create policy events_read on public.events for select to authenticated
  using (
    (select private.is_active_user())
    and (
      ((select private.is_active_department_admin()) and department_id = (select private.current_department_id()))
      or (
        not (select private.is_active_department_admin())
        and (approval_status = 'approved' or organizer_id = (select private.current_organizer_id()))
      )
    )
  );

drop policy if exists event_participants_read on public.event_participants;
create policy event_participants_read on public.event_participants for select to authenticated
  using (
    student_id = (select private.current_student_id())
    or exists (
      select 1 from public.events e
      where e.id = event_participants.event_id
        and (
          e.organizer_id = (select private.current_organizer_id())
          or ((select private.is_active_department_admin()) and e.department_id = (select private.current_department_id()))
        )
    )
  );

drop policy if exists event_sessions_read on public.event_sessions;
create policy event_sessions_read on public.event_sessions for select to authenticated
  using (exists (
    select 1 from public.events e
    where e.id = event_sessions.event_id
      and (
        ((select private.is_active_department_admin()) and e.department_id = (select private.current_department_id()))
        or ((select private.is_active_department_admin()) is false and (e.approval_status = 'approved' or e.organizer_id = (select private.current_organizer_id())))
      )
  ));

drop policy if exists attendance_records_read on public.attendance_records;
create policy attendance_records_read on public.attendance_records for select to authenticated
  using (
    student_id = (select private.current_student_id())
    or exists (
      select 1
      from public.event_sessions es
      join public.events e on e.id = es.event_id
      where es.id = attendance_records.event_session_id
        and (
          e.organizer_id = (select private.current_organizer_id())
          or ((select private.is_active_department_admin()) and e.department_id = (select private.current_department_id()))
        )
    )
  );

commit;
