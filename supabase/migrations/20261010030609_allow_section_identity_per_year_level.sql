begin;

drop index if exists public.sections_identity_unique_idx;
create unique index sections_identity_unique_idx
  on public.sections (program_id, lower(btrim(section_name)), year_level, academic_year, semester);

commit;
