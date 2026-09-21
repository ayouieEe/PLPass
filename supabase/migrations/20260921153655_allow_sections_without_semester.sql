-- Sections are identified by their name, program, year level, and academic
-- year. A semester is not part of the section creation flow and may be left
-- blank; the current semester remains an independent system setting used by
-- event and student workflows.
alter table public.sections
  drop constraint if exists sections_semester_not_blank;
