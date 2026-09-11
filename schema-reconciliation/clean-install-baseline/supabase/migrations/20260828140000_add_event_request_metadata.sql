begin;

alter table public.events
  add column if not exists requested_by text,
  add column if not exists college_office text,
  add column if not exists number_of_pax integer;

alter table public.events
  drop constraint if exists events_number_of_pax_valid;

alter table public.events
  add constraint events_number_of_pax_valid
  check (number_of_pax is null or number_of_pax >= 0);

create or replace function public.update_organizer_event_metadata(
  p_event_id uuid,
  p_requested_by text default null,
  p_college_office text default null,
  p_number_of_pax integer default null
) returns public.events
language plpgsql
security definer
set search_path = '' as $$
declare
  v_event public.events;
begin
  if not private.is_active_organizer() then
    raise exception 'An active organizer account is required.' using errcode = '42501';
  end if;
  if p_number_of_pax is not null and p_number_of_pax < 0 then
    raise exception 'No. of Pax cannot be negative.' using errcode = '22023';
  end if;

  update public.events
  set requested_by = nullif(btrim(p_requested_by), ''),
      college_office = nullif(btrim(p_college_office), ''),
      number_of_pax = p_number_of_pax
  where id = p_event_id
    and organizer_id = private.current_organizer_id()
  returning * into v_event;

  if not found then
    raise exception 'Event not found or access denied.' using errcode = '42501';
  end if;
  return v_event;
end;
$$;

revoke all on function public.update_organizer_event_metadata(uuid, text, text, integer) from public, anon;
grant execute on function public.update_organizer_event_metadata(uuid, text, text, integer) to authenticated;

commit;
