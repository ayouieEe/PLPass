begin;

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
#variable_conflict use_column
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
