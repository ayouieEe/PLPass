begin;

-- A central/offline time disagreement is a durable business conflict, not a
-- serialization failure. Raising an exception rolled back the limiter write
-- and allowed older reconnecting clients to generate an unbounded error loop.
-- Keep a private audit marker and return NULL so the transaction commits; new
-- clients inspect the existing central row and quarantine the local record.
create table if not exists private.offline_attendance_sync_conflicts (
  actor_id uuid not null,
  local_attendance_uuid uuid not null,
  event_session_id uuid not null references public.event_sessions(id) on delete cascade,
  student_id uuid not null references public.students(id) on delete cascade,
  central_attendance_id uuid not null references public.attendance_records(id) on delete cascade,
  offline_time_in timestamptz not null,
  offline_time_out timestamptz,
  reason text not null,
  first_detected_at timestamptz not null default now(),
  last_detected_at timestamptz not null default now(),
  primary key (actor_id, local_attendance_uuid)
);

alter table private.offline_attendance_sync_conflicts enable row level security;
revoke all on private.offline_attendance_sync_conflicts from public, anon, authenticated;

create or replace function public.sync_offline_event_attendance(
  p_local_attendance_uuid uuid, p_session_id uuid, p_student_id uuid,
  p_identification_method text, p_attendance_status text, p_time_in timestamptz,
  p_time_out timestamptz default null, p_checkout_identification_method text default null,
  p_remarks text default null, p_late_reason text default null
) returns public.attendance_records
language plpgsql security definer set search_path = '' as $$
declare
  v_actor uuid := auth.uid();
  v_rate_limit_recorded timestamptz;
  v_session public.event_sessions;
  v_record public.attendance_records;
