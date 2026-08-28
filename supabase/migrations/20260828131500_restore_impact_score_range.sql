begin;

alter table public.events
  drop constraint if exists events_impact_score_valid;

alter table public.events
  add constraint events_impact_score_valid
  check (impact_score is null or impact_score between 0 and 10);

commit;
