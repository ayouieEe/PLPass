begin;

-- A durable marker prevents deleting a profile from restoring first-enrollment eligibility.
alter table public.students
  add column if not exists initial_facial_enrollment_completed_at timestamptz;

update public.students s
set initial_facial_enrollment_completed_at = fp.enrolled_at
from public.facial_profiles fp
where fp.student_id = s.id
  and s.initial_facial_enrollment_completed_at is null;

create table if not exists public.facial_enrollment_history (
  id uuid primary key default gen_random_uuid(),
  student_id uuid not null references public.students(id) on delete cascade,
  credential_request_id uuid references public.credential_requests(id) on delete set null,
  enrollment_reference text not null,
  enrollment_kind text not null,
  enrollment_status text not null default 'activated',
  replaced_profile_id uuid,
  created_by uuid not null references public.profiles(id) on delete restrict,
  created_at timestamptz not null default now(),
  constraint facial_enrollment_history_reference_not_blank check (btrim(enrollment_reference) <> ''),
  constraint facial_enrollment_history_kind_valid check (enrollment_kind in ('initial', 're_enrollment')),
  constraint facial_enrollment_history_status_valid check (enrollment_status in ('activated', 'superseded', 'rejected'))
);

create index if not exists facial_enrollment_history_student_created_idx
  on public.facial_enrollment_history (student_id, created_at desc);

alter table public.facial_enrollment_history enable row level security;
grant select on public.facial_enrollment_history to authenticated;

create policy facial_enrollment_history_read_scoped
on public.facial_enrollment_history
for select to authenticated
using (
  student_id = (select private.current_student_id())
  or (select private.is_active_organizer())
);

create or replace function public.review_attendance_request(
  p_request_id uuid,
  p_status text,
  p_reason text default null
)
returns public.attendance_requests
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_actor uuid := auth.uid();
  v_request public.attendance_requests;
begin
  if not private.is_active_organizer() then
    raise exception 'An active organizer account is required.' using errcode = '42501';
  end if;
  if p_status not in ('approved', 'rejected') then
    raise exception 'Invalid review status.' using errcode = '22023';
  end if;

  select * into v_request
  from public.attendance_requests
  where id = p_request_id
  for update;

  if not found then
    raise exception 'Attendance request was not found.' using errcode = 'P0002';
  end if;
  if v_request.request_status <> 'pending' then
    raise exception 'Attendance request has already been reviewed.' using errcode = '23505';
  end if;
  if not exists (
    select 1
    from public.attendance_records ar
    join public.event_sessions es on es.id = ar.event_session_id
    join public.events e on e.id = es.event_id
    join public.organizers o on o.id = e.organizer_id
    where ar.id = v_request.attendance_record_id and o.profile_id = v_actor
  ) then
    raise exception 'Organizer cannot review this attendance request.' using errcode = '42501';
  end if;

  if p_status = 'approved' then
    update public.attendance_records
    set attendance_status = v_request.requested_status,
        remarks = coalesce(nullif(btrim(p_reason), ''), 'Approved attendance correction'),
        updated_at = now()
    where id = v_request.attendance_record_id;
  end if;

  update public.attendance_requests
  set request_status = p_status,
      review_reason = coalesce(nullif(btrim(p_reason), ''),
        case when p_status = 'approved' then 'Approved by organizer' else 'Rejected by organizer' end),
      reviewed_by = v_actor,
      reviewed_at = now(),
      updated_at = now()
  where id = p_request_id
  returning * into v_request;

  insert into public.audit_logs (actor_user_id, action, target_type, target_id, metadata)
  values (v_actor, 'attendance_request.' || p_status, 'attendance_request', p_request_id,
    jsonb_build_object('attendance_record_id', v_request.attendance_record_id));

  return v_request;
end;
$$;

create or replace function public.review_credential_request(
  p_request_id uuid,
  p_status text,
  p_remarks text default null
)
returns public.credential_requests
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_actor uuid := auth.uid();
  v_request public.credential_requests;
  v_now timestamptz := now();
