begin;

create table if not exists public.unverified_walkin_attendance (
  id uuid primary key default gen_random_uuid(),
  local_scan_uuid uuid not null unique,
  event_id uuid not null references public.events(id) on delete cascade,
  event_session_id uuid not null references public.event_sessions(id) on delete cascade,
  student_number text not null,
  identification_method text not null check (identification_method in ('qr', 'manual')),
  time_in timestamptz not null,
  time_out timestamptz,
  recorded_at timestamptz not null default now(),
  recorded_by uuid not null references public.profiles(id) on delete restrict,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint unverified_walkin_time_order check (time_out is null or time_out >= time_in)
);

create index if not exists unverified_walkin_event_session_idx
  on public.unverified_walkin_attendance(event_session_id, recorded_at);

alter table public.unverified_walkin_attendance enable row level security;
grant select on public.unverified_walkin_attendance to authenticated;

create policy unverified_walkin_attendance_read on public.unverified_walkin_attendance
for select to authenticated using (
  exists (
    select 1 from public.events e
    where e.id = unverified_walkin_attendance.event_id
      and (
        e.organizer_id = (select private.current_organizer_id())
        or ((select private.is_active_department_admin()) and e.department_id = (select private.current_department_id()))
      )
  )
);

create or replace function public.sync_offline_walkin_attendance(
  p_local_scan_uuid uuid,
  p_event_id uuid,
  p_session_id uuid,
  p_student_number text,
  p_identification_method text,
  p_time_in timestamptz,
  p_time_out timestamptz default null
) returns jsonb
language plpgsql security definer set search_path = '' as $$
declare
  v_actor uuid := auth.uid();
  v_event public.events;
  v_session public.event_sessions;
  v_student public.students;
  v_profile public.profiles;
  v_matches integer;
  v_existing public.unverified_walkin_attendance;
  v_attendance public.attendance_records;
  v_existing_attendance public.attendance_records;
  v_display_name text;
  v_participant_added boolean := false;
begin
  if v_actor is null or not private.is_active_organizer() then
    raise exception 'An active organizer account is required.' using errcode = '42501';
  end if;
  if p_local_scan_uuid is null or p_event_id is null or p_session_id is null
     or p_student_number !~ '^[0-9]{2}-[0-9]{5}$' or p_time_in is null
     or (p_time_out is not null and p_time_out < p_time_in)
     or p_identification_method not in ('qr','manual') then
    raise exception 'A valid student number and ordered scan timestamps are required.' using errcode = '22023';
  end if;

  select e.* into v_event from public.events e
  where e.id = p_event_id and e.organizer_id = private.current_organizer_id()
  for update;
  if not found then raise exception 'An owned event is required.' using errcode = '42501'; end if;

  select s.* into v_session from public.event_sessions s
  where s.id = p_session_id and s.event_id = v_event.id and s.session_status in ('ongoing','completed');
  if not found then raise exception 'An active or completed owned event session is required.' using errcode = '42501'; end if;
  if v_session.actual_end is not null and (p_time_in > v_session.actual_end or p_time_out > v_session.actual_end) then
    raise exception 'Walk-in scan timestamps cannot be later than the event end.' using errcode = '22023';
  end if;

  select count(*) into v_matches from public.students s
  join public.profiles p on p.id = s.profile_id and p.role = 'student' and p.account_status = 'active'
  where upper(btrim(s.student_id)) = upper(btrim(p_student_number)) and s.student_status = 'enrolled';

  if v_matches <> 1 then
    insert into public.unverified_walkin_attendance
      (local_scan_uuid, event_id, event_session_id, student_number, identification_method, time_in, time_out, recorded_by)
    values
      (p_local_scan_uuid, v_event.id, v_session.id, btrim(p_student_number), p_identification_method, p_time_in, p_time_out, v_actor)
    on conflict (local_scan_uuid) do update set
      time_out = coalesce(excluded.time_out, public.unverified_walkin_attendance.time_out),
      updated_at = now();

    select * into v_existing from public.unverified_walkin_attendance where local_scan_uuid = p_local_scan_uuid;
    return jsonb_build_object(
      'unverifiedWalkIn', jsonb_build_object(
        'id', v_existing.id,
        'localScanUuid', v_existing.local_scan_uuid,
        'studentNumber', v_existing.student_number,
        'identificationMethod', v_existing.identification_method,
        'timeIn', v_existing.time_in,
        'timeOut', v_existing.time_out
      )
    );
  end if;

  select s.* into v_student from public.students s
  join public.profiles p on p.id = s.profile_id and p.role = 'student' and p.account_status = 'active'
  where upper(btrim(s.student_id)) = upper(btrim(p_student_number)) and s.student_status = 'enrolled';
  select p.* into v_profile from public.profiles p where p.id = v_student.profile_id;
  v_display_name := concat_ws(' ', v_profile.first_name, nullif(v_profile.middle_name, ''), v_profile.last_name);
  if exists (select 1 from public.event_participants ep where ep.event_id = v_event.id and ep.student_id = v_student.id and ep.participant_status = 'removed') then
    raise exception 'This student was removed from the event and cannot be re-added as a walk-in.' using errcode = '42501';
  end if;
  insert into public.event_participants(event_id, student_id, participant_status)
  values (v_event.id, v_student.id, 'invited') on conflict(event_id, student_id) do nothing;
  get diagnostics v_matches = row_count;
  v_participant_added := v_matches = 1;

  select ar.* into v_existing_attendance from public.attendance_records ar where ar.local_attendance_uuid = p_local_scan_uuid;
  if found then
    if v_existing_attendance.event_session_id is distinct from p_session_id or v_existing_attendance.student_id is distinct from v_student.id then
      raise exception 'This offline walk-in conflicts with its previously synchronized identity.' using errcode = '23505';
    end if;
    return jsonb_build_object('attendance', to_jsonb(v_existing_attendance), 'student', jsonb_build_object('id', v_student.id, 'studentNumber', v_student.student_id, 'displayName', v_display_name));
  end if;
  v_attendance := public.sync_offline_event_attendance(
    p_local_scan_uuid, p_session_id, v_student.id, p_identification_method, 'absent', p_time_in, p_time_out,
    case when p_time_out is not null then p_identification_method else null end, null, null
  );
  if v_attendance.id is null then raise exception 'Offline walk-in synchronization was rate limited; retry safely.' using errcode = '55006'; end if;
  insert into public.audit_logs(actor_user_id, action, target_type, target_id, metadata)
  values (v_actor, 'attendance.offline_walkin_reconciled', 'event_participant', v_event.id,
    jsonb_build_object('student_id', v_student.id, 'session_id', v_session.id, 'local_scan_uuid', p_local_scan_uuid, 'participant_added', v_participant_added));
  return jsonb_build_object('attendance', to_jsonb(v_attendance), 'student', jsonb_build_object('id', v_student.id, 'studentNumber', v_student.student_id, 'displayName', v_display_name));
end;
$$;

revoke all on function public.sync_offline_walkin_attendance(uuid,uuid,uuid,text,text,timestamptz,timestamptz) from public, anon;
grant execute on function public.sync_offline_walkin_attendance(uuid,uuid,uuid,text,text,timestamptz,timestamptz) to authenticated;

commit;
