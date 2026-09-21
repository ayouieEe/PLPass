begin;

-- Events are owned by organizers. Keep the owning department synchronized so
-- department reads and reports have a stable, database-enforced scope.
update public.events as e
set department_id = o.department_id
from public.organizers as o
where o.id = e.organizer_id
  and e.department_id is distinct from o.department_id;

create or replace function private.stamp_event_department_from_organizer()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  select o.department_id
    into new.department_id
  from public.organizers as o
  where o.id = new.organizer_id;

  return new;
end;
$$;
revoke all on function private.stamp_event_department_from_organizer() from public, anon, authenticated;

drop trigger if exists stamp_event_department_from_organizer on public.events;
create trigger stamp_event_department_from_organizer
  before insert or update of organizer_id, department_id on public.events
  for each row execute function private.stamp_event_department_from_organizer();

-- University admins may observe all event operations but cannot mutate
-- organizer-owned event records through broad admin-global RLS policies.
do $$
declare
  table_name text;
begin
  foreach table_name in array array[
    'events', 'event_participants', 'event_sessions', 'attendance_sessions',
    'attendance_records', 'attendance_attempts', 'event_resources',
    'event_objectives', 'event_feedback', 'event_feedback_ratings',
    'event_feedback_tasks', 'event_feedback_task_objectives',
    'event_summary_snapshots'
  ] loop
    if to_regclass('public.' || table_name) is not null then
      execute format('drop policy if exists %I on public.%I', 'admin_global_' || table_name, table_name);
      execute format('drop policy if exists %I on public.%I', 'admin_read_' || table_name, table_name);
      execute format(
        'create policy %I on public.%I for select to authenticated using ((select private.is_active_admin()))',
        'admin_read_' || table_name,
        table_name
      );
    end if;
  end loop;
end
$$;

-- These recovery RPCs change organizer-owned events/sessions and synthesize
-- attendance. Monitoring admins must not be able to invoke them.
revoke all on function public.admin_finish_event(uuid, text) from public, anon, authenticated;
revoke all on function public.admin_recover_attendance_session(uuid, text) from public, anon, authenticated;

commit;