begin
  if not private.is_active_organizer() then
    raise exception 'An active organizer account is required.' using errcode = '42501';
  end if;
  if p_status not in ('approved', 'rejected') then
    raise exception 'Invalid review status.' using errcode = '22023';
  end if;

  select * into v_request
  from public.credential_requests
  where id = p_request_id
  for update;

  if not found then
    raise exception 'Credential request was not found.' using errcode = 'P0002';
  end if;
  if v_request.request_status <> 'pending' then
    raise exception 'Credential request has already been reviewed.' using errcode = '23505';
  end if;

  if p_status = 'approved' and v_request.credential_type = 'qr' then
    update public.qr_credentials
    set credential_status = 'inactive', revoked_at = v_now, updated_at = v_now
    where student_id = v_request.student_id and credential_status = 'activated';

    insert into public.qr_credentials (
      student_id, token_hash, credential_status, issued_at, expires_at
    ) values (
      v_request.student_id,
      encode(extensions.digest(gen_random_uuid()::text || v_request.student_id::text || clock_timestamp()::text, 'sha256'), 'hex'),
      'activated', v_now, v_now + interval '1 year'
    );
  end if;

  update public.credential_requests
  set request_status = p_status,
      review_remarks = coalesce(nullif(btrim(p_remarks), ''),
        case when p_status = 'approved' then 'Approved by organizer' else 'Rejected by organizer' end),
      reviewed_by = v_actor,
      reviewed_at = v_now,
      updated_at = v_now
  where id = p_request_id
  returning * into v_request;

  insert into public.audit_logs (actor_user_id, action, target_type, target_id, metadata)
  values (v_actor, 'credential_request.' || p_status, 'credential_request', p_request_id,
    jsonb_build_object('credential_type', v_request.credential_type, 'request_type', v_request.request_type));

  return v_request;
end;
$$;

create or replace function public.complete_facial_enrollment(
  p_enrollment_reference text
)
returns public.facial_profiles
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_actor uuid := auth.uid();
  v_student public.students;
  v_profile public.facial_profiles;
  v_previous_profile_id uuid;
  v_request public.credential_requests;
  v_kind text;
begin
  if p_enrollment_reference is null or btrim(p_enrollment_reference) = '' then
    raise exception 'Enrollment reference is required.' using errcode = '22023';
  end if;

  select * into v_student
  from public.students
  where profile_id = v_actor and student_status = 'enrolled'
  for update;
  if not found then
    raise exception 'An active student account is required.' using errcode = '42501';
  end if;

  select * into v_profile
  from public.facial_profiles
  where student_id = v_student.id
  for update;
  v_previous_profile_id := v_profile.id;

  if v_student.initial_facial_enrollment_completed_at is null then
    if v_profile.id is not null then
      raise exception 'Facial enrollment history is inconsistent.' using errcode = '23514';
    end if;
    v_kind := 'initial';
  else
    select * into v_request
    from public.credential_requests
    where student_id = v_student.id
      and credential_type = 'facial'
      and request_type = 're_enrollment'
      and request_status = 'approved'
    order by reviewed_at desc
    limit 1
    for update;
    if not found then
      raise exception 'An approved facial re-enrollment request is required.' using errcode = '42501';
    end if;
    v_kind := 're_enrollment';
  end if;

  insert into public.facial_profiles (
    student_id, enrollment_reference, facial_status, enrolled_at, consent_recorded_at, updated_at
  ) values (
    v_student.id, p_enrollment_reference, 'activated', now(), now(), now()
  )
  on conflict (student_id) do update
  set enrollment_reference = excluded.enrollment_reference,
      facial_status = 'activated',
      enrolled_at = excluded.enrolled_at,
      consent_recorded_at = excluded.consent_recorded_at,
      updated_at = excluded.updated_at
  returning * into v_profile;

  if v_kind = 'initial' then
    update public.students
    set initial_facial_enrollment_completed_at = now(), updated_at = now()
    where id = v_student.id;
  else
    update public.credential_requests
    set request_status = 'resolved', updated_at = now()
    where id = v_request.id;
  end if;

  update public.facial_enrollment_history
  set enrollment_status = 'superseded'
  where student_id = v_student.id and enrollment_status = 'activated';

  insert into public.facial_enrollment_history (
    student_id, credential_request_id, enrollment_reference, enrollment_kind,
    enrollment_status, replaced_profile_id, created_by
  ) values (
    v_student.id, v_request.id, p_enrollment_reference, v_kind,
    'activated', v_previous_profile_id, v_actor
  );

  insert into public.audit_logs (actor_user_id, action, target_type, target_id, metadata)
  values (v_actor, 'facial_enrollment.' || v_kind, 'facial_profile', v_profile.id,
    jsonb_build_object('student_id', v_student.id, 'credential_request_id', v_request.id));

  return v_profile;
end;
$$;

