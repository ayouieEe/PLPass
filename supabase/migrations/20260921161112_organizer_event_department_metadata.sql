-- Do not trust the browser-provided College/Office value for organizer events.
-- The event department is authoritative and is assigned by the event-creation RPC.
create or replace function public.update_organizer_event_metadata(
  p_event_id uuid,
  p_requested_by text default null,
  p_college_office text default null,
  p_number_of_pax integer default null,
  p_institutional_category text default null,
  p_participation_status text default null,
  p_target_group text default null,
  p_urgency_points integer default 0,
  p_priority_score integer default 0,
  p_priority_tier text default 'Low',
  p_fixed_priority boolean default false
) returns public.events
language plpgsql
security definer
set search_path = '' as $$
declare
  v_event public.events;
  v_department_name text;
begin
  if not private.is_active_organizer() then
    raise exception 'An active organizer account is required.' using errcode = '42501';
  end if;
  if p_number_of_pax is not null and p_number_of_pax < 0 then
    raise exception 'No. of Pax cannot be negative.' using errcode = '22023';
  end if;

  select department.department_name
    into v_department_name
    from public.events event_row
    join public.departments department on department.id = event_row.department_id
   where event_row.id = p_event_id
     and event_row.organizer_id = private.current_organizer_id();

  if v_department_name is null then
    raise exception 'Event department not found or access denied.' using errcode = '42501';
  end if;

  update public.events
     set requested_by = nullif(btrim(p_requested_by), ''),
         college_office = v_department_name,
         number_of_pax = p_number_of_pax,
         institutional_category = p_institutional_category,
         participation_status = p_participation_status,
         target_group = p_target_group,
         urgency_points = p_urgency_points,
         priority_score = p_priority_score,
         priority_tier = p_priority_tier,
         fixed_priority = p_fixed_priority
   where id = p_event_id
     and organizer_id = private.current_organizer_id()
   returning * into v_event;

  if not found then
    raise exception 'Event not found or access denied.' using errcode = '42501';
  end if;
  return v_event;
end;
$$;

revoke all on function public.update_organizer_event_metadata(uuid, text, text, integer, text, text, text, integer, integer, text, boolean) from public, anon;
grant execute on function public.update_organizer_event_metadata(uuid, text, text, integer, text, text, text, integer, integer, text, boolean) to authenticated;
