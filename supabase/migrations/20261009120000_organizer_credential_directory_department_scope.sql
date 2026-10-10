begin;

-- Organizers manage the QR directory for their assigned department, including
-- students who have not yet been added to one of their events.
create or replace function public.organizer_list_credential_directory()
returns table (
  student_id uuid, student_number text, student_name text,
  qr_id uuid, qr_credential_status text, qr_issued_at timestamptz, qr_expires_at timestamptz,
  qr_revoked_at timestamptz, qr_last_successful_check_in_at timestamptz, qr_created_at timestamptz, qr_updated_at timestamptz
)
language sql security definer set search_path = ''
as $$
  select s.id, s.student_id, concat_ws(' ', p.first_name, nullif(p.middle_name, ''), p.last_name, nullif(p.name_extension, '')),
    q.id, q.credential_status, q.issued_at, q.expires_at, q.revoked_at, q.last_successful_check_in_at, q.created_at, q.updated_at
  from public.students s
  join public.profiles p on p.id = s.profile_id
  left join lateral (
    select q.id, q.credential_status, q.issued_at, q.expires_at, q.revoked_at, q.last_successful_check_in_at, q.created_at, q.updated_at
    from public.qr_credentials q where q.student_id = s.id
    order by q.issued_at desc nulls last, q.created_at desc limit 1
  ) q on true
  where (select private.is_active_organizer())
    and exists (
      select 1
      from public.organizers organizer
      where organizer.id = (select private.current_organizer_id())
        and organizer.department_id is not null
        and organizer.department_id = s.department_id
    )
  order by s.student_id;
$$;

revoke all on function public.organizer_list_credential_directory() from public, anon, authenticated;
grant execute on function public.organizer_list_credential_directory() to authenticated;

commit;
