begin;

-- ponytail: one transaction-wide lock keeps the low-volume publish paths correct;
-- replace with keyed locks only if event publishing becomes a measurable bottleneck.
create or replace function private.lock_event_publish_guard()
returns void
language sql
volatile
security definer
set search_path = ''
as $$
  select pg_advisory_xact_lock(hashtextextended('plpass.event-publish-guard', 0));
$$;

revoke all on function private.lock_event_publish_guard() from public, anon, authenticated;

create or replace function private.allocate_event_code(p_hint text default null)
returns text
language plpgsql
volatile
security definer
set search_path = ''
as $$
declare
  v_year text := extract(year from timezone('Asia/Manila', now()))::text;
  v_next integer;
begin
  perform private.lock_event_publish_guard();

  select coalesce(max((substring(event_code from ('^EVT-' || v_year || '-(\\d+)$'))::integer)), 0) + 1
  into v_next
  from public.events
  where event_code ~* ('^EVT-' || v_year || '-\\d+$');

  return format('EVT-%s-%s', v_year, lpad(v_next::text, 3, '0'));
end;
$$;

revoke all on function private.allocate_event_code(text) from public, anon, authenticated;

create or replace function public.get_next_event_code()
returns text
language plpgsql
volatile
security definer
set search_path = ''
as $$
begin
  if not private.is_active_organizer() then
    raise exception 'An active organizer account is required.' using errcode = '42501';
  end if;
  return private.allocate_event_code(null);
end;
$$;

revoke all on function public.get_next_event_code() from public, anon;
grant execute on function public.get_next_event_code() to authenticated;

create or replace function private.assert_event_participant_schedule_available(
  p_event_id uuid,
  p_starts_at timestamptz,
  p_ends_at timestamptz,
  p_student_ids uuid[]
) returns void
language plpgsql
volatile
security definer
set search_path = ''
as $$
declare
  v_conflict record;
begin
  perform private.lock_event_publish_guard();

  select e.event_code, e.title, e.starts_at, e.ends_at
  into v_conflict
  from public.event_participants ep
  join public.events e on e.id = ep.event_id
  where ep.student_id = any(coalesce(p_student_ids, array[]::uuid[]))
    and ep.participant_status <> 'removed'
    and e.id is distinct from p_event_id
    and e.approval_status = 'approved'
    and e.event_status not in ('draft', 'cancelled', 'completed')
    and e.starts_at < p_ends_at
    and e.ends_at > p_starts_at
  order by e.published_at nulls last, e.created_at, e.id
  limit 1;

  if found then
    raise exception 'One or more selected students are already invited to another published event during this time.'
      using errcode = 'P0001',
        detail = json_build_object(
          'eventCode', v_conflict.event_code,
          'eventTitle', v_conflict.title,
          'startsAt', v_conflict.starts_at,
          'endsAt', v_conflict.ends_at
        )::text;
  end if;
end;
$$;

revoke all on function private.assert_event_participant_schedule_available(uuid, timestamptz, timestamptz, uuid[]) from public, anon, authenticated;

create or replace function public.get_event_participant_schedule_conflicts(
  p_starts_at timestamptz,
  p_ends_at timestamptz,
  p_student_ids uuid[]
) returns table (
  student_id uuid,
  event_code text,
  event_title text,
  starts_at timestamptz,
  ends_at timestamptz
)
language plpgsql
stable
security definer
set search_path = ''
as $$
begin
  if not private.is_active_organizer() then
    raise exception 'An active organizer account is required.' using errcode = '42501';
  end if;
  if p_starts_at is null or p_ends_at is null or p_ends_at <= p_starts_at then
    raise exception 'A valid event schedule is required.' using errcode = '22023';
  end if;

  return query
  select distinct on (ep.student_id)
    ep.student_id, e.event_code, e.title, e.starts_at, e.ends_at
  from public.event_participants ep
  join public.events e on e.id = ep.event_id
  where ep.student_id = any(coalesce(p_student_ids, array[]::uuid[]))
    and ep.participant_status <> 'removed'
    and e.approval_status = 'approved'
    and e.event_status not in ('draft', 'cancelled', 'completed')
    and e.starts_at < p_ends_at
    and e.ends_at > p_starts_at
  order by ep.student_id, e.published_at nulls last, e.created_at, e.id;
end;
$$;

revoke all on function public.get_event_participant_schedule_conflicts(timestamptz, timestamptz, uuid[]) from public, anon;
grant execute on function public.get_event_participant_schedule_conflicts(timestamptz, timestamptz, uuid[]) to authenticated;

create or replace function public.add_organizer_event_participants(
  p_event_id uuid,
  p_student_ids uuid[]
) returns setof public.event_participants
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_event public.events;
  v_expected integer := cardinality(coalesce(p_student_ids, array[]::uuid[]));
  v_valid integer;
begin
  if not private.is_active_organizer() then
    raise exception 'An active organizer account is required.' using errcode = '42501';
  end if;

  perform private.lock_event_publish_guard();
  select * into v_event from public.events where id = p_event_id for update;
  if not found or v_event.organizer_id <> private.current_organizer_id() then
    raise exception 'Event was not found or is not owned by this organizer.' using errcode = '42501';
  end if;
  if v_event.event_status in ('cancelled', 'completed') then
    raise exception 'Participants cannot be added to this event.' using errcode = '22023';
  end if;

  select count(distinct s.id)::integer into v_valid
  from public.students s
  where s.id = any(coalesce(p_student_ids, array[]::uuid[]))
    and s.student_status = 'enrolled';
  if v_valid <> v_expected then
    raise exception 'One or more selected participants are not active students.' using errcode = '22023';
  end if;

  perform private.assert_event_participant_schedule_available(
    p_event_id, v_event.starts_at, v_event.ends_at, p_student_ids
  );

  return query
  insert into public.event_participants(event_id, student_id, participant_status)
  select p_event_id, student_id, 'confirmed'
  from unnest(coalesce(p_student_ids, array[]::uuid[])) as selected(student_id)
  on conflict (event_id, student_id) do update
    set participant_status = 'confirmed'
  returning *;
