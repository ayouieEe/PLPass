begin;

-- Profile avatars remain private. This expands read access only to people who
-- can already view the matching profile in the audit-log workspace.
drop policy if exists profile_avatars_select_audit_scope on storage.objects;
create policy profile_avatars_select_audit_scope
on storage.objects for select to authenticated
using (
  bucket_id = 'profile-avatars'
  and (
    (storage.foldername(name))[1] = (select auth.uid())::text
    or (select private.is_active_admin())
    or (
      (select private.is_active_department_admin())
      and exists (
        select 1
        from public.students s
        where s.profile_id::text = (storage.foldername(name))[1]
          and s.department_id = (select private.current_department_id())
      )
    )
    or (
      (select private.is_active_department_admin())
      and exists (
        select 1
        from public.organizers o
        where o.profile_id::text = (storage.foldername(name))[1]
          and o.department_id = (select private.current_department_id())
      )
    )
    or (
      (select private.is_active_organizer())
      and exists (
        select 1
        from public.students s
        where s.profile_id::text = (storage.foldername(name))[1]
          and (select private.organizer_can_access_student(s.id))
      )
    )
    or (
      (select private.is_active_organizer())
      and exists (
        select 1
        from public.organizers o
        where o.profile_id::text = (storage.foldername(name))[1]
          and o.organizer_status = 'active'
          and o.department_id = (select private.current_organizer_department_id())
      )
    )
  )
);

commit;
