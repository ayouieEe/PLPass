begin;

-- The descriptor itself is intentionally excluded from the table-level SELECT
-- grant. Only active organizers may retrieve it for a live attendance match.
create or replace function public.get_facial_descriptor_for_organizer(p_student_id uuid)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_descriptor jsonb;
begin
  if auth.uid() is null or not (select private.is_active_organizer()) then
    raise exception 'Only active organizers may verify a facial enrollment.' using errcode = '42501';
  end if;

  select face_descriptor into v_descriptor
  from public.facial_profiles
  where student_id = p_student_id and facial_status = 'activated';

  return v_descriptor;
end;
$$;

revoke all on function public.get_facial_descriptor_for_organizer(uuid) from public, anon;
grant execute on function public.get_facial_descriptor_for_organizer(uuid) to authenticated;

commit;
