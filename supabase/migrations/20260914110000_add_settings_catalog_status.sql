-- Settings-managed catalogs are deactivated, never deleted, so historical records remain valid.
alter table public.departments add column if not exists is_active boolean not null default true;
alter table public.programs add column if not exists is_active boolean not null default true;
alter table public.sections add column if not exists is_active boolean not null default true;
alter table public.event_categories add column if not exists is_active boolean not null default true;

grant select, insert, update on public.departments, public.programs, public.sections, public.event_categories to authenticated;

drop policy if exists departments_settings_read on public.departments;
create policy departments_settings_read on public.departments for select to authenticated using ((select private.is_active_user()));
drop policy if exists departments_settings_write on public.departments;
create policy departments_settings_write on public.departments for all to authenticated using ((select private.is_active_organizer())) with check ((select private.is_active_organizer()));

drop policy if exists programs_settings_read on public.programs;
create policy programs_settings_read on public.programs for select to authenticated using ((select private.is_active_user()));
drop policy if exists programs_settings_write on public.programs;
create policy programs_settings_write on public.programs for all to authenticated using ((select private.is_active_organizer())) with check ((select private.is_active_organizer()));

drop policy if exists sections_settings_read on public.sections;
create policy sections_settings_read on public.sections for select to authenticated using ((select private.is_active_user()));
drop policy if exists sections_settings_write on public.sections;
create policy sections_settings_write on public.sections for all to authenticated using ((select private.is_active_organizer())) with check ((select private.is_active_organizer()));

drop policy if exists event_categories_settings_read on public.event_categories;
create policy event_categories_settings_read on public.event_categories for select to authenticated using ((select private.is_active_user()));
drop policy if exists event_categories_settings_write on public.event_categories;
create policy event_categories_settings_write on public.event_categories for all to authenticated using ((select private.is_active_organizer())) with check ((select private.is_active_organizer()));