create or replace function public.set_student_credential_status(
  p_student_id uuid,
  p_credential_type text,
  p_status text
)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_actor uuid := auth.uid();
begin
  if not private.is_active_organizer() then
    raise exception 'An active organizer account is required.' using errcode = '42501';
  end if;
  if p_credential_type not in ('qr', 'facial') or p_status not in ('activated', 'inactive', 'blocked') then
    raise exception 'Invalid credential status operation.' using errcode = '22023';
  end if;

  if p_credential_type = 'qr' then
    update public.qr_credentials
    set credential_status = p_status,
        revoked_at = case when p_status = 'activated' then null else now() end,
        updated_at = now()
    where student_id = p_student_id and credential_status = 'activated';
  else
    update public.facial_profiles
    set facial_status = p_status, updated_at = now()
    where student_id = p_student_id;
  end if;

  if not found then
    raise exception 'Credential was not found.' using errcode = 'P0002';
  end if;

  insert into public.audit_logs (actor_user_id, action, target_type, target_id, metadata)
  values (v_actor, 'credential.status_changed', p_credential_type || '_credential', p_student_id,
    jsonb_build_object('status', p_status));
end;
$$;

create or replace function public.issue_qr_credential(
  p_student_id uuid,
  p_expires_at timestamptz default null
)
returns public.qr_credentials
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_actor uuid := auth.uid();
  v_credential public.qr_credentials;
begin
  if not private.is_active_organizer() then
    raise exception 'An active organizer account is required.' using errcode = '42501';
  end if;
  if not exists (select 1 from public.students where id = p_student_id) then
    raise exception 'Student was not found.' using errcode = 'P0002';
  end if;

  update public.qr_credentials
  set credential_status = 'inactive', revoked_at = now(), updated_at = now()
  where student_id = p_student_id and credential_status = 'activated';

  insert into public.qr_credentials (
    student_id, token_hash, credential_status, issued_at, expires_at
  ) values (
    p_student_id,
    encode(extensions.digest(gen_random_uuid()::text || p_student_id::text || clock_timestamp()::text, 'sha256'), 'hex'),
    'activated', now(), coalesce(p_expires_at, now() + interval '1 year')
  ) returning * into v_credential;

  insert into public.audit_logs (actor_user_id, action, target_type, target_id, metadata)
  values (v_actor, 'credential.qr_issued', 'qr_credential', v_credential.id,
    jsonb_build_object('student_id', p_student_id));

  return v_credential;
end;
$$;

revoke all on function public.review_attendance_request(uuid, text, text) from public, anon;
revoke all on function public.review_credential_request(uuid, text, text) from public, anon;
revoke all on function public.complete_facial_enrollment(text) from public, anon;
revoke all on function public.set_student_credential_status(uuid, text, text) from public, anon;
revoke all on function public.issue_qr_credential(uuid, timestamptz) from public, anon;
grant execute on function public.review_attendance_request(uuid, text, text) to authenticated;
grant execute on function public.review_credential_request(uuid, text, text) to authenticated;
grant execute on function public.complete_facial_enrollment(text) to authenticated;
grant execute on function public.set_student_credential_status(uuid, text, text) to authenticated;
grant execute on function public.issue_qr_credential(uuid, timestamptz) to authenticated;

-- Student writes go through complete_facial_enrollment so the one-time rule cannot be bypassed.
drop policy if exists facial_profiles_insert_student_once on public.facial_profiles;

do $$
begin
  if not exists (
    select 1 from pg_catalog.pg_publication_tables
    where pubname = 'supabase_realtime' and schemaname = 'public' and tablename = 'attendance_records'
  ) then alter publication supabase_realtime add table public.attendance_records; end if;
  if not exists (
    select 1 from pg_catalog.pg_publication_tables
    where pubname = 'supabase_realtime' and schemaname = 'public' and tablename = 'attendance_requests'
  ) then alter publication supabase_realtime add table public.attendance_requests; end if;
  if not exists (
    select 1 from pg_catalog.pg_publication_tables
    where pubname = 'supabase_realtime' and schemaname = 'public' and tablename = 'credential_requests'
  ) then alter publication supabase_realtime add table public.credential_requests; end if;
  if not exists (
    select 1 from pg_catalog.pg_publication_tables
    where pubname = 'supabase_realtime' and schemaname = 'public' and tablename = 'facial_profiles'
  ) then alter publication supabase_realtime add table public.facial_profiles; end if;
  if not exists (
    select 1 from pg_catalog.pg_publication_tables
    where pubname = 'supabase_realtime' and schemaname = 'public' and tablename = 'notifications'
  ) then alter publication supabase_realtime add table public.notifications; end if;
end $$;

commit;
