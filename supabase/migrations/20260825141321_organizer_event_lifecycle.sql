begin;

alter table public.events
  add column if not exists priority_level text not null default 'Flexible',
  add column if not exists impact_score numeric,
  add column if not exists visibility text not null default 'assigned',
  add column if not exists published_by uuid references public.profiles(id) on delete set null,
  add column if not exists published_at timestamptz,
  add column if not exists cancellation_reason text,
  add column if not exists cancelled_by uuid references public.profiles(id) on delete set null,
  add column if not exists cancelled_at timestamptz;

alter table public.events drop constraint if exists events_visibility_valid;
alter table public.events add constraint events_visibility_valid check (visibility in ('assigned', 'public'));
alter table public.events drop constraint if exists events_priority_level_valid;
alter table public.events add constraint events_priority_level_valid check (priority_level in ('Time-Sensitive', 'Business-Critical', 'Flexible'));
alter table public.events drop constraint if exists events_impact_score_valid;
alter table public.events add constraint events_impact_score_valid check (impact_score is null or impact_score between 0 and 10);

create table if not exists public.event_resources (
  id uuid primary key default gen_random_uuid(),
  event_id uuid not null references public.events(id) on delete cascade,
  resource_title text not null,
  external_url text,
  storage_bucket text,
  storage_object_path text,
  created_by uuid not null references public.profiles(id) on delete restrict,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint event_resources_title_not_blank check (btrim(resource_title) <> ''),
  constraint event_resources_location_valid check (
    (external_url is not null and storage_bucket is null and storage_object_path is null)
    or (external_url is null and storage_bucket is not null and storage_object_path is not null)
  ),
  constraint event_resources_external_url_valid check (external_url is null or external_url ~ '^https://')
);

create index if not exists event_resources_event_id_idx on public.event_resources(event_id);
alter table public.event_resources enable row level security;
grant select, insert, update, delete on public.event_resources to authenticated;

create or replace function private.is_current_student_event_participant(p_event_id uuid)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select exists (
    select 1
    from public.event_participants ep
    where ep.event_id = p_event_id
      and ep.student_id = private.current_student_id()
      and ep.participant_status <> 'removed'
  );
$$;
revoke all on function private.is_current_student_event_participant(uuid) from public, anon;
grant execute on function private.is_current_student_event_participant(uuid) to authenticated;

drop policy if exists events_read on public.events;
create policy events_read on public.events for select to authenticated
using (
  (select private.is_active_user()) and (
    organizer_id = (select private.current_organizer_id())
    or (
      approval_status = 'approved'
      and event_status <> 'draft'
      and (
        visibility = 'public'
        or (select private.is_current_student_event_participant(events.id))
      )
    )
  )
);

create policy event_resources_read_scoped on public.event_resources for select to authenticated
using (exists (select 1 from public.events e where e.id = event_resources.event_id));
create policy event_resources_insert_owner on public.event_resources for insert to authenticated
with check (
  created_by = (select auth.uid()) and exists (
    select 1 from public.events e
    where e.id = event_resources.event_id
      and e.organizer_id = (select private.current_organizer_id())
  )
);
create policy event_resources_update_owner on public.event_resources for update to authenticated
using (exists (
  select 1 from public.events e
  where e.id = event_resources.event_id
    and e.organizer_id = (select private.current_organizer_id())
))
with check (
  created_by = (select auth.uid()) and exists (
    select 1 from public.events e
    where e.id = event_resources.event_id
      and e.organizer_id = (select private.current_organizer_id())
  )
);
create policy event_resources_delete_owner on public.event_resources for delete to authenticated
using (exists (
  select 1 from public.events e
  where e.id = event_resources.event_id
    and e.organizer_id = (select private.current_organizer_id())
));

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

  insert into public.events (
    event_code, organizer_id, category_id, title, description, venue,
    starts_at, ends_at, event_status, approval_status, approval_reason,
    priority_level, impact_score, visibility, published_by, published_at
  ) values (
    btrim(p_event_code), v_organizer_id, p_category_id, btrim(p_title), nullif(btrim(p_description), ''), btrim(p_venue),
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

create or replace function public.cancel_organizer_event(p_event_id uuid, p_reason text)
returns public.events language plpgsql security definer set search_path = '' as $$
declare v_actor uuid := auth.uid(); v_event public.events;
begin
  if not private.is_active_organizer() or p_reason is null or btrim(p_reason) = '' then
    raise exception 'An active organizer and cancellation reason are required.' using errcode = '42501';
  end if;
  select * into v_event from public.events where id = p_event_id for update;
  if not found or v_event.organizer_id <> private.current_organizer_id() then
    raise exception 'Event was not found or is not owned by this organizer.' using errcode = '42501';
  end if;
  if v_event.event_status in ('completed', 'cancelled') then
    raise exception 'Completed or cancelled events cannot be cancelled.' using errcode = '22023';
  end if;
  update public.event_sessions set session_status = 'cancelled', actual_end = coalesce(actual_end, now()), ended_reason = p_reason, updated_at = now()
  where event_id = p_event_id and session_status in ('scheduled', 'ongoing');
  update public.events set event_status = 'cancelled', cancellation_reason = btrim(p_reason), cancelled_by = v_actor, cancelled_at = now(), updated_at = now()
  where id = p_event_id returning * into v_event;
  insert into public.audit_logs(actor_user_id, action, target_type, target_id, metadata)
  values (v_actor, 'event.cancelled', 'event', p_event_id, jsonb_build_object('reason', btrim(p_reason)));
  return v_event;
end;
$$;

create or replace function public.reschedule_organizer_event(
  p_event_id uuid,
  p_venue text,
  p_starts_at timestamptz,
  p_ends_at timestamptz,
  p_reason text
) returns public.events language plpgsql security definer set search_path = '' as $$
declare v_actor uuid := auth.uid(); v_event public.events; v_old_start timestamptz; v_old_end timestamptz; v_old_venue text;
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
  select * into v_event from public.events where id = p_event_id for update;
  if not found or v_event.organizer_id <> private.current_organizer_id() then
    raise exception 'Event was not found or is not owned by this organizer.' using errcode = '42501';
  end if;
  if v_event.event_status in ('completed', 'cancelled') then
    raise exception 'Completed or cancelled events cannot be rescheduled.' using errcode = '22023';
  end if;
  v_old_start := v_event.starts_at; v_old_end := v_event.ends_at; v_old_venue := v_event.venue;
  update public.event_sessions
  set session_archive_status = 'archived', rescheduled_at = now(), rescheduled_reason = btrim(p_reason), updated_at = now()
  where event_id = p_event_id and session_archive_status = 'active';
  update public.events
  set venue = btrim(p_venue), starts_at = p_starts_at, ends_at = p_ends_at,
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
revoke all on function public.cancel_organizer_event(uuid, text) from public, anon;
grant execute on function public.cancel_organizer_event(uuid, text) to authenticated;
revoke all on function public.reschedule_organizer_event(uuid, text, timestamptz, timestamptz, text) from public, anon;
grant execute on function public.reschedule_organizer_event(uuid, text, timestamptz, timestamptz, text) to authenticated;

commit;
