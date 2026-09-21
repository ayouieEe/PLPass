-- Local, un-applied hardening migration.  Organizers may manage credentials
-- only for students participating in an event they own; active admins retain
-- institution-wide credential management.
begin;

create or replace function private.can_manage_student_credentials(p_student_id uuid)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select (select private.is_active_admin())
    or (
      (select private.is_active_organizer())
      and exists (
        select 1
        from public.event_participants ep
        join public.events e on e.id = ep.event_id
        where ep.student_id = p_student_id
          and ep.participant_status <> 'removed'
          and e.organizer_id = (select private.current_organizer_id())
      )
    );
$$;

revoke all on function private.can_manage_student_credentials(uuid) from public, anon;
grant execute on function private.can_manage_student_credentials(uuid) to authenticated;

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
  if not private.can_manage_student_credentials(p_student_id) then
    raise exception 'You can only manage credentials for participants in your own events.' using errcode = '42501';
  end if;
  if p_credential_type not in ('qr', 'facial') or p_status not in ('activated', 'inactive', 'blocked') then
    raise exception 'Invalid credential status operation.' using errcode = '22023';
  end if;

  if p_credential_type = 'qr' then
    update public.qr_credentials
    set credential_status = p_status,
        revoked_at = case when p_status = 'activated' then null else now() end,
        updated_at = now()
    where id = (
      select id
      from public.qr_credentials
      where student_id = p_student_id
      order by issued_at desc, created_at desc
      limit 1
    );
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
  if not private.can_manage_student_credentials(p_student_id) then
    raise exception 'You can only manage credentials for participants in your own events.' using errcode = '42501';
  end if;
  if not exists (select 1 from public.students where id = p_student_id) then
    raise exception 'Student was not found.' using errcode = 'P0002';
  end if;

  update public.qr_credentials
  set credential_status = 'inactive', revoked_at = now(), updated_at = now()
  where student_id = p_student_id and credential_status = 'activated';

  insert into public.qr_credentials (student_id, token_hash, credential_status, issued_at, expires_at)
  values (
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

revoke all on function public.set_student_credential_status(uuid, text, text) from public, anon;
revoke all on function public.issue_qr_credential(uuid, timestamptz) from public, anon;
grant execute on function public.set_student_credential_status(uuid, text, text) to authenticated;
grant execute on function public.issue_qr_credential(uuid, timestamptz) to authenticated;

commit;
