-- Facial-recognition decommission.
-- This migration is intentionally fail-closed: it does not delete historical
-- biometric-linked attendance or audit evidence. Review and export those rows
-- before retrying if any guard below raises an exception.
begin;

do $$
declare
  v_profiles bigint := (select count(*) from public.facial_profiles);
  v_embeddings bigint := (select count(*) from public.student_face_embeddings);
  v_history bigint := (select count(*) from public.facial_enrollment_history);
  v_requests bigint := (select count(*) from public.credential_requests where credential_type = 'facial');
  v_attempts bigint := (select count(*) from public.verification_attempts where verification_method = 'facial' or facial_profile_id is not null);
  v_attendance bigint := (select count(*) from public.attendance_records where verification_method = 'facial' or checkout_verification_method = 'facial');
  v_audit bigint := (select count(*) from public.audit_logs where lower(target_type) in ('facial_profile', 'facial_credential') or lower(action) like '%facial%' or lower(action) like '%biometric%');
  v_objects bigint := (select count(*) from storage.objects where bucket_id = 'facial-enrollments');
begin
  if v_profiles + v_embeddings + v_history + v_requests + v_attempts + v_attendance + v_audit + v_objects > 0 then
    raise exception 'Facial decommission blocked. profiles=%, embeddings=%, enrollment_history=%, credential_requests=%, verification_attempts=%, attendance_records=%, audit_refs=%, storage_objects=%',
      v_profiles, v_embeddings, v_history, v_requests, v_attempts, v_attendance, v_audit, v_objects
      using errcode = 'P0001';
  end if;
end;
$$;

-- Rebuild active credential RPCs without exposing or joining facial objects.
drop function if exists public.admin_list_credential_statuses();
create function public.admin_list_credential_statuses()
returns table (
  student_id uuid, qr_id uuid, qr_credential_status text, qr_issued_at timestamptz,
  qr_expires_at timestamptz, qr_revoked_at timestamptz, qr_last_successful_check_in_at timestamptz,
  qr_created_at timestamptz, qr_updated_at timestamptz
)
language sql security definer set search_path = ''
as $$
  select s.id, q.id, q.credential_status, q.issued_at, q.expires_at, q.revoked_at,
    q.last_successful_check_in_at, q.created_at, q.updated_at
  from public.students s
  left join lateral (
    select * from public.qr_credentials q
    where q.student_id = s.id
    order by q.issued_at desc nulls last, q.created_at desc limit 1
  ) q on true
  where (select private.is_active_admin());
$$;
revoke all on function public.admin_list_credential_statuses() from public, anon, authenticated;
grant execute on function public.admin_list_credential_statuses() to authenticated;

drop function if exists public.department_admin_list_credential_statuses(uuid[]);
create function public.department_admin_list_credential_statuses(p_student_ids uuid[] default null)
returns table (
  student_id uuid, qr_id uuid, qr_credential_status text, qr_issued_at timestamptz,
  qr_expires_at timestamptz, qr_revoked_at timestamptz, qr_last_successful_check_in_at timestamptz,
  qr_created_at timestamptz, qr_updated_at timestamptz
)
language sql security definer set search_path = ''
as $$
  select s.id, q.id, q.credential_status, q.issued_at, q.expires_at, q.revoked_at,
    q.last_successful_check_in_at, q.created_at, q.updated_at
  from public.students s
  left join lateral (
    select * from public.qr_credentials q
    where q.student_id = s.id
    order by q.issued_at desc nulls last, q.created_at desc limit 1
  ) q on true
  where (select private.is_active_department_admin())
    and s.department_id = (select private.current_department_id())
    and (p_student_ids is null or s.id = any(p_student_ids));
$$;
revoke all on function public.department_admin_list_credential_statuses(uuid[]) from public, anon, authenticated;
grant execute on function public.department_admin_list_credential_statuses(uuid[]) to authenticated;

drop function if exists public.organizer_list_credential_directory();
create function public.organizer_list_credential_directory()
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
      select 1 from public.event_participants ep join public.events e on e.id = ep.event_id
      where ep.student_id = s.id and ep.participant_status <> 'removed'
        and e.organizer_id = (select private.current_organizer_id())
    )
  order by s.student_id;