begin
  if not private.is_active_organizer() then
    raise exception 'An active organizer account is required.' using errcode = '42501';
  end if;

  if p_local_attendance_uuid is null or p_session_id is null or p_student_id is null
     or p_time_in is null
     or (p_time_out is not null and p_time_out < p_time_in + interval '1 minute')
     or p_identification_method not in ('qr','facial','manual')
     or (p_checkout_identification_method is not null
       and p_checkout_identification_method not in ('qr','facial','manual')) then
    raise exception 'Offline attendance identity and ordered time values are required.' using errcode = '22023';
  end if;

  select es.* into v_session
  from public.event_sessions es
  join public.events e on e.id = es.event_id
  where es.id = p_session_id and e.organizer_id = private.current_organizer_id();
  if not found or v_session.session_status not in ('ongoing','completed') then
    raise exception 'An owned event session is required.' using errcode = '42501';
  end if;
  if v_session.actual_end is not null
     and (p_time_in > v_session.actual_end or p_time_out > v_session.actual_end) then
    raise exception 'Offline attendance timestamps cannot be later than the session end.' using errcode = '22023';
  end if;
  if not exists (
    select 1 from public.event_participants ep
    where ep.event_id = v_session.event_id and ep.student_id = p_student_id
      and ep.participant_status <> 'removed'
  ) then
    raise exception 'Student is not assigned to this event.' using errcode = '42501';
  end if;

  -- Repeated copies of the exact rejected payload complete without touching
  -- the limiter or attendance data. A corrected payload is allowed through.
  if exists (
    select 1 from private.offline_attendance_sync_conflicts conflict
    where conflict.actor_id = v_actor
      and conflict.local_attendance_uuid = p_local_attendance_uuid
      and conflict.event_session_id = p_session_id
      and conflict.student_id = p_student_id
      and conflict.offline_time_in = p_time_in
      and conflict.offline_time_out is not distinct from p_time_out
  ) then
    return null;
  end if;

  if not pg_try_advisory_xact_lock(hashtextextended(v_actor::text, 0)) then
    return null;
  end if;

  insert into private.offline_sync_rate_limits(actor_id, last_request_at)
  values (v_actor, clock_timestamp())
  on conflict (actor_id) do update
    set last_request_at = excluded.last_request_at
    where private.offline_sync_rate_limits.last_request_at
      <= excluded.last_request_at - interval '100 milliseconds'
  returning last_request_at into v_rate_limit_recorded;
  if not found then
    return null;
  end if;

  select * into v_record from public.attendance_records
  where local_attendance_uuid = p_local_attendance_uuid for update;
  if found then
    if v_record.event_session_id is distinct from p_session_id
       or v_record.student_id is distinct from p_student_id then
      raise exception 'Offline attendance identity conflicts with its existing record.' using errcode = '23505';
    end if;
    if v_record.time_in is distinct from p_time_in
       or (v_record.time_out is not null and p_time_out is not null
         and v_record.time_out is distinct from p_time_out) then
      insert into private.offline_attendance_sync_conflicts(
        actor_id, local_attendance_uuid, event_session_id, student_id,
        central_attendance_id, offline_time_in, offline_time_out, reason
      ) values (
        v_actor, p_local_attendance_uuid, p_session_id, p_student_id,
        v_record.id, p_time_in, p_time_out, 'central_uuid_time_mismatch'
      ) on conflict (actor_id, local_attendance_uuid) do update set
        event_session_id = excluded.event_session_id,
        student_id = excluded.student_id,
        central_attendance_id = excluded.central_attendance_id,
        offline_time_in = excluded.offline_time_in,
        offline_time_out = excluded.offline_time_out,
        reason = excluded.reason,
        last_detected_at = clock_timestamp();
      return null;
    end if;
    delete from private.offline_attendance_sync_conflicts
      where actor_id = v_actor and local_attendance_uuid = p_local_attendance_uuid;
    if v_record.time_out is null and p_time_out is not null then
      update public.attendance_records set time_out = p_time_out,
        checkout_verification_method = p_checkout_identification_method,
        attendance_status = 'absent',
        finalized_at = case when v_session.session_status = 'completed'
          and (v_session.actual_end is null
            or v_session.actual_end + interval '24 hours' <= now()) then now() else null end,
        recorded_by = v_actor, updated_at = now()
      where id = v_record.id returning * into v_record;
      perform public.expire_overdue_feedback_tasks();
    end if;
    return v_record;
  end if;

  select * into v_record from public.attendance_records
  where event_session_id = p_session_id and student_id = p_student_id for update;
  if found and v_record.time_in is not null and v_record.time_in is distinct from p_time_in then
    insert into private.offline_attendance_sync_conflicts(
      actor_id, local_attendance_uuid, event_session_id, student_id,
      central_attendance_id, offline_time_in, offline_time_out, reason
    ) values (
      v_actor, p_local_attendance_uuid, p_session_id, p_student_id,
      v_record.id, p_time_in, p_time_out, 'central_session_student_time_in_mismatch'
    ) on conflict (actor_id, local_attendance_uuid) do update set
      event_session_id = excluded.event_session_id,
      student_id = excluded.student_id,
      central_attendance_id = excluded.central_attendance_id,
      offline_time_in = excluded.offline_time_in,
      offline_time_out = excluded.offline_time_out,
      reason = excluded.reason,
      last_detected_at = clock_timestamp();
    return null;
  elsif found then
    update public.attendance_records set local_attendance_uuid = p_local_attendance_uuid,
      attendance_status = 'absent',
      finalized_at = case when v_session.session_status = 'completed'
        and (coalesce(time_out, p_time_out) is null or v_session.actual_end is null
          or v_session.actual_end + interval '24 hours' <= now()) then now() else null end,
      verification_method = p_identification_method,
      time_in = p_time_in, time_out = coalesce(time_out, p_time_out),
      checkout_verification_method = coalesce(checkout_verification_method, p_checkout_identification_method),
      recorded_at = p_time_in, recorded_by = v_actor, updated_at = now()
    where id = v_record.id returning * into v_record;
  else
    insert into public.attendance_records(local_attendance_uuid,event_session_id,student_id,attendance_status,
      verification_method,time_in,time_out,checkout_verification_method,recorded_at,recorded_by,remarks,finalized_at)
    values (p_local_attendance_uuid,p_session_id,p_student_id,'absent',p_identification_method,
      p_time_in,p_time_out,p_checkout_identification_method,p_time_in,v_actor,
      nullif(btrim(coalesce(p_remarks,'')),''),
      case when v_session.session_status = 'completed'
        and (p_time_out is null or v_session.actual_end is null
          or v_session.actual_end + interval '24 hours' <= now()) then now() else null end)
    returning * into v_record;
  end if;
  delete from private.offline_attendance_sync_conflicts
    where actor_id = v_actor and local_attendance_uuid = p_local_attendance_uuid;
  perform public.expire_overdue_feedback_tasks();
  return v_record;
end;
$$;

revoke all on function public.sync_offline_event_attendance(
  uuid,uuid,uuid,text,text,timestamptz,timestamptz,text,text,text
) from public, anon;
grant execute on function public.sync_offline_event_attendance(
  uuid,uuid,uuid,text,text,timestamptz,timestamptz,text,text,text
) to authenticated;

commit;
