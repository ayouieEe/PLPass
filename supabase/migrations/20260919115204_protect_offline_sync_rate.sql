create table if not exists private.offline_sync_rate_limits (
  actor_id uuid primary key,
  last_request_at timestamptz not null
);

revoke all on private.offline_sync_rate_limits from public, anon, authenticated;

create or replace function public.sync_offline_event_attendance(
  p_local_attendance_uuid uuid,
  p_session_id uuid,
  p_student_id uuid,
  p_identification_method text,
  p_attendance_status text,
  p_time_in timestamptz,
  p_time_out timestamptz default null,
  p_checkout_identification_method text default null,
  p_remarks text default null,
  p_late_reason text default null
)
returns public.attendance_records
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_actor uuid := auth.uid();
  v_last_request_at timestamptz;
  v_session public.event_sessions;
  v_record public.attendance_records;
begin
  if not private.is_active_organizer() then
    raise exception 'An active organizer account is required.' using errcode = '42501';
  end if;

  perform pg_advisory_xact_lock(hashtextextended(v_actor::text, 0));
  select last_request_at into v_last_request_at
  from private.offline_sync_rate_limits
  where actor_id = v_actor;

  if v_last_request_at is not null and v_last_request_at > clock_timestamp() - interval '100 milliseconds' then
    raise exception 'Offline synchronization is temporarily rate limited.' using errcode = '55006';
  end if;

  insert into private.offline_sync_rate_limits(actor_id, last_request_at)
  values (v_actor, clock_timestamp())
  on conflict (actor_id) do update set last_request_at = excluded.last_request_at;

  if p_local_attendance_uuid is null or p_time_in is null then
    raise exception 'Offline attendance identity and check-in time are required.' using errcode = '22023';
  end if;
  if p_identification_method not in ('qr','facial','manual')
     or (p_checkout_identification_method is not null and p_checkout_identification_method not in ('qr','facial','manual')) then
    raise exception 'Unsupported attendance identification method.' using errcode = '22023';
  end if;
  if p_attendance_status not in ('present','late') or (p_time_out is not null and p_time_out < p_time_in) then
    raise exception 'Invalid offline attendance state.' using errcode = '22023';
  end if;

  select * into v_record from public.attendance_records where local_attendance_uuid = p_local_attendance_uuid;
  if found then return v_record; end if;

  select es.* into v_session
  from public.event_sessions es
  join public.events e on e.id = es.event_id
  where es.id = p_session_id and e.organizer_id = private.current_organizer_id();
  if not found or v_session.session_status not in ('ongoing','completed') then
    raise exception 'An owned event session is required.' using errcode = '42501';
  end if;
  if not exists (
    select 1 from public.event_participants ep
    where ep.event_id = v_session.event_id
      and ep.student_id = p_student_id
      and ep.participant_status <> 'removed'
  ) then
    raise exception 'Student is not assigned to this event.' using errcode = '42501';
  end if;

  select * into v_record
  from public.attendance_records
  where event_session_id = p_session_id and student_id = p_student_id
  for update;
  if found then
    if v_record.local_attendance_uuid is not null and v_record.local_attendance_uuid <> p_local_attendance_uuid then
      raise exception 'A different attendance record already exists for this student and session.' using errcode = '23505';
    end if;
    if v_record.time_in is distinct from p_time_in or v_record.attendance_status is distinct from p_attendance_status then
      raise exception 'The central attendance record conflicts with the offline record.' using errcode = '40001';
    end if;
    update public.attendance_records
    set local_attendance_uuid = p_local_attendance_uuid,
        time_out = coalesce(time_out, p_time_out),
        checkout_verification_method = coalesce(checkout_verification_method, p_checkout_identification_method),
        updated_at = now()
    where id = v_record.id
    returning * into v_record;
  else
    insert into public.attendance_records(
      local_attendance_uuid,event_session_id,student_id,attendance_status,verification_method,
      time_in,time_out,checkout_verification_method,recorded_at,recorded_by,remarks,late_reason_category
    ) values (
      p_local_attendance_uuid,p_session_id,p_student_id,p_attendance_status,p_identification_method,
      p_time_in,p_time_out,p_checkout_identification_method,p_time_in,v_actor,
      nullif(btrim(coalesce(p_remarks,'')),''),
      case when p_attendance_status = 'late' then coalesce(nullif(btrim(coalesce(p_late_reason,'')),''),'Other') end
    ) returning * into v_record;
  end if;
  return v_record;
end;
$$;

revoke all on function public.sync_offline_event_attendance(uuid,uuid,uuid,text,text,timestamptz,timestamptz,text,text,text) from public, anon;
grant execute on function public.sync_offline_event_attendance(uuid,uuid,uuid,text,text,timestamptz,timestamptz,text,text,text) to authenticated;
