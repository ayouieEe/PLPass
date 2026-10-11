begin;

-- Keep the trusted reschedule RPC atomic: the stale-row cleanup belongs in the
-- existing function, immediately after the event schedule changes.
create or replace function public.reschedule_organizer_event(
  p_event_id uuid,
  p_venue text,
  p_starts_at timestamptz,
  p_ends_at timestamptz,
  p_reason text
) returns public.events
language plpgsql security definer set search_path = '' as $$
declare
  v_actor uuid := auth.uid();
  v_event public.events;
  v_old_start timestamptz;
  v_old_end timestamptz;
  v_old_venue text;
  v_student_ids uuid[];
begin
  if not private.is_active_organizer() then
    raise exception 'An active organizer account is required.' using errcode = '42501';
  end if;
  if p_reason is null or length(btrim(p_reason)) < 5 then
    raise exception 'A rescheduling reason of at least 5 characters is required.' using errcode = '22023';
  end if;
  if p_starts_at <= now() or p_ends_at <= p_starts_at then
    raise exception 'The new schedule must be in the future and end after it starts.' using errcode = '22023';
  end if;

  perform private.lock_event_publish_guard();
  select * into v_event from public.events where id = p_event_id for update;
  if not found or v_event.organizer_id <> private.current_organizer_id() then
    raise exception 'Event was not found or is not owned by this organizer.' using errcode = '42501';
  end if;
  if v_event.event_status = 'completed' then
    raise exception 'Completed events cannot be rescheduled.' using errcode = '22023';
  end if;

  select coalesce(array_agg(ep.student_id), array[]::uuid[]) into v_student_ids
  from public.event_participants ep
  where ep.event_id = p_event_id and ep.participant_status <> 'removed';
  perform private.assert_event_participant_schedule_available(p_event_id, p_starts_at, p_ends_at, v_student_ids);

  v_old_start := v_event.starts_at; v_old_end := v_event.ends_at; v_old_venue := v_event.venue;
  update public.event_sessions
  set session_archive_status = 'archived', rescheduled_at = now(), rescheduled_reason = btrim(p_reason), updated_at = now()
  where event_id = p_event_id and session_archive_status = 'active';
  update public.events
  set venue = btrim(p_venue), starts_at = p_starts_at, ends_at = p_ends_at,
      event_status = 'scheduled', cancellation_reason = null, cancelled_by = null, cancelled_at = null,
      last_rescheduled_at = now(), reschedule_count = coalesce(reschedule_count, 0) + 1, updated_at = now()
  where id = p_event_id returning * into v_event;

  update public.notifications
  set notification_status = 'read',
      read_at = coalesce(read_at, now()),
      requires_action = false
  where recipient_id = (select profile_id from public.organizers where id = v_event.organizer_id)
    and notification_code = 'event.lifecycle.unstarted'
    and related_type = 'event'
    and reference_id = p_event_id
    and notification_status = 'unread';

  insert into public.audit_logs(actor_user_id, action, target_type, target_id, metadata)
  values (v_actor, 'event.rescheduled', 'event', p_event_id,
    jsonb_build_object('reason', btrim(p_reason), 'old_start', v_old_start, 'new_start', p_starts_at, 'old_end', v_old_end, 'new_end', p_ends_at, 'old_venue', v_old_venue, 'new_venue', p_venue));
  return v_event;
end;
$$;

revoke all on function public.reschedule_organizer_event(uuid, text, timestamptz, timestamptz, text) from public, anon;
grant execute on function public.reschedule_organizer_event(uuid, text, timestamptz, timestamptz, text) to authenticated;

commit;
