-- Replace department-admin table reads with a minimal, explicitly scoped RPC.
-- Never expose qr_credentials.token_hash or facial_profiles.face_descriptor.
begin;

drop policy if exists department_admin_read_qr_credentials on public.qr_credentials;
drop policy if exists department_admin_read_facial_profiles on public.facial_profiles;

create or replace function public.department_admin_list_credential_statuses(p_student_ids uuid[] default null)
returns table (
  student_id uuid,
  qr_id uuid,
  qr_credential_status text,
  qr_issued_at timestamptz,
  qr_expires_at timestamptz,
  qr_revoked_at timestamptz,
  qr_last_successful_check_in_at timestamptz,
  qr_created_at timestamptz,
  qr_updated_at timestamptz,
  facial_id uuid,
  facial_status text,
  facial_enrolled_at timestamptz,
  facial_last_verified_at timestamptz,
  facial_consent_recorded_at timestamptz,
  facial_created_at timestamptz,
  facial_updated_at timestamptz
)
language sql
security definer
set search_path = ''
as $$
  select
    scoped_students.id,
    qr.id,
    qr.credential_status,
    qr.issued_at,
    qr.expires_at,
    qr.revoked_at,
    qr.last_successful_check_in_at,
    qr.created_at,
    qr.updated_at,
    facial.id,
    facial.facial_status,
    facial.enrolled_at,
    facial.last_verified_at,
    facial.consent_recorded_at,
    facial.created_at,
    facial.updated_at
  from public.students as scoped_students
  left join lateral (
    select q.id, q.student_id, q.credential_status, q.issued_at, q.expires_at,
           q.revoked_at, q.last_successful_check_in_at, q.created_at, q.updated_at
    from public.qr_credentials as q
    where q.student_id = scoped_students.id
    order by q.issued_at desc nulls last, q.created_at desc
    limit 1
  ) as qr on true
  left join public.facial_profiles as facial on facial.student_id = scoped_students.id
  where (select private.is_active_department_admin())
    and scoped_students.department_id = (select private.current_department_id())
    and (p_student_ids is null or scoped_students.id = any(p_student_ids))
    and (qr.id is not null or facial.id is not null);
$$;

revoke all on function public.department_admin_list_credential_statuses(uuid[]) from public, anon, authenticated;
grant execute on function public.department_admin_list_credential_statuses(uuid[]) to authenticated;

-- Audit visibility must be tied to the target's department, never actor alone.
drop policy if exists audit_logs_read_department_admin on public.audit_logs;
create policy audit_logs_read_department_admin on public.audit_logs
for select to authenticated
using (
  (select private.is_active_department_admin())
  and (
    (target_type = 'department' and target_id = (select private.current_department_id()))
    or (target_type = 'event' and exists (
      select 1 from public.events e
      where e.id = audit_logs.target_id
        and e.department_id = (select private.current_department_id())
    ))
    or (target_type in ('event_session', 'attendance_session') and exists (
      select 1
      from public.event_sessions es
      join public.events e on e.id = es.event_id
      where es.id = audit_logs.target_id
        and e.department_id = (select private.current_department_id())
    ))
    or (target_type = 'attendance_record' and exists (
      select 1
      from public.attendance_records ar
      join public.event_sessions es on es.id = ar.event_session_id
      join public.events e on e.id = es.event_id
      where ar.id = audit_logs.target_id
        and e.department_id = (select private.current_department_id())
    ))
    or (target_type = 'event_participant' and exists (
      select 1
      from public.event_participants ep
      join public.events e on e.id = ep.event_id
      where ep.id = audit_logs.target_id
        and e.department_id = (select private.current_department_id())
    ))
    or (target_type in ('student', 'student_profile', 'student_account', 'user', 'qr_credential', 'facial_profile') and exists (
      select 1
      from public.students s
      where s.department_id = (select private.current_department_id())
        and (
          s.id = audit_logs.target_id
          or s.profile_id = audit_logs.target_id
          or exists (select 1 from public.qr_credentials q where q.student_id = s.id and q.id = audit_logs.target_id)
          or exists (select 1 from public.facial_profiles f where f.student_id = s.id and f.id = audit_logs.target_id)
        )
    ))
    or (target_type in ('organizer', 'organizer_profile', 'user') and exists (
      select 1
      from public.organizers o
      where o.department_id = (select private.current_department_id())
        and (o.id = audit_logs.target_id or o.profile_id = audit_logs.target_id)
    ))
  )
);

commit;
