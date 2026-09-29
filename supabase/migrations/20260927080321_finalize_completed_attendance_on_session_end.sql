begin;

-- A completed check-in/check-out pair is a final attendance outcome as soon
-- as its session closes.  The previous close path finalized only incomplete
-- rows, leaving completed rows in the UI's pending state and causing final
-- summaries to classify every attendee as absent.
create or replace function public.end_event_attendance_session(p_session_id uuid, p_reason text)
returns public.event_sessions
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_actor uuid := auth.uid();
  v_session public.event_sessions;
  v_now timestamptz := now();
  v_absent_count integer := 0;
begin
  if not private.is_active_organizer() then
    raise exception 'An active organizer account is required.' using errcode = '42501';
  end if;
  if p_reason is null or length(btrim(p_reason)) < 5 then
    raise exception 'An ending reason of at least 5 characters is required.' using errcode = '22023';
  end if;

  select es.* into v_session
  from public.event_sessions es
  join public.events e on e.id = es.event_id
  where es.id = p_session_id
    and e.organizer_id = private.current_organizer_id()
  for update of es;
  if not found or v_session.session_status <> 'ongoing' then
    raise exception 'Only an active owned session can be ended.' using errcode = '22023';
  end if;

  update public.event_sessions
  set session_status = 'completed', actual_end = v_now,
      ended_reason = btrim(p_reason), updated_at = v_now
  where id = p_session_id
  returning * into v_session;

  -- Finalize fully captured attendance first. The completion trigger and
  -- the following update cover incomplete/missing attendance as absent.
  update public.attendance_records
  set finalized_at = v_now,
      updated_at = v_now
  where event_session_id = v_session.id
    and time_in is not null
    and time_out is not null
    and finalized_at is null;

  update public.attendance_records
  set attendance_status = 'absent',
      finalized_at = v_now,
      remarks = concat_ws(E'\n', remarks, 'Attendance finalized absent: Time In or Time Out was not completed before session close.'),
      updated_at = v_now
  where event_session_id = v_session.id
    and finalized_at is null
    and (time_in is null or time_out is null);

  insert into public.attendance_records(event_session_id, student_id, attendance_status,
    verification_method, recorded_at, recorded_by, remarks, finalized_at)
  select v_session.id, ep.student_id, 'absent', 'manual', v_now, v_actor,
    'Automatically marked absent when session ended: no attendance was recorded.', v_now
  from public.event_participants ep
  where ep.event_id = v_session.event_id
    and ep.participant_status <> 'removed'
    and not exists (
      select 1 from public.attendance_records ar
      where ar.event_session_id = v_session.id and ar.student_id = ep.student_id
    )
  on conflict (event_session_id, student_id) where event_session_id is not null do nothing;
  get diagnostics v_absent_count = row_count;

  update public.events set event_status = 'completed', updated_at = v_now
  where id = v_session.event_id;
  insert into public.audit_logs(actor_user_id, action, target_type, target_id, metadata)
  values (v_actor, 'attendance_session.ended', 'event_session', p_session_id,
    jsonb_build_object('event_id', v_session.event_id, 'reason', btrim(p_reason), 'automatically_absent', v_absent_count));
  return v_session;
end;
$$;

revoke all on function public.end_event_attendance_session(uuid, text) from public, anon;
grant execute on function public.end_event_attendance_session(uuid, text) to authenticated;

-- Repair any sessions completed under the old close path.  This is
-- intentionally limited to complete pairs: incomplete records retain the
-- existing absent/finalization handling.
update public.attendance_records ar
set finalized_at = coalesce(es.actual_end, ar.time_out, ar.time_in, now()),
    updated_at = now()
from public.event_sessions es
where es.id = ar.event_session_id
  and es.session_status = 'completed'
  and ar.time_in is not null
  and ar.time_out is not null
  and ar.finalized_at is null;

commit;
