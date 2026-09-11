begin;

insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values ('event-resources', 'event-resources', false, 26214400, null)
on conflict (id) do update
set public = excluded.public,
    file_size_limit = excluded.file_size_limit,
    allowed_mime_types = excluded.allowed_mime_types;

create or replace function private.enforce_event_resource_limit()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  perform 1 from public.events where id = new.event_id for update;
  if (select count(*) from public.event_resources where event_id = new.event_id) >= 5 then
    raise exception 'An event can have at most five resources.' using errcode = '22023';
  end if;
  return new;
end;
$$;

drop trigger if exists event_resources_limit_five on public.event_resources;
create trigger event_resources_limit_five
  before insert on public.event_resources
  for each row execute function private.enforce_event_resource_limit();

drop policy if exists event_resources_read_scoped on public.event_resources;
create policy event_resources_read_scoped on public.event_resources
  for select to authenticated
  using (
    exists (
      select 1
      from public.events e
      where e.id = event_resources.event_id
        and (
          e.organizer_id = (select private.current_organizer_id())
          or (
            e.approval_status = 'approved'
            and e.event_status <> 'draft'
            and (select private.is_current_student_event_participant(e.id))
          )
        )
    )
  );

drop policy if exists event_resources_storage_read_scoped on storage.objects;
create policy event_resources_storage_read_scoped on storage.objects
  for select to authenticated
  using (
    bucket_id = 'event-resources'
    and exists (
      select 1
      from public.events e
      where e.id::text = (storage.foldername(name))[1]
        and (
          e.organizer_id = (select private.current_organizer_id())
          or (
            e.approval_status = 'approved'
            and e.event_status <> 'draft'
            and (select private.is_current_student_event_participant(e.id))
          )
        )
    )
  );

drop policy if exists event_resources_storage_insert_owner on storage.objects;
create policy event_resources_storage_insert_owner on storage.objects
  for insert to authenticated
  with check (
    bucket_id = 'event-resources'
    and exists (
      select 1
      from public.events e
      where e.id::text = (storage.foldername(name))[1]
        and e.organizer_id = (select private.current_organizer_id())
    )
  );

drop policy if exists event_resources_storage_delete_owner on storage.objects;
create policy event_resources_storage_delete_owner on storage.objects
  for delete to authenticated
  using (
    bucket_id = 'event-resources'
    and exists (
      select 1
      from public.events e
      where e.id::text = (storage.foldername(name))[1]
        and e.organizer_id = (select private.current_organizer_id())
    )
  );

commit;
