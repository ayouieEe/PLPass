begin;

-- Round two buckets and derive the third so a valid three-way distribution
-- always totals exactly 100.00 (for example, 1/3 + 1/3 + 1/3).
create or replace function public.recalculate_feedback_analytics()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  _event_id uuid;
  _total_feedback integer;
  _positive integer;
  _neutral integer;
  _negative integer;
  _positive_percent numeric;
  _neutral_percent numeric;
begin
  if tg_table_name = 'event_feedback' then
    _event_id := case when tg_op = 'DELETE' then old.event_id else new.event_id end;
  elsif tg_table_name = 'event_feedback_ratings' then
    select event_id into _event_id
    from public.event_feedback
    where id = case when tg_op = 'DELETE' then old.feedback_id else new.feedback_id end;
  end if;

  if _event_id is null then return null; end if;

  update public.event_objectives objective
  set average_rating = (
        select round(avg(rating.rating)::numeric, 2)
        from public.event_feedback_ratings rating
        join public.event_feedback feedback on feedback.id = rating.feedback_id
        where rating.objective_id = objective.id
      ),
      rating_count = (
        select count(*)
        from public.event_feedback_ratings rating
        join public.event_feedback feedback on feedback.id = rating.feedback_id
        where rating.objective_id = objective.id
      )
  where objective.event_id = _event_id;

  select count(*) into _total_feedback
  from public.event_feedback
  where event_id = _event_id
    and sentiment_label in ('positive', 'neutral', 'negative');

  if _total_feedback > 0 then
    select
      count(*) filter (where sentiment_label = 'positive'),
      count(*) filter (where sentiment_label = 'neutral'),
      count(*) filter (where sentiment_label = 'negative')
    into _positive, _neutral, _negative
    from public.event_feedback
    where event_id = _event_id;

    _positive_percent := round((_positive::numeric / _total_feedback) * 100, 2);
    _neutral_percent := round((_neutral::numeric / _total_feedback) * 100, 2);

    update public.event_summary_snapshots
    set average_sentiment_score = (
          select round(avg(sentiment_score)::numeric, 4)
          from public.event_feedback
          where event_id = _event_id
        ),
        positive_percent = _positive_percent,
        neutral_percent = _neutral_percent,
        negative_percent = 100 - _positive_percent - _neutral_percent,
        updated_at = now()
    where event_id = _event_id;
  end if;

  return null;
end;
$$;

-- Qualify table columns that collide with this function's RETURNS TABLE
-- output names. This preserves its authorization and optimistic-version flow.
create or replace function public.admin_publish_legal_document(
  p_document_type text,
  p_sections jsonb,
  p_expected_version text default null
)
returns table(document_type text, sections jsonb, version text, published_at timestamptz)
language plpgsql
security definer
set search_path = public, pg_catalog
as $$
declare
  v_existing public.legal_documents%rowtype;
  v_version text;
  v_item jsonb;
begin
  if not (select private.is_active_admin()) then
    raise exception 'An active university administrator account is required.' using errcode = '42501';
  end if;
  if p_document_type not in ('terms', 'privacy') then
    raise exception 'Unsupported legal document type.' using errcode = '22023';
  end if;
  if p_sections is null or jsonb_typeof(p_sections) <> 'array' or jsonb_array_length(p_sections) < 1 or jsonb_array_length(p_sections) > 40 then
    raise exception 'Legal content must contain between 1 and 40 sections.' using errcode = '22023';
  end if;
  for v_item in select value from jsonb_array_elements(p_sections) loop
    if jsonb_typeof(v_item) <> 'object'
      or jsonb_typeof(v_item->'heading') <> 'string'
      or jsonb_typeof(v_item->'body') <> 'string'
      or btrim(v_item->>'heading') = ''
      or btrim(v_item->>'body') = ''
      or length(v_item->>'heading') > 200
      or length(v_item->>'body') > 12000
      or (select count(*) from jsonb_object_keys(v_item)) <> 2 then
      raise exception 'Each legal section must contain only a non-empty heading and body.' using errcode = '22023';
    end if;
  end loop;

  select * into v_existing
  from public.legal_documents as existing_document
  where existing_document.document_type = p_document_type
  for update;

  if v_existing.id is not null and p_expected_version is not null and v_existing.version <> p_expected_version then
    raise exception 'This legal document changed since it was loaded. Refresh and try again.' using errcode = '40001';
  end if;
  v_version := to_char(current_date, 'YYYY-MM-DD') || '.' ||
    case when v_existing.id is null then '1' else ((split_part(v_existing.version, '.', 2))::integer + 1)::text end;

  insert into public.legal_documents (document_type, sections, version, updated_by)
  values (p_document_type, p_sections, v_version, (select auth.uid()))
  on conflict (document_type) do update set
    sections = excluded.sections,
    version = excluded.version,
    published_at = now(),
    updated_by = excluded.updated_by,
    updated_at = now();

  insert into public.audit_logs (actor_user_id, action, target_type, target_id, metadata)
  values (
    (select auth.uid()),
    'admin.legal_document.published',
    'legal_documents',
    (select published_document.id
      from public.legal_documents as published_document
      where published_document.document_type = p_document_type),
    jsonb_build_object('document_type', p_document_type, 'previous_version', v_existing.version, 'version', v_version)
  );

  return query select * from public.get_published_legal_document(p_document_type);
end;
$$;

commit;
