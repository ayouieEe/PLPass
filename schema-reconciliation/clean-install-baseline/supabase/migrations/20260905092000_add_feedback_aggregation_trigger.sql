begin;

alter table public.event_objectives
  add column average_rating numeric(3, 2);

create or replace function public.recalculate_feedback_analytics()
returns trigger
language plpgsql
security definer
as $$
declare
  _event_id uuid;
  _total_feedback integer;
  _positive integer;
  _neutral integer;
  _negative integer;
begin
  -- Get the event ID based on which table triggered this
  if TG_TABLE_NAME = 'event_feedback' then
    if TG_OP = 'DELETE' then
      _event_id := OLD.event_id;
    else
      _event_id := NEW.event_id;
    end if;
  elsif TG_TABLE_NAME = 'event_feedback_ratings' then
    if TG_OP = 'DELETE' then
      select event_id into _event_id from public.event_feedback where id = OLD.feedback_id;
    else
      select event_id into _event_id from public.event_feedback where id = NEW.feedback_id;
    end if;
  end if;

  if _event_id is null then
    return null;
  end if;

  -- 1. Recalculate Objective Averages (Quantitative)
  update public.event_objectives eo
  set average_rating = (
    select round(avg(efr.rating)::numeric, 2)
    from public.event_feedback_ratings efr
    join public.event_feedback ef on ef.id = efr.feedback_id
    where efr.objective_id = eo.id
  )
  where eo.event_id = _event_id;

  -- 2. Recalculate Sentiment Percentages (Qualitative)
  select count(*) into _total_feedback
  from public.event_feedback
  where event_id = _event_id and sentiment_label is not null;

  if _total_feedback > 0 then
    select 
      count(*) filter (where sentiment_label = 'positive'),
      count(*) filter (where sentiment_label = 'neutral'),
      count(*) filter (where sentiment_label = 'negative')
    into _positive, _neutral, _negative
    from public.event_feedback
    where event_id = _event_id;

    update public.event_summary_snapshots
    set 
      average_sentiment_score = (
        select round(avg(sentiment_score)::numeric, 4)
        from public.event_feedback
        where event_id = _event_id
      ),
      positive_percent = round((_positive::numeric / _total_feedback) * 100, 2),
      neutral_percent = round((_neutral::numeric / _total_feedback) * 100, 2),
      negative_percent = round((_negative::numeric / _total_feedback) * 100, 2),
      updated_at = now()
    where event_id = _event_id;
  end if;

  return null;
end;
$$;

create trigger on_feedback_changed
  after insert or update or delete on public.event_feedback
  for each row execute function public.recalculate_feedback_analytics();

create trigger on_feedback_rating_changed
  after insert or update or delete on public.event_feedback_ratings
  for each row execute function public.recalculate_feedback_analytics();

commit;
