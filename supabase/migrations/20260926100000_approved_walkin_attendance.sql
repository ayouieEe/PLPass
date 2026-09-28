begin;

alter table public.event_participants drop constraint if exists event_participants_status_valid;
alter table public.event_participants add constraint event_participants_status_valid
  check (participant_status in ('invited', 'confirmed', 'walk_in', 'removed'));

alter table public.attendance_records add column if not exists attendance_origin text not null default 'invited'
  check (attendance_origin in ('invited', 'walk_in'));

create index if not exists attendance_records_walkin_origin_idx
  on public.attendance_records(event_session_id, attendance_origin);

-- A walk-in is admitted after an explicit organizer decision.  Never queue an
-- invitation for that decision: the event is already in progress.
create or replace function private.queue_event_email_after_participant_insert()
returns trigger language plpgsql security definer set search_path = '' as $$
begin
  if new.participant_status not in ('removed', 'walk_in') then
    perform private.queue_event_participant_invitation(new.event_id, new.student_id);
  end if;
  return new;
end;
$$;

create or replace function private.queue_event_email_after_participant_reactivated()
returns trigger language plpgsql security definer set search_path = '' as $$
begin
  if old.participant_status = 'removed' and new.participant_status not in ('removed', 'walk_in') then
    perform private.queue_event_participant_invitation(new.event_id, new.student_id);
  end if;
  return new;
end;
$$;

create or replace function public.record_approved_event_walkin(
  p_local_scan_uuid uuid,
  p_event_id uuid,
  p_session_id uuid,
  p_student_number text,
  p_identification_method text,
  p_time_in timestamptz,
  p_time_out timestamptz default null,
  p_checkout_identification_method text default null
) returns jsonb language plpgsql security definer set search_path = '' as $$
declare
  v_actor uuid := auth.uid(); v_event public.events; v_session public.event_sessions;
  v_student public.students; v_matches integer; v_record public.attendance_records; v_display_name text; v_participant_status text;
  v_checkout text := coalesce(p_checkout_identification_method, p_identification_method);
begin
  if v_actor is null or not private.is_active_organizer() then
    raise exception 'An active organizer account is required.' using errcode = '42501';
  end if;
  if p_local_scan_uuid is null or p_student_number !~ '^[0-9]{2}-[0-9]{5}$'
     or p_identification_method not in ('qr','manual') or p_time_in is null
     or (p_time_out is not null and p_time_out < p_time_in + interval '1 minute')
     or v_checkout not in ('qr','manual') then
    return jsonb_build_object('disposition','discarded_permanent_conflict','reasonCode','invalid_walkin');
  end if;
  select e.* into v_event from public.events e where e.id=p_event_id and e.organizer_id=private.current_organizer_id() for update;
  if not found then raise exception 'An owned event is required.' using errcode = '42501'; end if;
  select s.* into v_session from public.event_sessions s where s.id=p_session_id and s.event_id=v_event.id and s.session_status in ('ongoing','completed');
  if not found or (v_session.actual_end is not null and (p_time_in > v_session.actual_end or p_time_out > v_session.actual_end)) then
    return jsonb_build_object('disposition','discarded_permanent_conflict','reasonCode','session_not_available');
  end if;
  select count(*) into v_matches from public.students s join public.profiles p on p.id=s.profile_id
    where upper(btrim(s.student_id))=upper(btrim(p_student_number)) and s.student_status='enrolled' and p.role='student' and p.account_status='active';
  if v_matches <> 1 then return jsonb_build_object('disposition','discarded_permanent_conflict','reasonCode','student_not_found'); end if;
  select s.* into v_student
    from public.students s join public.profiles p on p.id=s.profile_id
    where upper(btrim(s.student_id))=upper(btrim(p_student_number))
    order by s.id limit 1;
  select concat_ws(' ', p.first_name, p.middle_name, p.last_name) into v_display_name
    from public.profiles p where p.id=v_student.profile_id;
  select participant_status into v_participant_status from public.event_participants where event_id=v_event.id and student_id=v_student.id;
  if v_participant_status='removed' then
    return jsonb_build_object('disposition','discarded_permanent_conflict','reasonCode','student_removed');
  end if;
  if v_participant_status in ('invited','confirmed') then
    return jsonb_build_object('disposition','discarded_permanent_conflict','reasonCode','student_is_already_invited');
  end if;
  insert into public.event_participants(event_id,student_id,participant_status) values(v_event.id,v_student.id,'walk_in')
    on conflict(event_id,student_id) do nothing;
  select * into v_record from public.attendance_records where event_session_id=p_session_id and student_id=v_student.id for update;
  if found and v_record.local_attendance_uuid is not null and v_record.local_attendance_uuid <> p_local_scan_uuid then
    return jsonb_build_object('disposition','discarded_permanent_conflict','reasonCode','duplicate_student');
  end if;
  insert into public.attendance_records(event_session_id,student_id,attendance_status,attendance_origin,verification_method,checkout_verification_method,time_in,time_out,recorded_at,recorded_by,local_attendance_uuid)
  values(p_session_id,v_student.id,case when v_session.late_cutoff_at is not null and p_time_in>v_session.late_cutoff_at then 'late' else 'present' end,'walk_in',p_identification_method,case when p_time_out is null then null else v_checkout end,p_time_in,p_time_out,p_time_in,v_actor,p_local_scan_uuid)
  on conflict(event_session_id,student_id) where event_session_id is not null do update set
    time_out=coalesce(excluded.time_out,public.attendance_records.time_out),
    checkout_verification_method=coalesce(excluded.checkout_verification_method,public.attendance_records.checkout_verification_method),
    attendance_origin='walk_in', updated_at=now()
  returning * into v_record;
  insert into public.audit_logs(actor_user_id,action,target_type,target_id,metadata) values
    (v_actor,'attendance.walkin_admitted','attendance_record',v_record.id,jsonb_build_object('event_id',v_event.id,'session_id',v_session.id,'student_id',v_student.id,'local_scan_uuid',p_local_scan_uuid));
  return jsonb_build_object('disposition','confirmed_walk_in','attendance',to_jsonb(v_record),'student',jsonb_build_object('id',v_student.id,'studentNumber',v_student.student_id,'displayName',v_display_name));
