create table if not exists public.legal_documents (
  id uuid primary key default gen_random_uuid(),
  document_type text not null unique check (document_type in ('terms', 'privacy')),
  sections jsonb not null,
  version text not null,
  published_at timestamptz not null default now(),
  updated_by uuid references auth.users(id),
  updated_at timestamptz not null default now(),
  constraint legal_documents_sections_array check (jsonb_typeof(sections) = 'array'),
  constraint legal_documents_version_not_blank check (btrim(version) <> '')
);

alter table public.legal_documents enable row level security;
revoke all on table public.legal_documents from anon, authenticated;

create or replace function public.get_published_legal_document(p_document_type text)
returns table(document_type text, sections jsonb, version text, published_at timestamptz)
language plpgsql
security definer
set search_path = public, pg_catalog
as $$
begin
  if p_document_type not in ('terms', 'privacy') then
    raise exception 'Unsupported legal document type.' using errcode = '22023';
  end if;
  return query
    select d.document_type, d.sections, d.version, d.published_at
    from public.legal_documents d
    where d.document_type = p_document_type;
end;
$$;

revoke all on function public.get_published_legal_document(text) from public;
grant execute on function public.get_published_legal_document(text) to anon, authenticated;

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

  select * into v_existing from public.legal_documents where document_type = p_document_type for update;
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
  values ((select auth.uid()), 'admin.legal_document.published', 'legal_documents',
    (select id from public.legal_documents where document_type = p_document_type),
    jsonb_build_object('document_type', p_document_type, 'previous_version', v_existing.version, 'version', v_version));

  return query select * from public.get_published_legal_document(p_document_type);
end;
$$;

revoke all on function public.admin_publish_legal_document(text, jsonb, text) from public, anon;
grant execute on function public.admin_publish_legal_document(text, jsonb, text) to authenticated;

insert into public.legal_documents (document_type, sections, version, updated_by)
select 'terms', jsonb_build_array(
  jsonb_build_object('heading','Account responsibility','body','Use only your assigned PLPass account, keep your credentials private, and report suspected compromise promptly. Account details must remain accurate enough for attendance support.'),
  jsonb_build_object('heading','Acceptable use','body','Use PLPass for legitimate school attendance and request workflows. Do not probe, bypass, scrape, impersonate another student, or interfere with the service or another person’s records.'),
  jsonb_build_object('heading','Attendance integrity','body','Check in only for yourself and only through the verification method provided for the event. Sharing QR credentials, asking another person to check in, or attempting to alter a record outside the correction process is not permitted.'),
  jsonb_build_object('heading','Verification and requests','body','QR and facial verification may be offered by an event organizer. Use the Request History, Correction Requests, or Report an Issue tools when a credential, event, or attendance record needs review.'),
  jsonb_build_object('heading','Service availability','body','PLPass may be unavailable or limited during maintenance, connectivity problems, or an event-system issue. A submitted request or report is not a guarantee of approval or attendance correction.'),
  jsonb_build_object('heading','Account action','body','Access may be limited or suspended when necessary to protect the service, investigate suspected misuse, or follow institutional instructions. The institution’s established support and review channels remain available.'),
  jsonb_build_object('heading','Updates','body','The institution may update these terms as the service or its rules change. The current version and effective date are always available from the sign-in page and your Profile.'),
  jsonb_build_object('heading','Review status','body','This student-facing text is a PLPass product draft and must be reviewed and approved by the institution and its legal/privacy officers before production adoption.')
), '2026-09-21.1', null
where not exists (select 1 from public.legal_documents where document_type = 'terms');

insert into public.legal_documents (document_type, sections, version, updated_by)
select 'privacy', jsonb_build_array(
  jsonb_build_object('heading','Information used by PLPass','body','PLPass uses account and student details, event participation, attendance records, correction and issue requests, device/session information needed for security, and notification status to provide the student workspace.'),
  jsonb_build_object('heading','Verification data','body','When enabled for an event, QR credentials and facial-verification enrollment or matching data may be used to verify attendance. Facial enrollment is separate from general Terms and Privacy acceptance and is handled through the institution’s credential process.'),
  jsonb_build_object('heading','Why it is used','body','The information supports attendance recording, event participation, request review, credential support, account security, auditability, service reliability, and communications about your PLPass activity.'),
  jsonb_build_object('heading','Who can access it','body','Access is limited by role and institutional permissions. Students see their own account, attendance, and request information; authorized organizers and administrators may see the records needed for their assigned responsibilities.'),
  jsonb_build_object('heading','Security and storage','body','PLPass uses authenticated access, role-aware database policies, protected storage, and audit controls appropriate to the application. No system can promise that every service or network is risk-free.'),
  jsonb_build_object('heading','Retention','body','Records are retained and disposed of according to the institution’s approved records, attendance, and privacy requirements. This page does not invent a retention period; contact the institution for the governing schedule.'),
  jsonb_build_object('heading','Your choices and rights','body','You may review your visible records and use the correction or issue-reporting workflows when something is inaccurate. Privacy questions, access requests, or concerns should be directed to the institution’s designated support or privacy office.'),
  jsonb_build_object('heading','Policy updates','body','The current version and effective date are shown here. Material changes should be communicated through the institution’s normal student channels and reflected in the policy shown in PLPass.'),
  jsonb_build_object('heading','Review status','body','This student-facing text is a PLPass product draft and must be reviewed and approved by the institution and its legal/privacy officers before production adoption.')
), '2026-09-21.1', null
where not exists (select 1 from public.legal_documents where document_type = 'privacy');
