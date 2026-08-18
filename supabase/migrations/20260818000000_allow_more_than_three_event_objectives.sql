begin;

alter table public.event_objectives
  drop constraint if exists event_objectives_order_valid;

alter table public.event_objectives
  add constraint event_objectives_order_valid
    check (objective_order >= 1);

commit;