end;
$$;

revoke all on function public.add_organizer_event_participants(uuid, uuid[]) from public, anon;
grant execute on function public.add_organizer_event_participants(uuid, uuid[]) to authenticated;

create or replace function public.create_organizer_event(
  p_event_code text,
  p_category_id uuid,
  p_title text,
  p_description text,
  p_venue text,
  p_starts_at timestamptz,
  p_ends_at timestamptz,
  p_priority_level text,
  p_impact_score numeric,
  p_visibility text,
  p_participant_ids uuid[],
  p_objectives text[],
  p_resource_title text default null,
  p_resource_url text default null,
  p_publish_reason text default 'Published by event organizer'
) returns public.events
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_actor uuid := auth.uid();
  v_organizer_id uuid := private.current_organizer_id();
  v_event public.events;
  v_event_code text;
begin
  if not private.is_active_organizer() or v_organizer_id is null then
    raise exception 'An active organizer account is required.' using errcode = '42501';
  end if;
  if p_starts_at <= now() or p_ends_at <= p_starts_at then
    raise exception 'Event schedule must be in the future and end after it starts.' using errcode = '22023';
  end if;
  if p_visibility not in ('assigned', 'public') then
    raise exception 'Invalid event visibility.' using errcode = '22023';
  end if;
  if p_visibility = 'assigned' and coalesce(cardinality(p_participant_ids), 0) = 0 then
    raise exception 'Assigned events require at least one participant.' using errcode = '22023';
  end if;

  perform private.lock_event_publish_guard();
  v_event_code := private.allocate_event_code(p_event_code);
  perform private.assert_event_participant_schedule_available(null, p_starts_at, p_ends_at, p_participant_ids);

  insert into public.events (
    event_code, organizer_id, category_id, title, description, venue,
    starts_at, ends_at, event_status, approval_status, approval_reason,
    priority_level, impact_score, visibility, published_by, published_at
  ) values (
    v_event_code, v_organizer_id, p_category_id, btrim(p_title), nullif(btrim(p_description), ''), btrim(p_venue),
    p_starts_at, p_ends_at, 'scheduled', 'approved', coalesce(nullif(btrim(p_publish_reason), ''), 'Published by event organizer'),
    p_priority_level, p_impact_score, p_visibility, v_actor, now()
  ) returning * into v_event;

  insert into public.event_participants(event_id, student_id, participant_status)
  select v_event.id, participant_id, 'invited'
  from unnest(coalesce(p_participant_ids, array[]::uuid[])) participant_id
  join public.students s on s.id = participant_id and s.student_status = 'enrolled'
  on conflict (event_id, student_id) do nothing;

  if p_visibility = 'assigned' and (
    select count(*) from public.event_participants ep where ep.event_id = v_event.id
  ) <> cardinality(p_participant_ids) then
    raise exception 'One or more selected participants are not active students.' using errcode = '22023';
  end if;

  insert into public.event_objectives(event_id, objective_order, objective_text)
  select v_event.id, ordinal::integer, btrim(objective)
  from unnest(coalesce(p_objectives, array[]::text[])) with ordinality as valueset(objective, ordinal)
  where btrim(objective) <> '';

  if nullif(btrim(p_resource_url), '') is not null then
    if p_resource_url !~ '^https://' then
      raise exception 'Event resource URL must use HTTPS.' using errcode = '22023';
    end if;
    insert into public.event_resources(event_id, resource_title, external_url, created_by)
    values (v_event.id, coalesce(nullif(btrim(p_resource_title), ''), 'Event resource'), btrim(p_resource_url), v_actor);
  end if;

  insert into public.audit_logs(actor_user_id, action, target_type, target_id, metadata)
  values (v_actor, 'event.published', 'event', v_event.id,
    jsonb_build_object('event_code', v_event.event_code, 'visibility', p_visibility, 'participant_count', cardinality(p_participant_ids)));
  return v_event;
end;
$$;

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
  insert into public.audit_logs(actor_user_id, action, target_type, target_id, metadata)
  values (v_actor, 'event.rescheduled', 'event', p_event_id,
    jsonb_build_object('reason', btrim(p_reason), 'old_start', v_old_start, 'new_start', p_starts_at, 'old_end', v_old_end, 'new_end', p_ends_at, 'old_venue', v_old_venue, 'new_venue', p_venue));
  return v_event;
end;
$$;

revoke all on function public.create_organizer_event(text, uuid, text, text, text, timestamptz, timestamptz, text, numeric, text, uuid[], text[], text, text, text) from public, anon;
grant execute on function public.create_organizer_event(text, uuid, text, text, text, timestamptz, timestamptz, text, numeric, text, uuid[], text[], text, text, text) to authenticated;
revoke all on function public.reschedule_organizer_event(uuid, text, timestamptz, timestamptz, text) from public, anon;
grant execute on function public.reschedule_organizer_event(uuid, text, timestamptz, timestamptz, text) to authenticated;

drop policy if exists event_participants_insert_owner on public.event_participants;

commit;
