begin;

-- Server-derived scope prevents client-side participant enumeration. The function
-- deliberately returns no QR token hash, QR value, facial descriptor, or embedding.
create or replace function public.organizer_list_credential_directory()
returns table (
  student_id uuid, student_number text, student_name text,
  qr_id uuid, qr_credential_status text, qr_issued_at timestamptz, qr_expires_at timestamptz,
  qr_revoked_at timestamptz, qr_last_successful_check_in_at timestamptz, qr_created_at timestamptz, qr_updated_at timestamptz,
  facial_id uuid, facial_status text, facial_enrolled_at timestamptz, facial_last_verified_at timestamptz,
  facial_consent_recorded_at timestamptz, facial_created_at timestamptz, facial_updated_at timestamptz
)
language sql security definer set search_path = ''
as $$
  select student.id, student.student_id,
    concat_ws(' ', profile.first_name, nullif(profile.middle_name, ''), profile.last_name, nullif(profile.name_extension, '')),
    qr.id, qr.credential_status, qr.issued_at, qr.expires_at, qr.revoked_at, qr.last_successful_check_in_at, qr.created_at, qr.updated_at,
    facial.id, facial.facial_status, facial.enrolled_at, facial.last_verified_at, facial.consent_recorded_at, facial.created_at, facial.updated_at
  from public.students as student
  join public.profiles as profile on profile.id = student.profile_id
  left join lateral (
    select q.id, q.credential_status, q.issued_at, q.expires_at, q.revoked_at, q.last_successful_check_in_at, q.created_at, q.updated_at
    from public.qr_credentials as q where q.student_id = student.id
    order by q.issued_at desc nulls last, q.created_at desc limit 1
  ) as qr on true
  left join public.facial_profiles as facial on facial.student_id = student.id
  where (select private.is_active_organizer())
    and exists (
      select 1 from public.event_participants as participant
      join public.events as event on event.id = participant.event_id
      where participant.student_id = student.id
        and participant.participant_status <> 'removed'
        and event.organizer_id = (select private.current_organizer_id())
    )
  order by student.student_id;
$$;

revoke all on function public.organizer_list_credential_directory() from public, anon, authenticated;
grant execute on function public.organizer_list_credential_directory() to authenticated;

commit;
