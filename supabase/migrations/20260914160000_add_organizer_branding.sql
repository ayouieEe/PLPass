begin;

alter table public.organizers
  add column if not exists college_logo_path text;

grant update (organization_name, college_logo_path, updated_at)
  on public.organizers to authenticated;

create index if not exists organizers_college_logo_path_idx
  on public.organizers (college_logo_path)
  where college_logo_path is not null;

-- The existing organization_name is the organizer-owned college name.
drop policy if exists organizers_update_own_branding on public.organizers;
create policy organizers_update_own_branding on public.organizers
  for update to authenticated
  using (
    (select private.is_active_admin())
    or (
      profile_id = (select auth.uid())
      and (select private.is_active_organizer())
    )
  )
  with check (
    (select private.is_active_admin())
    or (
      profile_id = (select auth.uid())
      and (select private.is_active_organizer())
    )
  );

insert into storage.buckets (id, name, public)
values ('branding-assets', 'branding-assets', false)
on conflict (id) do nothing;

drop policy if exists branding_assets_read on storage.objects;
create policy branding_assets_read on storage.objects
  for select to authenticated
  using (
    bucket_id = 'branding-assets'
    and (
      (select private.is_active_admin())
      or (storage.foldername(name))[1] = (select private.current_organizer_id())::text
    )
  );

drop policy if exists branding_assets_insert on storage.objects;
create policy branding_assets_insert on storage.objects
  for insert to authenticated
  with check (
    bucket_id = 'branding-assets'
    and (
      (select private.is_active_admin())
      or (storage.foldername(name))[1] = (select private.current_organizer_id())::text
    )
  );

drop policy if exists branding_assets_update on storage.objects;
create policy branding_assets_update on storage.objects
  for update to authenticated
  using (
    bucket_id = 'branding-assets'
    and (
      (select private.is_active_admin())
      or (storage.foldername(name))[1] = (select private.current_organizer_id())::text
    )
  )
  with check (
    bucket_id = 'branding-assets'
    and (
      (select private.is_active_admin())
      or (storage.foldername(name))[1] = (select private.current_organizer_id())::text
    )
  );

drop policy if exists branding_assets_delete on storage.objects;
create policy branding_assets_delete on storage.objects
  for delete to authenticated
  using (
    bucket_id = 'branding-assets'
    and (
      (select private.is_active_admin())
      or (storage.foldername(name))[1] = (select private.current_organizer_id())::text
    )
  );

commit;