$$;
revoke all on function public.organizer_list_credential_directory() from public, anon, authenticated;
grant execute on function public.organizer_list_credential_directory() to authenticated;

create or replace function public.set_student_credential_status(p_student_id uuid, p_credential_type text, p_status text)
returns void language plpgsql security definer set search_path = '' as $$
declare v_actor uuid := auth.uid();
begin
  if not private.is_active_organizer() then raise exception 'An active organizer account is required.' using errcode = '42501'; end if;
  if p_credential_type <> 'qr' or p_status not in ('activated', 'inactive', 'blocked') then raise exception 'Invalid QR credential status operation.' using errcode = '22023'; end if;
  update public.qr_credentials set credential_status = p_status, revoked_at = case when p_status = 'activated' then null else now() end, updated_at = now()
    where id = (select id from public.qr_credentials where student_id = p_student_id order by issued_at desc, created_at desc limit 1);
  if not found then raise exception 'QR credential was not found.' using errcode = 'P0002'; end if;
  insert into public.audit_logs (actor_user_id, action, target_type, target_id, metadata)
    values (v_actor, 'credential.status_changed', 'qr_credential', p_student_id, jsonb_build_object('status', p_status));
end;
$$;
revoke all on function public.set_student_credential_status(uuid, text, text) from public, anon;
grant execute on function public.set_student_credential_status(uuid, text, text) to authenticated;

-- Remove facial-only routines and policies before dropping their tables.
do $$
declare r record;
begin
  for r in select distinct schemaname, tablename, policyname from pg_policies where schemaname = 'public' and tablename in ('facial_profiles', 'student_face_embeddings', 'facial_enrollment_history') loop
    execute format('drop policy if exists %I on public.%I', r.policyname, r.tablename);
  end loop;
  execute 'drop trigger if exists credential_requests_no_facial_reenrollment on public.credential_requests';
  for r in select distinct n.nspname as schema_name, c.relname as table_name, t.tgname as trigger_name
    from pg_trigger t join pg_class c on c.oid = t.tgrelid join pg_namespace n on n.oid = c.relnamespace
    where not t.tgisinternal and n.nspname = 'public' and c.relname in ('facial_profiles', 'facial_enrollment_history') loop
    execute format('drop trigger if exists %I on public.%I', r.trigger_name, r.table_name);
  end loop;
  for r in select p.oid::regprocedure as signature from pg_proc p join pg_namespace n on n.oid = p.pronamespace
    where n.nspname = 'public' and (p.proname ilike '%facial%' or p.proname ilike '%face%') loop
    execute format('drop function if exists %s cascade', r.signature);
  end loop;
end;
$$;

drop index if exists public.verification_attempts_facial_profile_id_idx;
alter table public.verification_attempts drop constraint if exists verification_attempts_matching_credential;
alter table public.verification_attempts drop constraint if exists verification_attempts_method_valid;
alter table public.verification_attempts drop column if exists facial_profile_id;
alter table public.verification_attempts add constraint verification_attempts_method_valid check (verification_method in ('qr'));
alter table public.verification_attempts add constraint verification_attempts_matching_credential check (
  (verification_method = 'qr' and qr_credential_id is not null) or
  (accepted = false and qr_credential_id is null)
);

alter table public.attendance_records drop constraint if exists attendance_records_method_valid;
alter table public.attendance_records add constraint attendance_records_method_valid check (verification_method in ('qr', 'manual'));
alter table public.credential_requests drop constraint if exists credential_requests_credential_type_valid;
alter table public.credential_requests add constraint credential_requests_credential_type_valid check (credential_type in ('qr'));

drop table if exists public.facial_enrollment_history cascade;
drop table if exists public.student_face_embeddings cascade;
drop table if exists public.facial_profiles cascade;

-- Storage objects are removed through the Storage API before this migration.
-- Supabase forbids deleting storage metadata directly from SQL; the empty
-- bucket can be removed separately through the Storage API/management layer.

commit;
