begin;

create or replace function public.log_client_action(
  p_action text,
  p_target_type text,
  p_target_id uuid default null,
  p_metadata jsonb default '{}'::jsonb
) returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_uid uuid;
begin
  v_uid := (select auth.uid());
  
  if v_uid is null then
    raise exception 'Unauthorized';
  end if;

  if not private.is_active_organizer() then
    raise exception 'Unauthorized: Only active organizers can manually log actions';
  end if;

  insert into public.audit_logs (actor_user_id, action, target_type, target_id, metadata)
  values (v_uid, p_action, p_target_type, p_target_id, p_metadata);
end;
$$;

revoke all on function public.log_client_action(text, text, uuid, jsonb) from public, anon;
grant execute on function public.log_client_action(text, text, uuid, jsonb) to authenticated;

commit;