end;
$$;
revoke all on function public.record_approved_event_walkin(uuid,uuid,uuid,text,text,timestamptz,timestamptz,text) from public, anon;
grant execute on function public.record_approved_event_walkin(uuid,uuid,uuid,text,text,timestamptz,timestamptz,text) to authenticated;

-- Legacy rows become normal walk-ins only when the student ID resolves once.
do $$
declare r record; v_student uuid; v_matches integer; v_late_cutoff timestamptz;
begin
  for r in select * from public.unverified_walkin_attendance loop
    select count(*) into v_matches from public.students s join public.profiles p on p.id=s.profile_id
      where upper(btrim(s.student_id))=upper(btrim(r.student_number)) and s.student_status='enrolled' and p.role='student' and p.account_status='active';
    if v_matches=1 then
      select s.id into v_student from public.students s join public.profiles p on p.id=s.profile_id
        where upper(btrim(s.student_id))=upper(btrim(r.student_number)) and s.student_status='enrolled' and p.role='student' and p.account_status='active'
        order by s.id limit 1;
      select late_cutoff_at into v_late_cutoff from public.event_sessions where id=r.event_session_id;
      insert into public.event_participants(event_id,student_id,participant_status) values(r.event_id,v_student,'walk_in') on conflict(event_id,student_id) do nothing;
      insert into public.attendance_records(event_session_id,student_id,attendance_status,attendance_origin,verification_method,checkout_verification_method,time_in,time_out,recorded_at,recorded_by,local_attendance_uuid)
      values(r.event_session_id,v_student,case when v_late_cutoff is not null and r.time_in>v_late_cutoff then 'late' else 'present' end,'walk_in',r.identification_method,r.checkout_identification_method,r.time_in,r.time_out,r.recorded_at,r.recorded_by,r.local_scan_uuid)
      on conflict(event_session_id,student_id) where event_session_id is not null do update set
        time_out=coalesce(excluded.time_out, public.attendance_records.time_out),
        checkout_verification_method=coalesce(excluded.checkout_verification_method, public.attendance_records.checkout_verification_method),
        attendance_origin='walk_in', updated_at=now();
    end if;
  end loop;
end $$;
drop function if exists public.sync_offline_walkin_attendance(uuid,uuid,uuid,text,text,timestamptz,timestamptz);
drop function if exists public.sync_offline_walkin_attendance_v2(uuid,uuid,uuid,text,text,timestamptz,timestamptz,text);
drop function if exists public.record_unverified_walkin_checkout(uuid,text,timestamptz);
drop table if exists public.unverified_walkin_attendance;
commit;
