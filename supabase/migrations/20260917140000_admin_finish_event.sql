begin;

create or replace function public.admin_finish_event(
  p_event_id uuid,
  p_reason text
) returns public.events
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_actor uuid := (select auth.uid());
  v_event public.events;
  v_now timestamptz := now();
  v_absent_count integer;
  v_session_count integer;
begin
  if not (select private.is_active_admin()) then
    raise exception 'An active administrator account is required.' using errcode = '42501';
  end if;
  if p_reason is null or length(btrim(p_reason)) < 5 then
    raise exception 'A finish reason of at least 5 characters is required.' using errcode = '22023';
  end if;

  select * into v_event
  from public.events
  where id = p_event_id
  for update;
  if not found then
    raise exception 'The event could not be found.' using errcode = 'P0002';
  end if;
  if v_event.event_status = 'cancelled' then
    raise exception 'Cancelled events cannot be finished.' using errcode = '22023';
  end if;

  insert into public.attendance_records (
    event_session_id, student_id, attendance_status, verification_method,
    recorded_at, recorded_by, remarks
  )
  select
    s.id, ep.student_id, 'absent', 'manual', v_now, v_actor,
    'Automatically marked absent during administrative event completion: ' || btrim(p_reason)
  from public.event_sessions s
  join public.event_participants ep on ep.event_id = s.event_id
  where s.event_id = p_event_id
    and s.session_status = 'ongoing'
    and ep.participant_status <> 'removed'
    and not exists (
      select 1 from public.attendance_records ar
      where ar.event_session_id = s.id and ar.student_id = ep.student_id
    )
  on conflict (event_session_id, student_id) where event_session_id is not null do nothing;
  get diagnostics v_absent_count = row_count;

  update public.event_sessions
  set session_status = 'completed', actual_end = v_now,
      ended_reason = btrim(p_reason), updated_at = v_now
  where event_id = p_event_id and session_status = 'ongoing';
  get diagnostics v_session_count = row_count;

  update public.events
  set event_status = 'completed', updated_at = v_now
  where id = p_event_id
  returning * into v_event;

  insert into public.audit_logs(actor_user_id, action, target_type, target_id, metadata)
  values (
    v_actor, 'system.event_finished', 'event', p_event_id,
    jsonb_build_object('reason', btrim(p_reason), 'completed_sessions', v_session_count, 'automatically_absent', v_absent_count)
  );
  return v_event;
end;
$$;

revoke all on function public.admin_finish_event(uuid, text) from public, anon;
grant execute on function public.admin_finish_event(uuid, text) to authenticated;

commit;
