begin;

alter table public.profiles
  add column if not exists name_extension text;

alter table public.profiles
  drop constraint if exists profiles_name_extension_valid;

alter table public.profiles
  add constraint profiles_name_extension_valid
  check (name_extension is null or name_extension in ('Jr.', 'Sr.', 'II', 'III', 'IV', 'V'));

comment on column public.profiles.name_extension is
  'Optional generational extension selected when an account is created.';

commit;
