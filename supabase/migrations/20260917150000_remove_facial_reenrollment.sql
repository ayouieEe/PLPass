-- Facial enrollment is a one-time operation. Keep credential_requests because
-- QR/technical support requests still use it, but remove facial re-enrollment
-- as a valid future request type and preserve old rows for audit history.

alter table public.credential_requests
  drop constraint if exists credential_requests_type_valid;

alter table public.credential_requests
  add constraint credential_requests_type_valid
  check (request_type in ('replacement', 'technical_issue')) not valid;

drop policy if exists credential_requests_insert_self on public.credential_requests;
create policy credential_requests_insert_self on public.credential_requests
  for insert to authenticated
  with check (
    student_id = (select private.current_student_id())
    and not (credential_type = 'facial' and request_type = 're_enrollment')
  );

create or replace function public.prevent_facial_reenrollment()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  if new.credential_type = 'facial' and new.request_type = 're_enrollment' then
    raise exception 'Facial re-enrollment is no longer supported. Facial enrollment is a one-time process.' using errcode = '22023';
  end if;
  return new;
end;
$$;

drop trigger if exists credential_requests_no_facial_reenrollment on public.credential_requests;
create trigger credential_requests_no_facial_reenrollment
  before insert or update on public.credential_requests
  for each row execute function public.prevent_facial_reenrollment();

create or replace function public.prevent_facial_profile_replacement()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  if tg_op = 'UPDATE'
    and (new.enrollment_reference is distinct from old.enrollment_reference
      or new.enrolled_at is distinct from old.enrolled_at
      or new.consent_recorded_at is distinct from old.consent_recorded_at) then
    raise exception 'Facial enrollment is a one-time process and cannot be replaced.' using errcode = '23505';
  end if;
  return new;
end;
$$;

drop trigger if exists facial_profiles_one_time_enrollment on public.facial_profiles;
create trigger facial_profiles_one_time_enrollment
  before update on public.facial_profiles
  for each row execute function public.prevent_facial_profile_replacement();

revoke all on function public.prevent_facial_reenrollment() from public, anon, authenticated;
revoke all on function public.prevent_facial_profile_replacement() from public, anon, authenticated;

-- Replace the previous request-approved replacement branch with an explicit
-- one-time rule. Existing facial profiles remain usable and can still be
-- activated/deactivated by organizers through the status RPC.
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

  if v_student.initial_facial_enrollment_completed_at is not null
    or exists (select 1 from public.facial_profiles where student_id = v_student.id) then
    raise exception 'Facial enrollment is a one-time process and cannot be repeated.' using errcode = '23505';
  end if;

  insert into public.facial_profiles (
    student_id, enrollment_reference, facial_status, enrolled_at, consent_recorded_at, updated_at
  ) values (
    v_student.id, p_enrollment_reference, 'activated', now(), now(), now()
  ) returning * into v_profile;

  update public.students
  set initial_facial_enrollment_completed_at = now(), updated_at = now()
  where id = v_student.id;

  insert into public.facial_enrollment_history (
    student_id, credential_request_id, enrollment_reference, enrollment_kind,
    enrollment_status, replaced_profile_id, created_by
  ) values (
    v_student.id, null, p_enrollment_reference, 'initial', 'activated', null, v_actor
  );

  insert into public.audit_logs (actor_user_id, action, target_type, target_id, metadata)
  values (v_actor, 'facial_enrollment.initial', 'facial_profile', v_profile.id,
    jsonb_build_object('student_id', v_student.id));

  return v_profile;
end;
$$;

revoke all on function public.complete_facial_enrollment(text) from public, anon;
grant execute on function public.complete_facial_enrollment(text) to authenticated;
