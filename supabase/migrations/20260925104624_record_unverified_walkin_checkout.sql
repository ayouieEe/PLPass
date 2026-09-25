begin;

alter table public.unverified_walkin_attendance
  add column if not exists checkout_identification_method text
  check (checkout_identification_method in ('qr', 'manual'));

create or replace function public.record_unverified_walkin_checkout(
  p_walkin_id uuid,
  p_checkout_identification_method text,
  p_time_out timestamptz
) returns public.unverified_walkin_attendance
language plpgsql security definer set search_path = '' as $$
declare
  v_actor uuid := auth.uid();
  v_walkin public.unverified_walkin_attendance;
  v_session public.event_sessions;
begin
  if v_actor is null or not private.is_active_organizer() then
    raise exception 'An active organizer account is required.' using errcode = '42501';
  end if;
  if p_walkin_id is null
     or p_checkout_identification_method not in ('qr', 'manual')
     or p_time_out is null then
    raise exception 'A valid walk-in, checkout method, and Time Out are required.' using errcode = '22023';
  end if;

  select w.* into v_walkin
  from public.unverified_walkin_attendance w
  join public.events e on e.id = w.event_id
  where w.id = p_walkin_id
    and e.organizer_id = private.current_organizer_id()
  for update of w;
  if not found then
    raise exception 'This walk-in is not available to this organizer.' using errcode = '42501';
  end if;

  -- Check-out is idempotent. Never replace an audit timestamp or method that
  -- was already recorded by a prior successful attempt.
  if v_walkin.time_out is not null then
    return v_walkin;
  end if;
  if p_time_out < v_walkin.time_in + interval '1 minute' then
    raise exception 'Time Out must be at least one minute after Time In.' using errcode = '22023';
  end if;

  select s.* into v_session
  from public.event_sessions s
  where s.id = v_walkin.event_session_id
    and s.event_id = v_walkin.event_id
    and s.session_status in ('ongoing', 'completed');
  if not found or (v_session.actual_end is not null and p_time_out > v_session.actual_end) then
    raise exception 'The event session is not available for this Time Out.' using errcode = '22023';
  end if;

  update public.unverified_walkin_attendance
  set time_out = p_time_out,
      checkout_identification_method = p_checkout_identification_method,
      updated_at = now()
  where id = v_walkin.id
  returning * into v_walkin;

  insert into public.audit_logs(actor_user_id, action, target_type, target_id, metadata)
  values (
    v_actor,
    'attendance.unverified_walkin_checked_out',
    'unverified_walkin_attendance',
    v_walkin.id,
    jsonb_build_object(
      'event_id', v_walkin.event_id,
      'session_id', v_walkin.event_session_id,
      'time_in', v_walkin.time_in,
      'time_out', v_walkin.time_out,
      'check_in_method', v_walkin.identification_method,
      'check_out_method', v_walkin.checkout_identification_method
    )
  );

  return v_walkin;
end;
$$;

revoke all on function public.record_unverified_walkin_checkout(uuid, text, timestamptz) from public, anon;
grant execute on function public.record_unverified_walkin_checkout(uuid, text, timestamptz) to authenticated;

commit;
