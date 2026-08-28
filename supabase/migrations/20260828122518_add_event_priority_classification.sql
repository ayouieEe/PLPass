begin;

alter table public.events
	add column if not exists institutional_category text,
	add column if not exists participation_status text,
	add column if not exists target_group text,
	add column if not exists urgency_points integer not null default 0,
	add column if not exists priority_score integer not null default 0,
	add column if not exists priority_tier text not null default 'Low',
	add column if not exists fixed_priority boolean not null default false;

alter table public.events
	add constraint events_institutional_category_valid check (institutional_category is null or institutional_category in ('Accreditation Linked', 'Academic or Training', 'Social or Recreational')),
	add constraint events_participation_status_valid check (participation_status is null or participation_status in ('Mandatory', 'Voluntary')),
	add constraint events_target_group_valid check (target_group is null or target_group in ('University-wide', 'College or Department-wide', 'Single Class or Organization')),
	add constraint events_priority_score_valid check (priority_score between 0 and 9),
	add constraint events_priority_tier_valid check (priority_tier in ('High', 'Medium', 'Low'));

drop function if exists public.update_organizer_event_metadata(uuid, text, text, integer);
create function public.update_organizer_event_metadata(
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
language plpgsql security definer set search_path = '' as $$
declare v_event public.events;
begin
	if not private.is_active_organizer() then raise exception 'An active organizer account is required.' using errcode = '42501'; end if;
	update public.events set requested_by = nullif(btrim(p_requested_by), ''), college_office = nullif(btrim(p_college_office), ''), number_of_pax = p_number_of_pax,
		institutional_category = p_institutional_category, participation_status = p_participation_status, target_group = p_target_group,
		urgency_points = p_urgency_points, priority_score = p_priority_score, priority_tier = p_priority_tier, fixed_priority = p_fixed_priority
	where id = p_event_id and organizer_id = private.current_organizer_id() returning * into v_event;
	if not found then raise exception 'Event not found or access denied.' using errcode = '42501'; end if;
	return v_event;
end;
$$;
revoke all on function public.update_organizer_event_metadata(uuid, text, text, integer, text, text, text, integer, integer, text, boolean) from public, anon;
grant execute on function public.update_organizer_event_metadata(uuid, text, text, integer, text, text, text, integer, integer, text, boolean) to authenticated;

commit;
