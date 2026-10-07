


SET statement_timeout = 0;
SET lock_timeout = 0;
SET idle_in_transaction_session_timeout = 0;
SET client_encoding = 'UTF8';
SET standard_conforming_strings = on;
SELECT pg_catalog.set_config('search_path', '', false);
SET check_function_bodies = false;
SET xmloption = content;
SET client_min_messages = warning;
SET row_security = off;


CREATE SCHEMA IF NOT EXISTS "public";


ALTER SCHEMA "public" OWNER TO "pg_database_owner";


COMMENT ON SCHEMA "public" IS 'standard public schema';


SET default_tablespace = '';

SET default_table_access_method = "heap";


CREATE TABLE IF NOT EXISTS "public"."event_participants" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "event_id" "uuid" NOT NULL,
    "student_id" "uuid" NOT NULL,
    "participant_status" "text" DEFAULT 'confirmed'::"text" NOT NULL,
    "registered_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "updated_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    CONSTRAINT "event_participants_status_valid" CHECK (("participant_status" = ANY (ARRAY['invited'::"text", 'confirmed'::"text", 'walk_in'::"text", 'removed'::"text"])))
);


ALTER TABLE "public"."event_participants" OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."add_organizer_event_participants"("p_event_id" "uuid", "p_student_ids" "uuid"[]) RETURNS SETOF "public"."event_participants"
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO ''
    AS $$
declare
  v_event public.events;
  v_expected integer := cardinality(coalesce(p_student_ids, array[]::uuid[]));
  v_valid integer;
begin
  if not private.is_active_organizer() then
    raise exception 'An active organizer account is required.' using errcode = '42501';
  end if;

  perform private.lock_event_publish_guard();
  select * into v_event from public.events where id = p_event_id for update;
  if not found or v_event.organizer_id <> private.current_organizer_id() then
    raise exception 'Event was not found or is not owned by this organizer.' using errcode = '42501';
  end if;
  if v_event.event_status in ('cancelled', 'completed') then
    raise exception 'Participants cannot be added to this event.' using errcode = '22023';
  end if;

  select count(distinct s.id)::integer into v_valid
  from public.students s
  where s.id = any(coalesce(p_student_ids, array[]::uuid[]))
    and s.student_status = 'enrolled';
  if v_valid <> v_expected then
    raise exception 'One or more selected participants are not active students.' using errcode = '22023';
  end if;

  perform private.assert_event_participant_schedule_available(
    p_event_id, v_event.starts_at, v_event.ends_at, p_student_ids
  );

  return query
  insert into public.event_participants(event_id, student_id, participant_status)
  select p_event_id, student_id, 'confirmed'
  from unnest(coalesce(p_student_ids, array[]::uuid[])) as selected(student_id)
  on conflict (event_id, student_id) do update
    set participant_status = 'confirmed'
  returning *;
end;
$$;


ALTER FUNCTION "public"."add_organizer_event_participants"("p_event_id" "uuid", "p_student_ids" "uuid"[]) OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."events" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "event_code" "text" NOT NULL,
    "organizer_id" "uuid" NOT NULL,
    "department_id" "uuid",
    "category_id" "uuid" NOT NULL,
    "title" "text" NOT NULL,
    "description" "text",
    "venue" "text" NOT NULL,
    "starts_at" timestamp with time zone NOT NULL,
    "ends_at" timestamp with time zone NOT NULL,
    "event_status" "text" DEFAULT 'draft'::"text" NOT NULL,
    "approval_status" "text" DEFAULT 'pending'::"text" NOT NULL,
    "approval_reason" "text",
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "updated_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "predicted_turnout_percent" numeric(5,2),
    "priority_level" "text" DEFAULT 'Flexible'::"text" NOT NULL,
    "impact_score" numeric(3,1),
    "last_rescheduled_at" timestamp with time zone,
    "reschedule_count" integer DEFAULT 0,
    "visibility" "text" DEFAULT 'assigned'::"text" NOT NULL,
    "published_by" "uuid",
    "published_at" timestamp with time zone,
    "cancellation_reason" "text",
    "cancelled_by" "uuid",
    "cancelled_at" timestamp with time zone,
    "requested_by" "text",
    "college_office" "text",
    "number_of_pax" integer,
    "institutional_category" "text",
    "participation_status" "text",
    "target_group" "text",
    "urgency_points" integer DEFAULT 0 NOT NULL,
    "priority_score" integer DEFAULT 0 NOT NULL,
    "priority_tier" "text" DEFAULT 'Low'::"text" NOT NULL,
    "fixed_priority" boolean DEFAULT false NOT NULL,
    CONSTRAINT "events_approval_status_valid" CHECK (("approval_status" = ANY (ARRAY['pending'::"text", 'approved'::"text", 'declined'::"text"]))),
    CONSTRAINT "events_code_not_blank" CHECK (("btrim"("event_code") <> ''::"text")),
    CONSTRAINT "events_impact_score_valid" CHECK ((("impact_score" IS NULL) OR (("impact_score" >= (0)::numeric) AND ("impact_score" <= (10)::numeric)))),
    CONSTRAINT "events_institutional_category_valid" CHECK ((("institutional_category" IS NULL) OR ("institutional_category" = ANY (ARRAY['Accreditation Linked'::"text", 'Academic or Training'::"text", 'Social or Recreational'::"text"])))),
    CONSTRAINT "events_number_of_pax_valid" CHECK ((("number_of_pax" IS NULL) OR ("number_of_pax" >= 0))),
    CONSTRAINT "events_participation_status_valid" CHECK ((("participation_status" IS NULL) OR ("participation_status" = ANY (ARRAY['Mandatory'::"text", 'Voluntary'::"text"])))),
    CONSTRAINT "events_predicted_turnout_percent_valid" CHECK ((("predicted_turnout_percent" IS NULL) OR (("predicted_turnout_percent" >= (0)::numeric) AND ("predicted_turnout_percent" <= (100)::numeric)))),
    CONSTRAINT "events_priority_level_valid" CHECK (("priority_level" = ANY (ARRAY['Time-Sensitive'::"text", 'Business-Critical'::"text", 'Flexible'::"text"]))),
    CONSTRAINT "events_priority_score_valid" CHECK ((("priority_score" >= 0) AND ("priority_score" <= 9))),
    CONSTRAINT "events_priority_tier_valid" CHECK (("priority_tier" = ANY (ARRAY['High'::"text", 'Medium'::"text", 'Low'::"text"]))),
    CONSTRAINT "events_status_valid" CHECK (("event_status" = ANY (ARRAY['draft'::"text", 'scheduled'::"text", 'ongoing'::"text", 'completed'::"text", 'cancelled'::"text"]))),
    CONSTRAINT "events_target_group_valid" CHECK ((("target_group" IS NULL) OR ("target_group" = ANY (ARRAY['University-wide'::"text", 'College or Department-wide'::"text", 'Single Class or Organization'::"text"])))),
    CONSTRAINT "events_time_order_valid" CHECK (("ends_at" > "starts_at")),
    CONSTRAINT "events_title_not_blank" CHECK (("btrim"("title") <> ''::"text")),
    CONSTRAINT "events_venue_not_blank" CHECK (("btrim"("venue") <> ''::"text")),
    CONSTRAINT "events_visibility_valid" CHECK (("visibility" = ANY (ARRAY['assigned'::"text", 'public'::"text"])))
);


ALTER TABLE "public"."events" OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."admin_finish_event"("p_event_id" "uuid", "p_reason" "text") RETURNS "public"."events"
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO ''
    AS $$
declare
  v_actor uuid := (select auth.uid());
  v_event public.events;
  v_now timestamptz := now();
  v_absent_count integer;
  v_session_count integer;
begin
  if not (select private.is_active_admin()) then
    raise exception 'An active administrator account is required.' using errcode = '42501';
  end if;
  if p_reason is null or length(btrim(p_reason)) < 5 then
    raise exception 'A finish reason of at least 5 characters is required.' using errcode = '22023';
  end if;

  select * into v_event
  from public.events
  where id = p_event_id
  for update;
  if not found then
    raise exception 'The event could not be found.' using errcode = 'P0002';
  end if;
  if v_event.event_status = 'cancelled' then
    raise exception 'Cancelled events cannot be finished.' using errcode = '22023';
  end if;

  insert into public.attendance_records (
    event_session_id, student_id, attendance_status, verification_method,
    recorded_at, recorded_by, remarks
  )
  select
    s.id, ep.student_id, 'absent', 'manual', v_now, v_actor,
    'Automatically marked absent during administrative event completion: ' || btrim(p_reason)
  from public.event_sessions s
  join public.event_participants ep on ep.event_id = s.event_id
  where s.event_id = p_event_id
    and s.session_status = 'ongoing'
    and ep.participant_status <> 'removed'
    and not exists (
      select 1 from public.attendance_records ar
      where ar.event_session_id = s.id and ar.student_id = ep.student_id
    )
  on conflict (event_session_id, student_id) where event_session_id is not null do nothing;
  get diagnostics v_absent_count = row_count;

  update public.event_sessions
  set session_status = 'completed', actual_end = v_now,
      ended_reason = btrim(p_reason), updated_at = v_now
  where event_id = p_event_id and session_status = 'ongoing';
  get diagnostics v_session_count = row_count;

  update public.events
  set event_status = 'completed', updated_at = v_now
  where id = p_event_id
  returning * into v_event;

  insert into public.audit_logs(actor_user_id, action, target_type, target_id, metadata)
  values (
    v_actor, 'system.event_finished', 'event', p_event_id,
    jsonb_build_object('reason', btrim(p_reason), 'completed_sessions', v_session_count, 'automatically_absent', v_absent_count)
  );
  return v_event;
end;
$$;


ALTER FUNCTION "public"."admin_finish_event"("p_event_id" "uuid", "p_reason" "text") OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."admin_list_credential_statuses"() RETURNS TABLE("student_id" "uuid", "qr_id" "uuid", "qr_credential_status" "text", "qr_issued_at" timestamp with time zone, "qr_expires_at" timestamp with time zone, "qr_revoked_at" timestamp with time zone, "qr_last_successful_check_in_at" timestamp with time zone, "qr_created_at" timestamp with time zone, "qr_updated_at" timestamp with time zone, "facial_id" "uuid", "facial_status" "text", "facial_enrolled_at" timestamp with time zone, "facial_last_verified_at" timestamp with time zone, "facial_consent_recorded_at" timestamp with time zone, "facial_created_at" timestamp with time zone, "facial_updated_at" timestamp with time zone)
    LANGUAGE "sql" SECURITY DEFINER
    SET "search_path" TO ''
    AS $$
  select
    ids.student_id,
    qr.id,
    qr.credential_status,
    qr.issued_at,
    qr.expires_at,
    qr.revoked_at,
    qr.last_successful_check_in_at,
    qr.created_at,
    qr.updated_at,
    facial.id,
    facial.facial_status,
    facial.enrolled_at,
    facial.last_verified_at,
    facial.consent_recorded_at,
    facial.created_at,
    facial.updated_at
  from (
    select student_id from public.qr_credentials
    union
    select student_id from public.facial_profiles
  ) ids
  left join lateral (
    select q.*
    from public.qr_credentials q
    where q.student_id = ids.student_id
    order by q.issued_at desc nulls last, q.created_at desc
    limit 1
  ) qr on true
  left join public.facial_profiles facial on facial.student_id = ids.student_id
  where (select private.is_active_admin());
$$;


ALTER FUNCTION "public"."admin_list_credential_statuses"() OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."admin_manage_catalog_entry"("p_table" "text", "p_id" "uuid" DEFAULT NULL::"uuid", "p_values" "jsonb" DEFAULT '{}'::"jsonb") RETURNS "uuid"
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO ''
    AS $$
declare
  v_id uuid;
begin
  if not (select private.is_active_admin()) then
    raise exception 'An active administrator account is required.' using errcode = '42501';
  end if;
  if p_values is null or jsonb_typeof(p_values) <> 'object' then
    raise exception 'Catalog values must be an object.' using errcode = '22023';
  end if;

  case p_table
    when 'departments' then
      if p_id is null then
        insert into public.departments (department_code, department_name, is_active)
        values (btrim(p_values->>'department_code'), btrim(p_values->>'department_name'), coalesce((p_values->>'is_active')::boolean, true)) returning id into v_id;
      else
        update public.departments set department_code = coalesce(nullif(btrim(p_values->>'department_code'), ''), department_code), department_name = coalesce(nullif(btrim(p_values->>'department_name'), ''), department_name), is_active = coalesce((p_values->>'is_active')::boolean, is_active) where id = p_id returning id into v_id;
      end if;
    when 'programs' then
      if p_id is null then
        insert into public.programs (department_id, program_code, program_name, is_active)
        values ((p_values->>'department_id')::uuid, btrim(p_values->>'program_code'), btrim(p_values->>'program_name'), coalesce((p_values->>'is_active')::boolean, true)) returning id into v_id;
      else
        update public.programs set department_id = coalesce((p_values->>'department_id')::uuid, department_id), program_code = coalesce(nullif(btrim(p_values->>'program_code'), ''), program_code), program_name = coalesce(nullif(btrim(p_values->>'program_name'), ''), program_name), is_active = coalesce((p_values->>'is_active')::boolean, is_active) where id = p_id returning id into v_id;
      end if;
    when 'sections' then
      if p_id is null then
        insert into public.sections (program_id, section_name, year_level, academic_year, semester, is_active)
        values ((p_values->>'program_id')::uuid, btrim(p_values->>'section_name'), (p_values->>'year_level')::integer, btrim(p_values->>'academic_year'), btrim(p_values->>'semester'), coalesce((p_values->>'is_active')::boolean, true)) returning id into v_id;
      else
        update public.sections set program_id = coalesce((p_values->>'program_id')::uuid, program_id), section_name = coalesce(nullif(btrim(p_values->>'section_name'), ''), section_name), year_level = coalesce((p_values->>'year_level')::integer, year_level), academic_year = coalesce(nullif(btrim(p_values->>'academic_year'), ''), academic_year), semester = coalesce(nullif(btrim(p_values->>'semester'), ''), semester), is_active = coalesce((p_values->>'is_active')::boolean, is_active) where id = p_id returning id into v_id;
      end if;
    when 'event_categories' then
      if p_id is null then
        insert into public.event_categories (category_name, is_active)
        values (btrim(p_values->>'category_name'), coalesce((p_values->>'is_active')::boolean, true)) returning id into v_id;
      else
        update public.event_categories set category_name = coalesce(nullif(btrim(p_values->>'category_name'), ''), category_name), is_active = coalesce((p_values->>'is_active')::boolean, is_active) where id = p_id returning id into v_id;
      end if;
    else
      raise exception 'Unsupported catalog table.' using errcode = '22023';
  end case;

  if v_id is null then raise exception 'Catalog entry was not found.' using errcode = 'P0002'; end if;
  insert into public.audit_logs (actor_user_id, action, target_type, target_id, metadata)
  values ((select auth.uid()), format('admin.catalog.%s', case when p_id is null then 'created' else 'updated' end), p_table, v_id, p_values);
  return v_id;
end;
$$;


ALTER FUNCTION "public"."admin_manage_catalog_entry"("p_table" "text", "p_id" "uuid", "p_values" "jsonb") OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."admin_publish_legal_document"("p_document_type" "text", "p_sections" "jsonb", "p_expected_version" "text" DEFAULT NULL::"text") RETURNS TABLE("document_type" "text", "sections" "jsonb", "version" "text", "published_at" timestamp with time zone)
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO 'public', 'pg_catalog'
    AS $$
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


ALTER FUNCTION "public"."admin_publish_legal_document"("p_document_type" "text", "p_sections" "jsonb", "p_expected_version" "text") OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."event_sessions" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "event_id" "uuid" NOT NULL,
    "session_name" "text" NOT NULL,
    "venue" "text" NOT NULL,
    "mode" "text" DEFAULT 'f2f'::"text" NOT NULL,
    "session_status" "text" DEFAULT 'scheduled'::"text" NOT NULL,
    "scheduled_start" timestamp with time zone NOT NULL,
    "scheduled_end" timestamp with time zone NOT NULL,
    "actual_start" timestamp with time zone,
    "actual_end" timestamp with time zone,
    "late_cutoff_at" timestamp with time zone,
    "attendance_window_start_at" timestamp with time zone,
    "attendance_window_end_at" timestamp with time zone,
    "created_by" "uuid" NOT NULL,
    "ended_reason" "text",
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "updated_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "session_archive_status" "text" DEFAULT 'active'::"text",
    "superseded_by" "uuid",
    "rescheduled_reason" "text",
    "rescheduled_at" timestamp with time zone,
    "attendance_capture_phase" "text" DEFAULT 'time_in'::"text" NOT NULL,
    CONSTRAINT "event_sessions_actual_order_valid" CHECK ((("actual_end" IS NULL) OR ("actual_start" IS NULL) OR ("actual_end" >= "actual_start"))),
    CONSTRAINT "event_sessions_attendance_capture_phase_check" CHECK (("attendance_capture_phase" = ANY (ARRAY['time_in'::"text", 'time_out'::"text"]))),
    CONSTRAINT "event_sessions_mode_valid" CHECK (("mode" = ANY (ARRAY['f2f'::"text", 'online'::"text"]))),
    CONSTRAINT "event_sessions_name_not_blank" CHECK (("btrim"("session_name") <> ''::"text")),
    CONSTRAINT "event_sessions_schedule_order_valid" CHECK (("scheduled_end" > "scheduled_start")),
    CONSTRAINT "event_sessions_session_archive_status_check" CHECK (("session_archive_status" = ANY (ARRAY['active'::"text", 'archived'::"text"]))),
    CONSTRAINT "event_sessions_status_valid" CHECK (("session_status" = ANY (ARRAY['scheduled'::"text", 'ongoing'::"text", 'completed'::"text", 'cancelled'::"text"]))),
    CONSTRAINT "event_sessions_venue_not_blank" CHECK (("btrim"("venue") <> ''::"text")),
    CONSTRAINT "event_sessions_window_order_valid" CHECK ((("attendance_window_end_at" IS NULL) OR ("attendance_window_start_at" IS NULL) OR ("attendance_window_end_at" > "attendance_window_start_at")))
);


ALTER TABLE "public"."event_sessions" OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."admin_recover_attendance_session"("p_session_id" "uuid", "p_reason" "text") RETURNS "public"."event_sessions"
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO ''
    AS $$
                                        declare
                                          v_actor uuid := (select auth.uid());
                                            v_session public.event_sessions;
                                              v_now timestamptz := now();
                                                v_absent_count integer;
                                                begin
                                                  if not (select private.is_active_admin()) then
                                                      raise exception 'An active administrator account is required.' using errcode = '42501';
                                                        end if;
                                                          if p_reason is null or length(btrim(p_reason)) < 5 then
                                                              raise exception 'A recovery reason of at least 5 characters is required.' using errcode = '22023';
                                                                end if;

                                                                  select * into v_session
                                                                    from public.event_sessions
                                                                      where id = p_session_id
                                                                          and session_status = 'ongoing'
                                                                            for update;
                                                                              if not found then
                                                                                  raise exception 'Only an active attendance session can be recovered.' using errcode = 'P0002';
                                                                                    end if;

                                                                                      insert into public.attendance_records (
                                                                                          event_session_id, student_id, attendance_status, verification_method,
                                                                                              recorded_at, recorded_by, remarks
                                                                                                )
                                                                                                  select
                                                                                                      v_session.id, ep.student_id, 'absent', 'manual', v_now, v_actor,
                                                                                                          'Automatically marked absent during administrative recovery: ' || btrim(p_reason)
                                                                                                            from public.event_participants ep
                                                                                                              where ep.event_id = v_session.event_id
                                                                                                                  and ep.participant_status <> 'removed'
                                                                                                                      and not exists (
                                                                                                                            select 1 from public.attendance_records ar
                                                                                                                                  where ar.event_session_id = v_session.id
                                                                                                                                          and ar.student_id = ep.student_id
                                                                                                                                              )
                                                                                                                                                on conflict (event_session_id, student_id) where event_session_id is not null do nothing;
                                                                                                                                                  get diagnostics v_absent_count = row_count;

                                                                                                                                                    update public.event_sessions
                                                                                                                                                      set session_status = 'completed',
                                                                                                                                                            actual_end = v_now,
                                                                                                                                                                  ended_reason = btrim(p_reason),
                                                                                                                                                                        updated_at = v_now
                                                                                                                                                                          where id = v_session.id
                                                                                                                                                                            returning * into v_session;

                                                                                                                                                                              if not exists (
                                                                                                                                                                                  select 1 from public.event_sessions
                                                                                                                                                                                      where event_id = v_session.event_id
                                                                                                                                                                                            and id <> v_session.id
                                                                                                                                                                                                  and session_status = 'ongoing'
                                                                                                                                                                                                    ) then
                                                                                                                                                                                                        update public.events
                                                                                                                                                                                                            set event_status = 'completed', updated_at = v_now
                                                                                                                                                                                                                where id = v_session.event_id;
                                                                                                                                                                                                                  end if;

                                                                                                                                                                                                                    insert into public.audit_logs(actor_user_id, action, target_type, target_id, metadata)
                                                                                                                                                                                                                      values (
                                                                                                                                                                                                                          v_actor, 'system.attendance_session_recovered', 'attendance_session', v_session.id,
                                                                                                                                                                                                                              jsonb_build_object('event_id', v_session.event_id, 'reason', btrim(p_reason), 'automatically_absent', v_absent_count)
                                                                                                                                                                                                                                );
                                                                                                                                                                                                                                  return v_session;
                                                                                                                                                                                                                                  end;
                                                                                                                                                                                                                                  $$;


ALTER FUNCTION "public"."admin_recover_attendance_session"("p_session_id" "uuid", "p_reason" "text") OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."admin_retry_email_job"("p_job_id" "uuid", "p_source" "text", "p_reason" "text") RETURNS "jsonb"
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO ''
    AS $$
declare
  v_actor uuid := (select auth.uid());
  v_id uuid;
  v_recipient text;
  v_subject text;
  v_status text;
  v_error text;
  v_created_at timestamptz;
  v_last_attempt_at timestamptz;
  v_notification_type text;
begin
  if not (select private.is_active_admin()) then
    raise exception 'An active administrator account is required.' using errcode = '42501';
  end if;
  if p_reason is null or length(btrim(p_reason)) < 5 then
    raise exception 'A retry reason of at least 5 characters is required.' using errcode = '22023';
  end if;
  if p_source is distinct from 'event_email' then
    raise exception 'Only recent participant invitation email jobs may be retried.' using errcode = '22023';
  end if;

  if p_source = 'event_email' then
    select recipient_email, subject, delivery_status, error_message, created_at, last_attempt_at, notification_type
      into v_recipient, v_subject, v_status, v_error, v_created_at, v_last_attempt_at, v_notification_type
    from public.event_email_outbox
    where id = p_job_id;
    if v_status is distinct from 'failed' then
      raise exception 'Only failed email jobs can be retried.' using errcode = 'P0002';
    end if;
    if v_notification_type <> 'participant_added' then
      raise exception 'Only participant invitation email jobs may be retried.' using errcode = '22023';
    end if;
    if v_created_at < now() - interval '24 hours' then
      raise exception 'Only email jobs created within the last 24 hours can be retried.' using errcode = '22023';
    end if;
    if v_last_attempt_at is not null and v_last_attempt_at > now() - interval '15 minutes' then
      raise exception 'This email job is still within its retry cooldown.' using errcode = '55006';
    end if;
    update public.event_email_outbox
    set delivery_status = 'pending', error_message = null, attempt_count = 0,
        next_attempt_at = now(), processing_started_at = null, processing_token = null
    where id = p_job_id and delivery_status = 'failed' and notification_type = 'participant_added'
    returning id into v_id;
  else
    select recipient_email, subject, delivery_status, error_message, created_at, last_attempt_at
      into v_recipient, v_subject, v_status, v_error, v_created_at, v_last_attempt_at
    from public.request_email_outbox
    where id = p_job_id;
    if v_status is distinct from 'failed' then
      raise exception 'Only failed email jobs can be retried.' using errcode = 'P0002';
    end if;
    if v_created_at < now() - interval '24 hours' then
      raise exception 'Only email jobs created within the last 24 hours can be retried.' using errcode = '22023';
    end if;
    if v_last_attempt_at is not null and v_last_attempt_at > now() - interval '15 minutes' then
      raise exception 'This email job is still within its retry cooldown.' using errcode = '55006';
    end if;
    update public.request_email_outbox
    set delivery_status = 'pending', error_message = null, attempt_count = 0,
        next_attempt_at = now(), processing_started_at = null, processing_token = null
    where id = p_job_id and delivery_status = 'failed'
    returning id into v_id;
  end if;

  if v_id is null then
    raise exception 'Only failed email jobs can be retried.' using errcode = 'P0002';
  end if;

  insert into public.audit_logs(actor_user_id, action, target_type, target_id, metadata)
  values (v_actor, 'system.notification_retry', 'notification_job', v_id,
    jsonb_build_object('source', p_source, 'reason', btrim(p_reason)));

  return jsonb_build_object(
    'id', v_id, 'source', p_source, 'recipient_email', v_recipient,
    'subject', v_subject, 'delivery_status', 'pending',
    'error_message', v_error, 'created_at', v_created_at
  );
end;
$$;


ALTER FUNCTION "public"."admin_retry_email_job"("p_job_id" "uuid", "p_source" "text", "p_reason" "text") OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."admin_revoke_user_sessions"("p_actor_user_id" "uuid", "p_target_user_id" "uuid", "p_reason" "text") RETURNS integer
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO ''
    AS $$
declare
  v_revoked_count integer := 0;
  v_reason text := btrim(coalesce(p_reason, ''));
begin
  if p_actor_user_id is null or p_target_user_id is null then
    raise exception 'An actor and target user are required.' using errcode = '22023';
  end if;
  if p_actor_user_id = p_target_user_id then
    raise exception 'Administrators cannot revoke their own sessions.' using errcode = '42501';
  end if;
  if v_reason = '' then
    raise exception 'A reason is required to revoke user sessions.' using errcode = '22023';
  end if;
  if not exists (
    select 1
    from public.admin_profiles ap
    join public.profiles actor on actor.id = ap.profile_id
    where ap.profile_id = p_actor_user_id
      and actor.account_status = 'active'
      and (
        actor.role = 'admin'
        or (
          actor.role = 'department_admin'
          and (
            exists (select 1 from public.organizers o where o.profile_id = p_target_user_id and o.department_id = ap.department_id)
            or exists (select 1 from public.students s where s.profile_id = p_target_user_id and s.department_id = ap.department_id)
          )
        )
      )
  ) then
    raise exception 'The administrator is not authorized for this target.' using errcode = '42501';
  end if;
  if not exists (select 1 from auth.users where id = p_target_user_id) then
    raise exception 'The target user was not found.' using errcode = 'P0002';
  end if;
  delete from auth.sessions where user_id = p_target_user_id;
  get diagnostics v_revoked_count = row_count;
  insert into public.audit_logs (actor_user_id, action, target_type, target_id, metadata)
  values (p_actor_user_id, 'user.sessions_revoked', 'user', p_target_user_id,
    jsonb_build_object('reason', v_reason, 'revoked_session_count', v_revoked_count));
  return v_revoked_count;
end;
$$;


ALTER FUNCTION "public"."admin_revoke_user_sessions"("p_actor_user_id" "uuid", "p_target_user_id" "uuid", "p_reason" "text") OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."admin_run_data_consistency_check"() RETURNS TABLE("id" "text", "severity" "text", "message" "text", "reference_id" "text", "created_at" timestamp with time zone)
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO ''
    AS $$
declare
  v_actor uuid := (select auth.uid());
begin
  if not (select private.is_active_admin()) then
    raise exception 'An active administrator account is required.' using errcode = '42501';
  end if;

  return query
    select 'event-without-organizer:' || e.id::text, 'critical', 'Event has no valid organizer record.', e.id::text, now()
    from public.events e left join public.organizers o on o.id = e.organizer_id where o.id is null;

  return query
    select 'session-without-event:' || s.id::text, 'critical', 'Attendance session has no valid event record.', s.id::text, now()
    from public.event_sessions s left join public.events e on e.id = s.event_id where e.id is null;

  return query
    select 'attendance-without-session:' || a.id::text, 'critical', 'Attendance record has no valid session record.', a.id::text, now()
    from public.attendance_records a
    left join public.event_sessions es on es.id = a.event_session_id
    where a.event_session_id is null or es.id is null;

  return query
    select 'organizer-without-profile:' || o.id::text, 'critical', 'Organizer has no valid profile record.', o.id::text, now()
    from public.organizers o left join public.profiles p on p.id = o.profile_id where p.id is null;

  return query
    select 'student-without-relationship:' || s.id::text, 'critical', 'Student is missing a profile or academic relationship.', s.id::text, now()
    from public.students s
    left join public.profiles p on p.id = s.profile_id
    left join public.programs pr on pr.id = s.program_id
    left join public.departments d on d.id = s.department_id
    left join public.sections sec on sec.id = s.section_id
    where p.id is null or pr.id is null or d.id is null or sec.id is null;

  return query
    select 'duplicate-attendance:' || a.event_session_id::text || ':' || a.student_id::text, 'critical', 'Duplicate attendance records were found for a session and student.', a.event_session_id::text, now()
    from public.attendance_records a
    where a.event_session_id is not null
    group by a.event_session_id, a.student_id
    having count(*) > 1;

  return query
    select 'event-state-mismatch:' || e.id::text, 'warning', 'Event is marked completed while an attendance session is still ongoing.', e.id::text, now()
    from public.events e
    where e.event_status = 'completed'
      and exists (select 1 from public.event_sessions s where s.event_id = e.id and s.session_status = 'ongoing');

  insert into public.audit_logs(actor_user_id, action, target_type, target_id, metadata)
  values (v_actor, 'system.data_consistency_check', 'system', null, jsonb_build_object('scope', 'operational_records'));
end;
$$;


ALTER FUNCTION "public"."admin_run_data_consistency_check"() OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."admin_update_system_settings"("p_settings_id" "uuid", "p_changes" "jsonb") RETURNS "void"
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO ''
    AS $$
begin
  if not (select private.is_active_admin()) then raise exception 'An active administrator account is required.' using errcode = '42501'; end if;
  if p_changes is null or jsonb_typeof(p_changes) <> 'object' then raise exception 'Settings changes must be an object.' using errcode = '22023'; end if;
  update public.system_settings set
    institution_name = coalesce(nullif(btrim(p_changes->>'institution_name'), ''), institution_name),
    current_school_year = coalesce(nullif(btrim(p_changes->>'current_school_year'), ''), current_school_year),
    current_semester_id = coalesce((p_changes->>'current_semester_id')::uuid, current_semester_id),
    attendance_late_cutoff_minutes = coalesce((p_changes->>'attendance_late_cutoff_minutes')::integer, attendance_late_cutoff_minutes),
    default_session_duration_minutes = coalesce((p_changes->>'default_session_duration_minutes')::integer, default_session_duration_minutes),
    verification_policy = coalesce(nullif(btrim(p_changes->>'verification_policy'), ''), verification_policy),
    notification_preferences = coalesce(p_changes->'notification_preferences', notification_preferences),
    updated_at = now()
  where id = p_settings_id;
  if not found then raise exception 'System settings were not found.' using errcode = 'P0002'; end if;
  insert into public.audit_logs (actor_user_id, action, target_type, target_id, metadata)
  values ((select auth.uid()), 'admin.system_settings.updated', 'system_settings', p_settings_id, p_changes);
end;
$$;


ALTER FUNCTION "public"."admin_update_system_settings"("p_settings_id" "uuid", "p_changes" "jsonb") OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."advance_event_attendance_capture_phase"("p_session_id" "uuid") RETURNS "text"
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO ''
    AS $$
declare
  v_phase text;
begin
  if not private.is_active_organizer() then
    raise exception 'An active organizer account is required.' using errcode = '42501';
  end if;

  update public.event_sessions es
  set attendance_capture_phase = 'time_out', updated_at = now()
  from public.events e
  where es.id = p_session_id
    and e.id = es.event_id
    and e.organizer_id = private.current_organizer_id()
    and es.session_status = 'ongoing'
  returning es.attendance_capture_phase into v_phase;

  if v_phase is null then
    raise exception 'Only an active owned attendance session can advance to Time Out.' using errcode = '22023';
  end if;

  return v_phase;
end;
$$;


ALTER FUNCTION "public"."advance_event_attendance_capture_phase"("p_session_id" "uuid") OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."cancel_organizer_event"("p_event_id" "uuid", "p_reason" "text") RETURNS "public"."events"
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO ''
    AS $$
declare v_actor uuid := auth.uid(); v_event public.events;
begin
  if not private.is_active_organizer() or p_reason is null or btrim(p_reason) = '' then
    raise exception 'An active organizer and cancellation reason are required.' using errcode = '42501';
  end if;
  select * into v_event from public.events where id = p_event_id for update;
  if not found or v_event.organizer_id <> private.current_organizer_id() then
    raise exception 'Event was not found or is not owned by this organizer.' using errcode = '42501';
  end if;
  if v_event.event_status in ('completed', 'cancelled') then
    raise exception 'Completed or cancelled events cannot be cancelled.' using errcode = '22023';
  end if;
  update public.event_sessions set session_status = 'cancelled', actual_end = coalesce(actual_end, now()), ended_reason = p_reason, updated_at = now()
  where event_id = p_event_id and session_status in ('scheduled', 'ongoing');
  update public.events set event_status = 'cancelled', cancellation_reason = btrim(p_reason), cancelled_by = v_actor, cancelled_at = now(), updated_at = now()
  where id = p_event_id returning * into v_event;
  insert into public.audit_logs(actor_user_id, action, target_type, target_id, metadata)
  values (v_actor, 'event.cancelled', 'event', p_event_id, jsonb_build_object('reason', btrim(p_reason)));
  return v_event;
end;
$$;


ALTER FUNCTION "public"."cancel_organizer_event"("p_event_id" "uuid", "p_reason" "text") OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."claim_event_email_outbox_batch"("p_limit" integer DEFAULT 25) RETURNS TABLE("id" "uuid", "recipient_email" "text", "subject" "text", "body" "text", "html_body" "text", "processing_token" "uuid")
    LANGUAGE "plpgsql"
    SET "search_path" TO ''
    AS $$
begin
  if auth.role() <> 'service_role' then
    raise exception 'Only the email worker may claim queued email.' using errcode = '42501';
  end if;
  update public.event_email_outbox
  set delivery_status = case when attempt_count >= 5 then 'failed' else 'pending' end,
      next_attempt_at = case when attempt_count >= 5 then next_attempt_at else now() end,
      processing_started_at = null,
      processing_token = null,
      error_message = coalesce(error_message, 'Email worker lease expired.')
  where delivery_status = 'processing' and processing_started_at < now() - interval '5 minutes';
  return query
  with candidates as (
    select outbox.id from public.event_email_outbox outbox
    where outbox.delivery_status = 'pending' and outbox.next_attempt_at <= now()
    order by outbox.next_attempt_at, outbox.created_at
    for update skip locked
    limit least(greatest(coalesce(p_limit, 25), 1), 50)
  ), claimed as (
    update public.event_email_outbox outbox
    set delivery_status = 'processing', processing_started_at = now(),
        processing_token = gen_random_uuid(), last_attempt_at = now(),
        attempt_count = outbox.attempt_count + 1
    from candidates
    where outbox.id = candidates.id
    returning outbox.id, outbox.recipient_email, outbox.subject, outbox.body,
      outbox.html_body, outbox.processing_token
  )
  select c.id, c.recipient_email, c.subject, c.body, c.html_body, c.processing_token
  from claimed c;
end;
$$;


ALTER FUNCTION "public"."claim_event_email_outbox_batch"("p_limit" integer) OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."claim_event_email_outbox_batch_with_daily_cap"("p_limit" integer DEFAULT 25, "p_daily_cap" integer DEFAULT 250) RETURNS TABLE("id" "uuid", "recipient_email" "text", "subject" "text", "body" "text", "html_body" "text", "processing_token" "uuid")
    LANGUAGE "plpgsql"
    SET "search_path" TO ''
    AS $$
declare
  v_day_start timestamptz := date_trunc('day', now() at time zone 'UTC') at time zone 'UTC';
  v_reserved integer := 0;
  v_limit integer;
begin
  if auth.role() <> 'service_role' then
    raise exception 'Only the email worker may claim queued email.' using errcode = '42501';
  end if;
  perform pg_advisory_xact_lock(hashtextextended('plpass_email_daily_budget', 0));
  select count(*) into v_reserved
  from (
    select e.id from public.event_email_outbox e
    where (e.delivery_status = 'sent' and e.sent_at >= v_day_start)
       or (e.delivery_status = 'processing' and e.processing_started_at >= v_day_start)
    union all
    select r.id from public.request_email_outbox r
    where (r.delivery_status = 'sent' and r.sent_at >= v_day_start)
       or (r.delivery_status = 'processing' and r.processing_started_at >= v_day_start)
  ) as reserved;
  v_limit := least(greatest(coalesce(p_limit, 25), 1), 50, greatest(coalesce(p_daily_cap, 250), 0) - v_reserved);
  if v_limit <= 0 then return; end if;
  return query select * from public.claim_event_email_outbox_batch(v_limit);
end;
$$;


ALTER FUNCTION "public"."claim_event_email_outbox_batch_with_daily_cap"("p_limit" integer, "p_daily_cap" integer) OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."claim_request_email_outbox_batch"("p_limit" integer DEFAULT 25) RETURNS TABLE("id" "uuid", "recipient_email" "text", "subject" "text", "body" "text", "processing_token" "uuid")
    LANGUAGE "plpgsql"
    SET "search_path" TO ''
    AS $$
begin
  if auth.role() <> 'service_role' then
    raise exception 'Only the email worker may claim queued email.' using errcode = '42501';
  end if;
  update public.request_email_outbox
  set delivery_status = 'pending', processing_started_at = null, processing_token = null,
      error_message = coalesce(error_message, 'Email worker lease expired.')
  where delivery_status = 'processing' and processing_started_at < now() - interval '5 minutes';
  return query
  with candidates as (
    select outbox.id from public.request_email_outbox outbox
    where outbox.delivery_status = 'pending' and outbox.next_attempt_at <= now()
    order by outbox.next_attempt_at, outbox.created_at
    for update skip locked
    limit least(greatest(coalesce(p_limit, 25), 1), 50)
  ), claimed as (
    update public.request_email_outbox outbox
    set delivery_status = 'processing', processing_started_at = now(),
        processing_token = gen_random_uuid(), last_attempt_at = now(),
        attempt_count = outbox.attempt_count + 1
    from candidates
    where outbox.id = candidates.id
    returning outbox.id, outbox.recipient_email, outbox.subject, outbox.body, outbox.processing_token
  )
  select c.id, c.recipient_email, c.subject, c.body, c.processing_token
  from claimed c;
end;
$$;


ALTER FUNCTION "public"."claim_request_email_outbox_batch"("p_limit" integer) OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."claim_request_email_outbox_batch_with_daily_cap"("p_limit" integer DEFAULT 25, "p_daily_cap" integer DEFAULT 250) RETURNS TABLE("id" "uuid", "recipient_email" "text", "subject" "text", "body" "text", "processing_token" "uuid")
    LANGUAGE "plpgsql"
    SET "search_path" TO ''
    AS $$
declare
  v_day_start timestamptz := date_trunc('day', now() at time zone 'UTC') at time zone 'UTC';
  v_reserved integer := 0;
  v_limit integer;
begin
  if auth.role() <> 'service_role' then
    raise exception 'Only the email worker may claim queued email.' using errcode = '42501';
  end if;
  perform pg_advisory_xact_lock(hashtextextended('plpass_email_daily_budget', 0));
  select count(*) into v_reserved
  from (
    select e.id from public.event_email_outbox e
    where (e.delivery_status = 'sent' and e.sent_at >= v_day_start)
       or (e.delivery_status = 'processing' and e.processing_started_at >= v_day_start)
    union all
    select r.id from public.request_email_outbox r
    where (r.delivery_status = 'sent' and r.sent_at >= v_day_start)
       or (r.delivery_status = 'processing' and r.processing_started_at >= v_day_start)
  ) as reserved;
  v_limit := least(greatest(coalesce(p_limit, 25), 1), 50, greatest(coalesce(p_daily_cap, 250), 0) - v_reserved);
  if v_limit <= 0 then return; end if;
  return query select * from public.claim_request_email_outbox_batch(v_limit);
end;
$$;


ALTER FUNCTION "public"."claim_request_email_outbox_batch_with_daily_cap"("p_limit" integer, "p_daily_cap" integer) OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."complete_event_email_outbox_delivery"("p_outbox_id" "uuid", "p_processing_token" "uuid", "p_provider_message_id" "text" DEFAULT NULL::"text") RETURNS "void"
    LANGUAGE "plpgsql"
    SET "search_path" TO ''
    AS $$
begin
  if auth.role() <> 'service_role' then
    raise exception 'Only the email worker may complete queued email.' using errcode = '42501';
  end if;

  update public.event_email_outbox
  set delivery_status = 'sent',
      sent_at = now(),
      provider_message_id = nullif(btrim(p_provider_message_id), ''),
      error_message = null,
      processing_started_at = null,
      processing_token = null
  where id = p_outbox_id
    and delivery_status = 'processing'
    and processing_token = p_processing_token;

  if not found then
    raise exception 'Email delivery lease was not found.' using errcode = 'P0002';
  end if;
end;
$$;


ALTER FUNCTION "public"."complete_event_email_outbox_delivery"("p_outbox_id" "uuid", "p_processing_token" "uuid", "p_provider_message_id" "text") OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."facial_profiles" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "student_id" "uuid" NOT NULL,
    "enrollment_reference" "text" NOT NULL,
    "facial_status" "text" DEFAULT 'activated'::"text" NOT NULL,
    "enrolled_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "last_verified_at" timestamp with time zone,
    "consent_recorded_at" timestamp with time zone NOT NULL,
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "updated_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "face_descriptor" "jsonb",
    "descriptor_model" "text",
    "descriptor_updated_at" timestamp with time zone,
    CONSTRAINT "facial_profiles_descriptor_is_array" CHECK ((("face_descriptor" IS NULL) OR ("jsonb_typeof"("face_descriptor") = 'array'::"text"))),
    CONSTRAINT "facial_profiles_reference_not_blank" CHECK (("btrim"("enrollment_reference") <> ''::"text")),
    CONSTRAINT "facial_profiles_status_valid" CHECK (("facial_status" = ANY (ARRAY['activated'::"text", 'inactive'::"text", 'damaged'::"text", 'blocked'::"text"])))
);


ALTER TABLE "public"."facial_profiles" OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."complete_facial_enrollment"("p_enrollment_reference" "text") RETURNS "public"."facial_profiles"
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO ''
    AS $$
declare
  v_actor uuid := auth.uid();
  v_student public.students;
  v_profile public.facial_profiles;
begin
  if p_enrollment_reference is null or btrim(p_enrollment_reference) = '' then
    raise exception 'Enrollment reference is required.' using errcode = '22023';
  end if;

  select * into v_student
  from public.students
  where profile_id = v_actor and student_status = 'enrolled'
  for update;
  if not found then
    raise exception 'An active student account is required.' using errcode = '42501';
  end if;

  if v_student.initial_facial_enrollment_completed_at is not null
    or exists (select 1 from public.facial_profiles where student_id = v_student.id) then
    raise exception 'Facial enrollment is a one-time process and cannot be repeated.' using errcode = '23505';
  end if;

  insert into public.facial_profiles (
    student_id, enrollment_reference, facial_status, enrolled_at, consent_recorded_at, updated_at
  ) values (
    v_student.id, p_enrollment_reference, 'activated', now(), now(), now()
  ) returning * into v_profile;

  update public.students
  set initial_facial_enrollment_completed_at = now(), updated_at = now()
  where id = v_student.id;

  insert into public.facial_enrollment_history (
    student_id, credential_request_id, enrollment_reference, enrollment_kind,
    enrollment_status, replaced_profile_id, created_by
  ) values (
    v_student.id, null, p_enrollment_reference, 'initial', 'activated', null, v_actor
  );

  insert into public.audit_logs (actor_user_id, action, target_type, target_id, metadata)
  values (v_actor, 'facial_enrollment.initial', 'facial_profile', v_profile.id,
    jsonb_build_object('student_id', v_student.id));

  return v_profile;
end;
$$;


ALTER FUNCTION "public"."complete_facial_enrollment"("p_enrollment_reference" "text") OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."complete_request_email_outbox_delivery"("p_outbox_id" "uuid", "p_processing_token" "uuid", "p_provider_message_id" "text" DEFAULT NULL::"text") RETURNS "void"
    LANGUAGE "plpgsql"
    SET "search_path" TO ''
    AS $$
begin
  if auth.role() <> 'service_role' then
    raise exception 'Only the email worker may complete queued email.' using errcode = '42501';
  end if;
  update public.request_email_outbox
  set delivery_status = 'sent', sent_at = now(),
      provider_message_id = nullif(btrim(p_provider_message_id), ''),
      error_message = null, processing_started_at = null, processing_token = null
  where id = p_outbox_id and processing_token = p_processing_token;
  if not found then raise exception 'Email delivery lease was not found.' using errcode = 'P0002'; end if;
end;
$$;


ALTER FUNCTION "public"."complete_request_email_outbox_delivery"("p_outbox_id" "uuid", "p_processing_token" "uuid", "p_provider_message_id" "text") OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."create_organizer_event"("p_event_code" "text", "p_category_id" "uuid", "p_title" "text", "p_description" "text", "p_venue" "text", "p_starts_at" timestamp with time zone, "p_ends_at" timestamp with time zone, "p_priority_level" "text", "p_impact_score" numeric, "p_visibility" "text", "p_participant_ids" "uuid"[], "p_objectives" "text"[], "p_resource_title" "text" DEFAULT NULL::"text", "p_resource_url" "text" DEFAULT NULL::"text", "p_publish_reason" "text" DEFAULT 'Published by event organizer'::"text") RETURNS "public"."events"
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO ''
    AS $$
declare
  v_actor uuid := auth.uid();
  v_organizer_id uuid := private.current_organizer_id();
  v_event public.events;
  v_event_code text;
begin
  if not private.is_active_organizer() or v_organizer_id is null then
    raise exception 'An active organizer account is required.' using errcode = '42501';
  end if;
  if p_starts_at <= now() or p_ends_at <= p_starts_at then
    raise exception 'Event schedule must be in the future and end after it starts.' using errcode = '22023';
  end if;
  if p_visibility not in ('assigned', 'public') then
    raise exception 'Invalid event visibility.' using errcode = '22023';
  end if;
  if p_visibility = 'assigned' and coalesce(cardinality(p_participant_ids), 0) = 0 then
    raise exception 'Assigned events require at least one participant.' using errcode = '22023';
  end if;

  perform private.lock_event_publish_guard();
  v_event_code := private.allocate_event_code(p_event_code);
  perform private.assert_event_participant_schedule_available(null, p_starts_at, p_ends_at, p_participant_ids);

  insert into public.events (
    event_code, organizer_id, category_id, title, description, venue,
    starts_at, ends_at, event_status, approval_status, approval_reason,
    priority_level, impact_score, visibility, published_by, published_at
  ) values (
    v_event_code, v_organizer_id, p_category_id, btrim(p_title), nullif(btrim(p_description), ''), btrim(p_venue),
    p_starts_at, p_ends_at, 'scheduled', 'approved', coalesce(nullif(btrim(p_publish_reason), ''), 'Published by event organizer'),
    p_priority_level, p_impact_score, p_visibility, v_actor, now()
  ) returning * into v_event;

  insert into public.event_participants(event_id, student_id, participant_status)
  select v_event.id, participant_id, 'invited'
  from unnest(coalesce(p_participant_ids, array[]::uuid[])) participant_id
  join public.students s on s.id = participant_id and s.student_status = 'enrolled'
  on conflict (event_id, student_id) do nothing;

  if p_visibility = 'assigned' and (
    select count(*) from public.event_participants ep where ep.event_id = v_event.id
  ) <> cardinality(p_participant_ids) then
    raise exception 'One or more selected participants are not active students.' using errcode = '22023';
  end if;

  insert into public.event_objectives(event_id, objective_order, objective_text)
  select v_event.id, ordinal::integer, btrim(objective)
  from unnest(coalesce(p_objectives, array[]::text[])) with ordinality as valueset(objective, ordinal)
  where btrim(objective) <> '';

  if nullif(btrim(p_resource_url), '') is not null then
    if p_resource_url !~ '^https://' then
      raise exception 'Event resource URL must use HTTPS.' using errcode = '22023';
    end if;
    insert into public.event_resources(event_id, resource_title, external_url, created_by)
    values (v_event.id, coalesce(nullif(btrim(p_resource_title), ''), 'Event resource'), btrim(p_resource_url), v_actor);
  end if;

  insert into public.audit_logs(actor_user_id, action, target_type, target_id, metadata)
  values (v_actor, 'event.published', 'event', v_event.id,
    jsonb_build_object('event_code', v_event.event_code, 'visibility', p_visibility, 'participant_count', cardinality(p_participant_ids)));
  return v_event;
end;
$$;


ALTER FUNCTION "public"."create_organizer_event"("p_event_code" "text", "p_category_id" "uuid", "p_title" "text", "p_description" "text", "p_venue" "text", "p_starts_at" timestamp with time zone, "p_ends_at" timestamp with time zone, "p_priority_level" "text", "p_impact_score" numeric, "p_visibility" "text", "p_participant_ids" "uuid"[], "p_objectives" "text"[], "p_resource_title" "text", "p_resource_url" "text", "p_publish_reason" "text") OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."create_organizer_event_with_metadata"("p_event_code" "text", "p_category_id" "uuid", "p_title" "text", "p_description" "text", "p_venue" "text", "p_starts_at" timestamp with time zone, "p_ends_at" timestamp with time zone, "p_priority_level" "text", "p_impact_score" numeric, "p_visibility" "text", "p_participant_ids" "uuid"[], "p_objectives" "text"[], "p_resource_title" "text" DEFAULT NULL::"text", "p_resource_url" "text" DEFAULT NULL::"text", "p_publish_reason" "text" DEFAULT 'Published by event organizer'::"text", "p_requested_by" "text" DEFAULT NULL::"text", "p_college_office" "text" DEFAULT NULL::"text", "p_number_of_pax" integer DEFAULT NULL::integer, "p_institutional_category" "text" DEFAULT NULL::"text", "p_participation_status" "text" DEFAULT NULL::"text", "p_target_group" "text" DEFAULT NULL::"text", "p_urgency_points" integer DEFAULT 0, "p_priority_score" integer DEFAULT 0, "p_priority_tier" "text" DEFAULT 'Low'::"text", "p_fixed_priority" boolean DEFAULT false) RETURNS "public"."events"
    LANGUAGE "plpgsql"
    SET "search_path" TO ''
    AS $$
declare
  v_event public.events;
begin
  select * into v_event
  from public.create_organizer_event(
    p_event_code, p_category_id, p_title, p_description, p_venue,
    p_starts_at, p_ends_at, p_priority_level, p_impact_score, p_visibility,
    p_participant_ids, p_objectives, p_resource_title, p_resource_url,
    p_publish_reason
  );

  select * into v_event
  from public.update_organizer_event_metadata(
    v_event.id, p_requested_by, p_college_office, p_number_of_pax,
    p_institutional_category, p_participation_status, p_target_group,
    p_urgency_points, p_priority_score, p_priority_tier, p_fixed_priority
  );

  return v_event;
end;
$$;


ALTER FUNCTION "public"."create_organizer_event_with_metadata"("p_event_code" "text", "p_category_id" "uuid", "p_title" "text", "p_description" "text", "p_venue" "text", "p_starts_at" timestamp with time zone, "p_ends_at" timestamp with time zone, "p_priority_level" "text", "p_impact_score" numeric, "p_visibility" "text", "p_participant_ids" "uuid"[], "p_objectives" "text"[], "p_resource_title" "text", "p_resource_url" "text", "p_publish_reason" "text", "p_requested_by" "text", "p_college_office" "text", "p_number_of_pax" integer, "p_institutional_category" "text", "p_participation_status" "text", "p_target_group" "text", "p_urgency_points" integer, "p_priority_score" integer, "p_priority_tier" "text", "p_fixed_priority" boolean) OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."defer_due_email_outbox_deliveries"("p_defer_until" timestamp with time zone, "p_reason" "text") RETURNS integer
    LANGUAGE "plpgsql"
    SET "search_path" TO ''
    AS $$
declare
  v_count integer := 0;
  v_updated integer := 0;
  v_until timestamptz := greatest(coalesce(p_defer_until, now() + interval '1 hour'), now());
  v_reason text := left(coalesce(nullif(btrim(p_reason), ''), 'Email delivery temporarily deferred.'), 1000);
begin
  if auth.role() <> 'service_role' then
    raise exception 'Only the email worker may defer queued email.' using errcode = '42501';
  end if;
  perform pg_advisory_xact_lock(hashtextextended('plpass_email_daily_budget', 0));
  update public.event_email_outbox
  set next_attempt_at = v_until, error_message = v_reason
  where delivery_status = 'pending' and next_attempt_at <= now();
  get diagnostics v_count = row_count;
  update public.request_email_outbox
  set next_attempt_at = v_until, error_message = v_reason
  where delivery_status = 'pending' and next_attempt_at <= now();
  get diagnostics v_updated = row_count;
  v_count := v_count + v_updated;
  return v_count;
end;
$$;


ALTER FUNCTION "public"."defer_due_email_outbox_deliveries"("p_defer_until" timestamp with time zone, "p_reason" "text") OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."defer_event_email_outbox_delivery"("p_outbox_id" "uuid", "p_processing_token" "uuid", "p_defer_until" timestamp with time zone, "p_reason" "text") RETURNS "void"
    LANGUAGE "plpgsql"
    SET "search_path" TO ''
    AS $$
begin
  if auth.role() <> 'service_role' then
    raise exception 'Only the email worker may defer queued email.' using errcode = '42501';
  end if;

  update public.event_email_outbox
  set delivery_status = 'pending',
      next_attempt_at = greatest(coalesce(p_defer_until, now() + interval '1 hour'), now()),
      error_message = left(coalesce(nullif(btrim(p_reason), ''), 'Email provider quota temporarily unavailable.'), 1000),
      processing_started_at = null,
      processing_token = null
  where id = p_outbox_id
    and processing_token = p_processing_token
    and delivery_status = 'processing';

  if not found then
    raise exception 'Email delivery lease was not found.' using errcode = 'P0002';
  end if;
end;
$$;


ALTER FUNCTION "public"."defer_event_email_outbox_delivery"("p_outbox_id" "uuid", "p_processing_token" "uuid", "p_defer_until" timestamp with time zone, "p_reason" "text") OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."defer_request_email_outbox_delivery"("p_outbox_id" "uuid", "p_processing_token" "uuid", "p_defer_until" timestamp with time zone, "p_reason" "text") RETURNS "void"
    LANGUAGE "plpgsql"
    SET "search_path" TO ''
    AS $$
begin
  if auth.role() <> 'service_role' then
    raise exception 'Only the email worker may defer queued email.' using errcode = '42501';
  end if;

  update public.request_email_outbox
  set delivery_status = 'pending',
      next_attempt_at = greatest(coalesce(p_defer_until, now() + interval '1 hour'), now()),
      error_message = left(coalesce(nullif(btrim(p_reason), ''), 'Email provider quota temporarily unavailable.'), 1000),
      processing_started_at = null,
      processing_token = null
  where id = p_outbox_id
    and processing_token = p_processing_token
    and delivery_status = 'processing';

  if not found then
    raise exception 'Email delivery lease was not found.' using errcode = 'P0002';
  end if;
end;
$$;


ALTER FUNCTION "public"."defer_request_email_outbox_delivery"("p_outbox_id" "uuid", "p_processing_token" "uuid", "p_defer_until" timestamp with time zone, "p_reason" "text") OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."department_admin_issue_qr_credential"("p_student_id" "uuid", "p_expires_at" timestamp with time zone DEFAULT NULL::timestamp with time zone) RETURNS TABLE("credential_id" "uuid", "credential_status" "text", "issued_at" timestamp with time zone, "expires_at" timestamp with time zone)
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO ''
    AS $$
declare
  v_credential_id uuid;
  v_credential_status text;
  v_issued_at timestamptz;
  v_expires_at timestamptz;
begin
  if not (select private.is_active_department_admin())
    or not exists (
      select 1 from public.students s
      where s.id = p_student_id
        and s.department_id = (select private.current_department_id())
    ) then
    raise exception 'You can only reissue QR credentials for students in your department.' using errcode = '42501';
  end if;
  if p_expires_at is not null and p_expires_at <= now() then
    raise exception 'Credential expiry must be in the future.' using errcode = '22023';
  end if;

  update public.qr_credentials as q
  set credential_status = 'inactive', revoked_at = now(), updated_at = now()
  where q.student_id = p_student_id and q.credential_status = 'activated';

  insert into public.qr_credentials (student_id, token_hash, credential_status, issued_at, expires_at)
  values (
    p_student_id,
    encode(extensions.digest(gen_random_uuid()::text || p_student_id::text || clock_timestamp()::text, 'sha256'), 'hex'),
    'activated', now(), coalesce(p_expires_at, now() + interval '1 year')
  )
  returning id, qr_credentials.credential_status, qr_credentials.issued_at, qr_credentials.expires_at
    into v_credential_id, v_credential_status, v_issued_at, v_expires_at;

  insert into public.audit_logs (actor_user_id, action, target_type, target_id, metadata)
  values (auth.uid(), 'credential.qr_issued', 'qr_credential', v_credential_id,
    jsonb_build_object('student_id', p_student_id));

  credential_id := v_credential_id;
  credential_status := v_credential_status;
  issued_at := v_issued_at;
  expires_at := v_expires_at;
  return next;
end;
$$;


ALTER FUNCTION "public"."department_admin_issue_qr_credential"("p_student_id" "uuid", "p_expires_at" timestamp with time zone) OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."department_admin_list_credential_statuses"("p_student_ids" "uuid"[] DEFAULT NULL::"uuid"[]) RETURNS TABLE("student_id" "uuid", "qr_id" "uuid", "qr_credential_status" "text", "qr_issued_at" timestamp with time zone, "qr_expires_at" timestamp with time zone, "qr_revoked_at" timestamp with time zone, "qr_last_successful_check_in_at" timestamp with time zone, "qr_created_at" timestamp with time zone, "qr_updated_at" timestamp with time zone, "facial_id" "uuid", "facial_status" "text", "facial_enrolled_at" timestamp with time zone, "facial_last_verified_at" timestamp with time zone, "facial_consent_recorded_at" timestamp with time zone, "facial_created_at" timestamp with time zone, "facial_updated_at" timestamp with time zone)
    LANGUAGE "sql" SECURITY DEFINER
    SET "search_path" TO ''
    AS $$
  select
    scoped_students.id,
    qr.id,
    qr.credential_status,
    qr.issued_at,
    qr.expires_at,
    qr.revoked_at,
    qr.last_successful_check_in_at,
    qr.created_at,
    qr.updated_at,
    facial.id,
    facial.facial_status,
    facial.enrolled_at,
    facial.last_verified_at,
    facial.consent_recorded_at,
    facial.created_at,
    facial.updated_at
  from public.students as scoped_students
  left join lateral (
    select q.id, q.student_id, q.credential_status, q.issued_at, q.expires_at,
           q.revoked_at, q.last_successful_check_in_at, q.created_at, q.updated_at
    from public.qr_credentials as q
    where q.student_id = scoped_students.id
    order by q.issued_at desc nulls last, q.created_at desc
    limit 1
  ) as qr on true
  left join public.facial_profiles as facial on facial.student_id = scoped_students.id
  where (select private.is_active_department_admin())
    and scoped_students.department_id = (select private.current_department_id())
    and (p_student_ids is null or scoped_students.id = any(p_student_ids))
    and (qr.id is not null or facial.id is not null);
$$;


ALTER FUNCTION "public"."department_admin_list_credential_statuses"("p_student_ids" "uuid"[]) OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."department_admin_recover_stuck_attendance_session"("p_session_id" "uuid", "p_reason" "text") RETURNS "public"."event_sessions"
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO ''
    AS $$
declare
  v_actor uuid := (select auth.uid());
  v_session public.event_sessions;
  v_now timestamptz := now();
begin
  if v_actor is null or not (select private.is_active_department_admin()) then
    raise exception 'An active department administrator account is required.' using errcode = '42501';
  end if;
  if p_reason is null or length(btrim(p_reason)) < 5 then
    raise exception 'A recovery reason of at least 5 characters is required.' using errcode = '22023';
  end if;

  select session.* into v_session
  from public.event_sessions session
  join public.events e on e.id = session.event_id
  where session.id = p_session_id
    and session.session_status = 'ongoing'
    and session.scheduled_end < v_now - interval '30 minutes'
    and e.department_id = (select private.current_department_id())
  for update of session;

  if not found then
    raise exception 'Only a session in your department that is at least 30 minutes past its scheduled end can be recovered.' using errcode = 'P0002';
  end if;

  update public.event_sessions
  set session_status = 'completed', actual_end = v_now,
      ended_reason = btrim(p_reason), updated_at = v_now
  where id = v_session.id
  returning * into v_session;

  if not exists (
    select 1 from public.event_sessions other_session
    where other_session.event_id = v_session.event_id
      and other_session.id <> v_session.id
      and other_session.session_status = 'ongoing'
  ) then
    update public.events
    set event_status = 'completed', updated_at = v_now
    where id = v_session.event_id
      and department_id = (select private.current_department_id());
  end if;

  insert into public.audit_logs(actor_user_id, action, target_type, target_id, metadata)
  values (
    v_actor, 'system.department_stuck_session_recovered', 'attendance_session', v_session.id,
    jsonb_build_object('event_id', v_session.event_id, 'department_id', (select private.current_department_id()), 'reason', btrim(p_reason), 'attendance_records_preserved', true)
  );
  return v_session;
end;
$$;


ALTER FUNCTION "public"."department_admin_recover_stuck_attendance_session"("p_session_id" "uuid", "p_reason" "text") OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."department_admin_retry_event_email_job"("p_job_id" "uuid", "p_reason" "text") RETURNS "jsonb"
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO ''
    AS $$
declare
  v_actor uuid := (select auth.uid());
  v_job public.event_email_outbox;
begin
  if v_actor is null or not (select private.is_active_department_admin()) then
    raise exception 'An active department administrator account is required.' using errcode = '42501';
  end if;
  if p_reason is null or length(btrim(p_reason)) < 5 then
    raise exception 'A retry reason of at least 5 characters is required.' using errcode = '22023';
  end if;

  select outbox.* into v_job
  from public.event_email_outbox outbox
  join public.events e on e.id = outbox.event_id
  where outbox.id = p_job_id
    and e.department_id = (select private.current_department_id())
  for update of outbox;

  if not found then
    raise exception 'The email job was not found in your department.' using errcode = 'P0002';
  end if;
  if v_job.delivery_status <> 'failed'
     or v_job.notification_type <> 'participant_added'
     or v_job.created_at < now() - interval '24 hours'
     or (v_job.last_attempt_at is not null and v_job.last_attempt_at > now() - interval '15 minutes') then
    raise exception 'This email job is not eligible for retry. Only recent failed participant invitations outside the retry cooldown can be retried.' using errcode = '22023';
  end if;

  update public.event_email_outbox
  set delivery_status = 'pending', error_message = null, attempt_count = 0,
      next_attempt_at = now(), processing_started_at = null, processing_token = null
  where id = v_job.id and delivery_status = 'failed';

  insert into public.audit_logs(actor_user_id, action, target_type, target_id, metadata)
  values (
    v_actor, 'system.notification_retry', 'notification_job', v_job.id,
    jsonb_build_object('source', 'event_email', 'event_id', v_job.event_id, 'reason', btrim(p_reason))
  );

  return jsonb_build_object(
    'id', v_job.id, 'source', 'event_email', 'recipient_email', v_job.recipient_email,
    'subject', v_job.subject, 'delivery_status', 'pending', 'created_at', v_job.created_at
  );
end;
$$;


ALTER FUNCTION "public"."department_admin_retry_event_email_job"("p_job_id" "uuid", "p_reason" "text") OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."discard_empty_event_session"("p_session_id" "uuid") RETURNS "public"."event_sessions"
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO ''
    AS $$
declare
  v_actor uuid := auth.uid();
  v_session public.event_sessions;
begin
  if not private.is_active_organizer() then
    raise exception 'An active organizer account is required.' using errcode = '42501';
  end if;

  select es.* into v_session
  from public.event_sessions es
  join public.events e on e.id = es.event_id
  where es.id = p_session_id
    and e.organizer_id = private.current_organizer_id()
  for update of es;

  if not found then
    raise exception 'Session was not found or is outside this organizer scope.' using errcode = '42501';
  end if;

  if v_session.session_status <> 'ongoing' then
    raise exception 'Only a live session can be discarded.' using errcode = '22023';
  end if;

  if exists (select 1 from public.attendance_records where event_session_id = p_session_id) then
    raise exception 'A session with attendance records cannot be discarded.' using errcode = '22023';
  end if;

  update public.event_sessions
  set session_status = 'cancelled',
      actual_end = now(),
      ended_reason = 'Discarded before attendance was recorded.',
      updated_at = now()
  where id = p_session_id
  returning * into v_session;

  update public.events
  set event_status = 'scheduled', updated_at = now()
  where id = v_session.event_id
    and event_status = 'ongoing';

  insert into public.audit_logs(actor_user_id, action, target_type, target_id, metadata)
  values (v_actor, 'attendance_session.discarded', 'event_session', p_session_id,
    jsonb_build_object('event_id', v_session.event_id));

  return v_session;
end;
$$;


ALTER FUNCTION "public"."discard_empty_event_session"("p_session_id" "uuid") OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."end_event_attendance_session"("p_session_id" "uuid", "p_reason" "text") RETURNS "public"."event_sessions"
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO ''
    AS $$
declare
  v_actor uuid := auth.uid();
  v_session public.event_sessions;
  v_now timestamptz := now();
  v_absent_count integer := 0;
begin
  if not private.is_active_organizer() then
    raise exception 'An active organizer account is required.' using errcode = '42501';
  end if;
  if p_reason is null or length(btrim(p_reason)) < 5 then
    raise exception 'An ending reason of at least 5 characters is required.' using errcode = '22023';
  end if;

  select es.* into v_session
  from public.event_sessions es
  join public.events e on e.id = es.event_id
  where es.id = p_session_id
    and e.organizer_id = private.current_organizer_id()
  for update of es;

  if not found then
    raise exception 'Only an active owned session can be ended.' using errcode = '22023';
  end if;

  if v_session.session_status = 'completed' then
    if v_session.ended_reason is distinct from btrim(p_reason) then
      raise exception 'The session was already ended with a different reason.' using errcode = '40001';
    end if;
    return v_session;
  end if;

  if v_session.session_status <> 'ongoing' then
    raise exception 'Only an active owned session can be ended.' using errcode = '22023';
  end if;

  update public.event_sessions
  set session_status = 'completed', actual_end = v_now,
      ended_reason = btrim(p_reason), updated_at = v_now
  where id = p_session_id
  returning * into v_session;

  -- Do not finalize complete pairs here. The after-session trigger creates
  -- their pending feedback tasks, and the task/deadline RPCs own finalization.
  update public.attendance_records
  set attendance_status = 'absent',
      finalized_at = v_now,
      remarks = concat_ws(E'\\n', remarks, 'Attendance finalized absent: Time In or Time Out was not completed before session close.'),
      updated_at = v_now
  where event_session_id = v_session.id
    and finalized_at is null
    and (time_in is null or time_out is null);

  insert into public.attendance_records(event_session_id, student_id, attendance_status,
    verification_method, recorded_at, recorded_by, remarks, finalized_at)
  select v_session.id, ep.student_id, 'absent', 'manual', v_now, v_actor,
    'Automatically marked absent when session ended: no attendance was recorded.', v_now
  from public.event_participants ep
  where ep.event_id = v_session.event_id
    and ep.participant_status <> 'removed'
    and not exists (
      select 1 from public.attendance_records ar
      where ar.event_session_id = v_session.id and ar.student_id = ep.student_id
    )
  on conflict (event_session_id, student_id) where event_session_id is not null do nothing;
  get diagnostics v_absent_count = row_count;

  update public.events set event_status = 'completed', updated_at = v_now
  where id = v_session.event_id;

  insert into public.audit_logs(actor_user_id, action, target_type, target_id, metadata)
  values (v_actor, 'attendance_session.ended', 'event_session', p_session_id,
    jsonb_build_object('event_id', v_session.event_id, 'reason', btrim(p_reason), 'automatically_absent', v_absent_count));
  return v_session;
end;
$$;


ALTER FUNCTION "public"."end_event_attendance_session"("p_session_id" "uuid", "p_reason" "text") OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."expire_overdue_feedback_tasks"() RETURNS integer
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO ''
    AS $$
declare
  expired_count integer := 0;
begin
  with expired as (
    update public.event_feedback_tasks
    set task_status = 'expired', expired_at = now(), updated_at = now()
    where task_status = 'pending' and due_at <= now()
    returning attendance_record_id
  ), updated as (
    update public.attendance_records ar
    set attendance_status = 'absent',
        finalized_at = coalesce(ar.finalized_at, now()),
        remarks = concat_ws(E'\\n', ar.remarks, 'Attendance changed to absent: required feedback was not submitted within 24 hours.'),
        updated_at = now()
    from expired
    where ar.id = expired.attendance_record_id
    returning ar.id
  )
  select count(*) into expired_count from updated;
  return expired_count;
end;
$$;


ALTER FUNCTION "public"."expire_overdue_feedback_tasks"() OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."fail_event_email_outbox_delivery"("p_outbox_id" "uuid", "p_processing_token" "uuid", "p_error_message" "text") RETURNS "void"
    LANGUAGE "plpgsql"
    SET "search_path" TO ''
    AS $$
declare
  v_attempt_count integer;
begin
  if auth.role() <> 'service_role' then
    raise exception 'Only the email worker may update queued email.' using errcode = '42501';
  end if;

  select attempt_count into v_attempt_count
  from public.event_email_outbox
  where id = p_outbox_id
    and delivery_status = 'processing'
    and processing_token = p_processing_token
  for update;

  if not found then
    raise exception 'Email delivery lease was not found.' using errcode = 'P0002';
  end if;

  update public.event_email_outbox
  set delivery_status = case when v_attempt_count >= 5 then 'failed' else 'pending' end,
      next_attempt_at = case v_attempt_count
        when 1 then now() + interval '1 minute'
        when 2 then now() + interval '5 minutes'
        when 3 then now() + interval '15 minutes'
        when 4 then now() + interval '1 hour'
        else now() + interval '4 hours'
      end,
      error_message = left(coalesce(nullif(btrim(p_error_message), ''), 'Email delivery failed.'), 1000),
      processing_started_at = null,
      processing_token = null
  where id = p_outbox_id;
end;
$$;


ALTER FUNCTION "public"."fail_event_email_outbox_delivery"("p_outbox_id" "uuid", "p_processing_token" "uuid", "p_error_message" "text") OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."fail_request_email_outbox_delivery"("p_outbox_id" "uuid", "p_processing_token" "uuid", "p_error_message" "text") RETURNS "void"
    LANGUAGE "plpgsql"
    SET "search_path" TO ''
    AS $$
declare v_attempt_count integer;
begin
  if auth.role() <> 'service_role' then
    raise exception 'Only the email worker may update queued email.' using errcode = '42501';
  end if;
  select attempt_count into v_attempt_count
  from public.request_email_outbox
  where id = p_outbox_id and processing_token = p_processing_token for update;
  if not found then raise exception 'Email delivery lease was not found.' using errcode = 'P0002'; end if;
  update public.request_email_outbox
  set delivery_status = case when v_attempt_count >= 5 then 'failed' else 'pending' end,
      next_attempt_at = case v_attempt_count
        when 1 then now() + interval '1 minute'
        when 2 then now() + interval '5 minutes'
        when 3 then now() + interval '15 minutes'
        when 4 then now() + interval '1 hour'
        else now() + interval '4 hours' end,
      error_message = left(coalesce(nullif(btrim(p_error_message), ''), 'Email delivery failed.'), 1000),
      processing_started_at = null, processing_token = null
  where id = p_outbox_id;
end;
$$;


ALTER FUNCTION "public"."fail_request_email_outbox_delivery"("p_outbox_id" "uuid", "p_processing_token" "uuid", "p_error_message" "text") OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."finalize_event_attendance_session"("p_session_id" "uuid", "p_reason" "text", "p_attendance_records" "jsonb" DEFAULT '[]'::"jsonb") RETURNS "public"."event_sessions"
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO ''
    AS $$
begin
  return public.end_event_attendance_session(p_session_id, p_reason);
end;
$$;


ALTER FUNCTION "public"."finalize_event_attendance_session"("p_session_id" "uuid", "p_reason" "text", "p_attendance_records" "jsonb") OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."qr_credentials" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "student_id" "uuid" NOT NULL,
    "token_hash" "text" NOT NULL,
    "credential_status" "text" DEFAULT 'activated'::"text" NOT NULL,
    "issued_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "expires_at" timestamp with time zone,
    "revoked_at" timestamp with time zone,
    "last_successful_check_in_at" timestamp with time zone,
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "updated_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    CONSTRAINT "qr_credentials_expiry_valid" CHECK ((("expires_at" IS NULL) OR ("expires_at" > "issued_at"))),
    CONSTRAINT "qr_credentials_hash_not_blank" CHECK (("btrim"("token_hash") <> ''::"text")),
    CONSTRAINT "qr_credentials_status_valid" CHECK (("credential_status" = ANY (ARRAY['activated'::"text", 'inactive'::"text", 'damaged'::"text", 'blocked'::"text"])))
);


ALTER TABLE "public"."qr_credentials" OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."generate_student_qr_credential"() RETURNS "public"."qr_credentials"
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO ''
    AS $$
declare
  v_student_id uuid := private.current_student_id();
  v_credential public.qr_credentials;
begin
  if auth.uid() is null or v_student_id is null then
    raise exception 'An authenticated student account is required.' using errcode = '42501';
  end if;

  update public.qr_credentials
  set credential_status = 'inactive', revoked_at = now(), updated_at = now()
  where student_id = v_student_id and credential_status = 'activated';

  insert into public.qr_credentials (
    student_id, token_hash, credential_status, issued_at, expires_at
  ) values (
    v_student_id,
    encode(extensions.digest(gen_random_uuid()::text || v_student_id::text || clock_timestamp()::text, 'sha256'), 'hex'),
    'activated', now(), now() + interval '1 year'
  ) returning * into v_credential;

  insert into public.audit_logs (actor_user_id, action, target_type, target_id, metadata)
  values (auth.uid(), 'credential.qr_generated_by_student', 'qr_credential', v_credential.id,
    jsonb_build_object('student_id', v_student_id));

  return v_credential;
end;
$$;


ALTER FUNCTION "public"."generate_student_qr_credential"() OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."get_conflicting_events"() RETURNS TABLE("event_id" "uuid", "event_code" "text", "title" "text", "starts_at" timestamp with time zone, "ends_at" timestamp with time zone, "priority_level" "text", "impact_score" numeric, "conflicts_with" "uuid"[])
    LANGUAGE "sql" STABLE
    SET "search_path" TO 'pg_catalog', 'public', 'extensions'
    AS $$
  select
    e1.id as event_id,
    e1.event_code,
    e1.title,
    e1.starts_at,
    e1.ends_at,
    e1.priority_level,
    e1.impact_score,
    array_agg(e2.id) as conflicts_with
  from public.events e1
  join public.events e2
    on e1.id <> e2.id
    and e1.event_status not in ('cancelled', 'completed')
    and e2.event_status not in ('cancelled', 'completed')
    and e1.starts_at < e2.ends_at
    and e2.starts_at < e1.ends_at
  group by e1.id;
$$;


ALTER FUNCTION "public"."get_conflicting_events"() OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."get_event_attendance_capture_phase"("p_session_id" "uuid") RETURNS "text"
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO ''
    AS $$
declare
  v_phase text;
begin
  if not private.is_active_organizer() then
    raise exception 'An active organizer account is required.' using errcode = '42501';
  end if;

  select es.attendance_capture_phase
    into v_phase
  from public.event_sessions es
  join public.events e on e.id = es.event_id
  where es.id = p_session_id
    and e.organizer_id = private.current_organizer_id();

  if v_phase is null then
    raise exception 'The attendance session is outside this organizer scope.' using errcode = '42501';
  end if;

  return v_phase;
end;
$$;


ALTER FUNCTION "public"."get_event_attendance_capture_phase"("p_session_id" "uuid") OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."get_event_participant_schedule_conflicts"("p_starts_at" timestamp with time zone, "p_ends_at" timestamp with time zone, "p_student_ids" "uuid"[]) RETURNS TABLE("student_id" "uuid", "event_code" "text", "event_title" "text", "starts_at" timestamp with time zone, "ends_at" timestamp with time zone)
    LANGUAGE "plpgsql" STABLE SECURITY DEFINER
    SET "search_path" TO ''
    AS $$
begin
  if not private.is_active_organizer() then
    raise exception 'An active organizer account is required.' using errcode = '42501';
  end if;
  if p_starts_at is null or p_ends_at is null or p_ends_at <= p_starts_at then
    raise exception 'A valid event schedule is required.' using errcode = '22023';
  end if;

  return query
  select distinct on (ep.student_id)
    ep.student_id, e.event_code, e.title, e.starts_at, e.ends_at
  from public.event_participants ep
  join public.events e on e.id = ep.event_id
  where ep.student_id = any(coalesce(p_student_ids, array[]::uuid[]))
    and ep.participant_status <> 'removed'
    and e.approval_status = 'approved'
    and e.event_status not in ('draft', 'cancelled', 'completed')
    and e.starts_at < p_ends_at
    and e.ends_at > p_starts_at
  order by ep.student_id, e.published_at nulls last, e.created_at, e.id;
end;
$$;


ALTER FUNCTION "public"."get_event_participant_schedule_conflicts"("p_starts_at" timestamp with time zone, "p_ends_at" timestamp with time zone, "p_student_ids" "uuid"[]) OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."get_facial_descriptor_for_organizer"("p_student_id" "uuid", "p_event_session_id" "uuid") RETURNS "jsonb"
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO ''
    AS $$
declare
  v_actor uuid := (select auth.uid());
  v_descriptor jsonb;
begin
  if v_actor is null or not (select private.is_active_organizer()) then
    raise exception 'Only active organizers may verify a facial enrollment.' using errcode = '42501';
  end if;

  if not exists (
    select 1
    from public.event_sessions as event_session
    join public.events as event on event.id = event_session.event_id
    join public.organizers as organizer on organizer.id = event.organizer_id
    join public.event_participants as participant
      on participant.event_id = event.id
     and participant.student_id = p_student_id
     and participant.participant_status <> 'removed'
    where event_session.id = p_event_session_id
      and event_session.session_status = 'ongoing'
      and organizer.profile_id = v_actor
  ) then
    raise exception 'The student is not eligible for facial verification in this session.' using errcode = '42501';
  end if;

  select facial_profile.face_descriptor
    into v_descriptor
  from public.facial_profiles as facial_profile
  where facial_profile.student_id = p_student_id
    and facial_profile.facial_status = 'activated';

  insert into public.audit_logs (actor_user_id, action, target_type, target_id, metadata)
  values (
    v_actor,
    'facial_descriptor.accessed',
    'student',
    p_student_id,
    jsonb_build_object('event_session_id', p_event_session_id, 'descriptor_found', v_descriptor is not null)
  );

  return v_descriptor;
end;
$$;


ALTER FUNCTION "public"."get_facial_descriptor_for_organizer"("p_student_id" "uuid", "p_event_session_id" "uuid") OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."get_live_facial_candidate_ids"("p_event_session_id" "uuid") RETURNS TABLE("student_id" "uuid", "student_number" "text", "display_name" "text")
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO ''
    AS $$
declare v_actor uuid := (select auth.uid());
begin
  if v_actor is null or not (select private.is_active_organizer()) then
    raise exception 'Only active organizers may run facial identification.' using errcode = '42501';
  end if;
  if not exists (
    select 1 from public.event_sessions session
    join public.events event on event.id = session.event_id
    join public.organizers organizer on organizer.id = event.organizer_id
    where session.id = p_event_session_id
      and session.session_status = 'ongoing'
      and organizer.profile_id = v_actor
  ) then
    raise exception 'SESSION_NOT_ACTIVE' using errcode = '42501';
  end if;

  return query
  select student.id, student.student_id,
         concat_ws(' ', profile.first_name, nullif(profile.middle_name, ''), profile.last_name)
  from public.event_sessions session
  join public.event_participants participant on participant.event_id = session.event_id and participant.participant_status <> 'removed'
  join public.students student on student.id = participant.student_id
  join public.profiles profile on profile.id = student.profile_id
  join public.facial_profiles facial_profile on facial_profile.student_id = student.id and facial_profile.facial_status = 'activated'
  join public.student_face_embeddings embedding on embedding.student_id = student.id and embedding.model_name = 'ArcFace' and embedding.detector_backend = 'retinaface'
  where session.id = p_event_session_id
  group by student.id, student.student_id, profile.first_name, profile.middle_name, profile.last_name
  having count(embedding.id) = 3
  order by student.student_id;
end;
$$;


ALTER FUNCTION "public"."get_live_facial_candidate_ids"("p_event_session_id" "uuid") OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."get_live_facial_candidates"("p_event_session_id" "uuid") RETURNS TABLE("student_id" "uuid", "student_number" "text", "display_name" "text", "enrollment_reference" "text")
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO ''
    AS $$
declare
  v_actor uuid := (select auth.uid());
begin
  if v_actor is null or not (select private.is_active_organizer()) then
    raise exception 'Only active organizers may run facial identification.' using errcode = '42501';
  end if;

  if not exists (
    select 1
    from public.event_sessions session
    join public.events event on event.id = session.event_id
    join public.organizers organizer on organizer.id = event.organizer_id
    where session.id = p_event_session_id
      and session.session_status = 'ongoing'
      and organizer.profile_id = v_actor
  ) then
    raise exception 'An owned active attendance session is required.' using errcode = '42501';
  end if;

  return query
  select
    student.id,
    student.student_id,
    concat_ws(' ', profile.first_name, nullif(profile.middle_name, ''), profile.last_name),
    facial_profile.enrollment_reference
  from public.event_sessions session
  join public.event_participants participant
    on participant.event_id = session.event_id
   and participant.participant_status <> 'removed'
  join public.students student on student.id = participant.student_id
  join public.profiles profile on profile.id = student.profile_id
  join public.facial_profiles facial_profile
    on facial_profile.student_id = student.id
   and facial_profile.facial_status = 'activated'
  where session.id = p_event_session_id
  order by student.student_id;
end;
$$;


ALTER FUNCTION "public"."get_live_facial_candidates"("p_event_session_id" "uuid") OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."get_next_event_code"() RETURNS "text"
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO ''
    AS $$
begin
  if not private.is_active_organizer() then
    raise exception 'An active organizer account is required.' using errcode = '42501';
  end if;
  return private.allocate_event_code(null);
end;
$$;


ALTER FUNCTION "public"."get_next_event_code"() OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."get_published_legal_document"("p_document_type" "text") RETURNS TABLE("document_type" "text", "sections" "jsonb", "version" "text", "published_at" timestamp with time zone)
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO 'public', 'pg_catalog'
    AS $$
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


ALTER FUNCTION "public"."get_published_legal_document"("p_document_type" "text") OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."get_student_dashboard_summary"() RETURNS "jsonb"
    LANGUAGE "sql" STABLE
    SET "search_path" TO ''
    AS $$
  with current_student as (select private.current_student_id() as id),
  record_counts as (
    select count(*)::integer as total_count,
      count(*) filter (where ar.attendance_status = 'present')::integer as present_count,
      count(*) filter (where ar.attendance_status = 'late')::integer as late_count,
      count(*) filter (where ar.attendance_status = 'absent')::integer as absent_count
    from public.attendance_records ar
    join current_student s on s.id = ar.student_id
    where ar.finalized_at is not null
  ),
  actionable_tasks as (
    select 'feedback'::text as kind, task.id, task.attendance_record_id, task.event_id,
      event.title, event.event_code, category.category_name,
      case when session.late_cutoff_at is not null and ar.time_in > session.late_cutoff_at then 'late' else 'present' end,
      session.scheduled_start, task.due_at
    from public.event_feedback_tasks task
    join current_student s on s.id = task.student_id
    join public.attendance_records ar on ar.id = task.attendance_record_id
    join public.event_sessions session on session.id = ar.event_session_id
    join public.events event on event.id = task.event_id
    join public.event_categories category on category.id = event.category_id
    where task.task_status = 'pending'
      and task.due_at > now()
      and ar.time_in is not null
      and ar.time_out is not null
      and ar.finalized_at is null
      and not (
        session.late_cutoff_at is not null
        and ar.time_in > session.late_cutoff_at
        and (ar.late_reason_option_id is null or ar.late_reason_submitted_at <= ar.time_out)
      )
    union all
    select 'late_reason'::text, ar.id, ar.id, session.event_id,
      event.title, event.event_code, category.category_name, 'late'::text,
      session.scheduled_start,
      coalesce(task.due_at, coalesce(session.actual_end, session.scheduled_end) + interval '24 hours')
    from public.attendance_records ar
    join current_student s on s.id = ar.student_id
    join public.event_sessions session on session.id = ar.event_session_id
    join public.events event on event.id = session.event_id
    join public.event_categories category on category.id = event.category_id
    left join public.event_feedback_tasks task on task.attendance_record_id = ar.id
    where ar.time_in is not null
      and ar.time_out is not null
      and ar.finalized_at is null
      and session.session_status <> 'cancelled'
      and session.late_cutoff_at is not null
      and ar.time_in > session.late_cutoff_at
      and (ar.late_reason_option_id is null or ar.late_reason_submitted_at <= ar.time_out)
      and (session.session_status <> 'completed' or (session.actual_end is not null and session.actual_end + interval '24 hours' > now()))
      and (task.id is null or (task.task_status = 'pending' and task.due_at > now()))
  ),
  rejected_corrections as (
    select count(*)::integer as count
    from public.attendance_requests request
    join current_student s on s.id = request.student_id
    where request.request_status = 'rejected'
  ),
  task_json as (
    select jsonb_agg(jsonb_build_object(
      'id', id, 'kind', kind, 'attendanceRecordId', attendance_record_id,
      'eventId', event_id, 'title', title, 'code', event_code,
      'category', category_name, 'status', case when kind = 'late_reason' then 'late' else 'pending' end,
      'startsAt', scheduled_start, 'dueAt', due_at
    ) order by due_at asc) as items
    from actionable_tasks
  )
  select jsonb_build_object(
    'totalCount', rc.total_count,
    'presentCount', rc.present_count,
    'lateCount', rc.late_count,
    'absentCount', rc.absent_count,
    'attendedCount', rc.present_count + rc.late_count,
    'attendanceRate', case when rc.total_count = 0 then 0 else round(((rc.present_count + rc.late_count)::numeric / rc.total_count) * 100)::integer end,
    'lateReasonTaskCount', (select count(*)::integer from actionable_tasks where kind = 'late_reason'),
    'feedbackTaskCount', (select count(*)::integer from actionable_tasks where kind = 'feedback'),
    'rejectedCorrectionCount', (select count from rejected_corrections),
    'pendingTaskCount', (select count(*)::integer from actionable_tasks),
    'tasks', coalesce((select items from task_json), '[]'::jsonb)
  ) from record_counts rc;
$$;


ALTER FUNCTION "public"."get_student_dashboard_summary"() OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."identify_event_participant_by_face"("p_event_session_id" "uuid", "p_live_descriptor" "jsonb") RETURNS TABLE("student_id" "uuid", "similarity" double precision)
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO ''
    AS $$
declare
  v_actor uuid := (select auth.uid());
begin
  if v_actor is null or not (select private.is_active_organizer()) then
    raise exception 'Only active organizers may identify an enrolled face.' using errcode = '42501';
  end if;

  if p_live_descriptor is null
    or jsonb_typeof(p_live_descriptor) <> 'array'
    or jsonb_array_length(p_live_descriptor) < 32
    or jsonb_array_length(p_live_descriptor) > 4096
    or exists (
      select 1
      from jsonb_array_elements(p_live_descriptor) as element(value)
      where jsonb_typeof(element.value) <> 'number'
    ) then
    raise exception 'A valid live face descriptor is required.' using errcode = '22023';
  end if;

  if not exists (
    select 1
    from public.event_sessions as event_session
    join public.events as event on event.id = event_session.event_id
    join public.organizers as organizer on organizer.id = event.organizer_id
    where event_session.id = p_event_session_id
      and event_session.session_status = 'ongoing'
      and organizer.profile_id = v_actor
  ) then
    raise exception 'The event session is not available for facial verification.' using errcode = '42501';
  end if;

  return query
  with candidates as (
    select facial_profile.student_id, facial_profile.face_descriptor
    from public.event_sessions as event_session
    join public.events as event on event.id = event_session.event_id
    join public.event_participants as participant
      on participant.event_id = event.id
     and participant.participant_status <> 'removed'
    join public.facial_profiles as facial_profile
      on facial_profile.student_id = participant.student_id
     and facial_profile.facial_status = 'activated'
     and facial_profile.face_descriptor is not null
    where event_session.id = p_event_session_id
      and jsonb_array_length(facial_profile.face_descriptor) = jsonb_array_length(p_live_descriptor)
      and not exists (
        select 1
        from jsonb_array_elements(facial_profile.face_descriptor) as element(value)
        where jsonb_typeof(element.value) <> 'number'
      )
  ), scored_candidates as (
    select
      candidate.student_id,
      sum(reference.value::double precision * live.value::double precision)
        / nullif(
          sqrt(sum(power(reference.value::double precision, 2)))
            * sqrt(sum(power(live.value::double precision, 2))),
          0
        ) as similarity
    from candidates as candidate
    join lateral jsonb_array_elements_text(candidate.face_descriptor) with ordinality as reference(value, position)
      on true
    join lateral jsonb_array_elements_text(p_live_descriptor) with ordinality as live(value, position)
      on live.position = reference.position
    group by candidate.student_id
  )
  select scored_candidate.student_id, scored_candidate.similarity
  from scored_candidates as scored_candidate
  where scored_candidate.similarity >= 0.82
  order by scored_candidate.similarity desc
  limit 1;

  insert into public.audit_logs (actor_user_id, action, target_type, target_id, metadata)
  values (
    v_actor,
    'facial_participant.identification_requested',
    'event_session',
    p_event_session_id,
    jsonb_build_object('descriptor_dimensions', jsonb_array_length(p_live_descriptor))
  );
end;
$$;


ALTER FUNCTION "public"."identify_event_participant_by_face"("p_event_session_id" "uuid", "p_live_descriptor" "jsonb") OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."issue_qr_credential"("p_student_id" "uuid", "p_expires_at" timestamp with time zone DEFAULT NULL::timestamp with time zone) RETURNS "public"."qr_credentials"
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO ''
    AS $$
declare
  v_actor uuid := auth.uid();
  v_credential public.qr_credentials;
begin
  if (select private.is_active_department_admin()) then
    raise exception 'Use the department-scoped QR reissue action.' using errcode = '42501';
  end if;
  if not private.can_manage_student_credentials(p_student_id) then
    raise exception 'You can only manage credentials for participants in your own events.' using errcode = '42501';
  end if;
  if not exists (select 1 from public.students s where s.id = p_student_id) then
    raise exception 'Student was not found.' using errcode = 'P0002';
  end if;
  if p_expires_at is not null and p_expires_at <= now() then
    raise exception 'Credential expiry must be in the future.' using errcode = '22023';
  end if;

  update public.qr_credentials
  set credential_status = 'inactive', revoked_at = now(), updated_at = now()
  where student_id = p_student_id and credential_status = 'activated';

  insert into public.qr_credentials (student_id, token_hash, credential_status, issued_at, expires_at)
  values (
    p_student_id,
    encode(extensions.digest(gen_random_uuid()::text || p_student_id::text || clock_timestamp()::text, 'sha256'), 'hex'),
    'activated', now(), coalesce(p_expires_at, now() + interval '1 year')
  ) returning * into v_credential;

  insert into public.audit_logs (actor_user_id, action, target_type, target_id, metadata)
  values (v_actor, 'credential.qr_issued', 'qr_credential', v_credential.id,
    jsonb_build_object('student_id', p_student_id));

  return v_credential;
end;
$$;


ALTER FUNCTION "public"."issue_qr_credential"("p_student_id" "uuid", "p_expires_at" timestamp with time zone) OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."list_student_finalized_event_years"() RETURNS TABLE("event_year" integer)
    LANGUAGE "sql" STABLE
    SET "search_path" TO ''
    AS $$
  select distinct extract(year from coalesce(session.scheduled_start, event.starts_at, record.recorded_at) at time zone 'Asia/Manila')::integer
  from public.attendance_records record
  join public.event_sessions session on session.id = record.event_session_id
  join public.events event on event.id = session.event_id
  left join public.event_feedback_tasks task on task.attendance_record_id = record.id
  where record.student_id = private.current_student_id()
    and (
      record.attendance_status in ('absent', 'excused')
      or (record.attendance_status in ('present', 'late') and task.task_status = 'completed')
    )
  order by 1 desc;
$$;


ALTER FUNCTION "public"."list_student_finalized_event_years"() OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."log_client_action"("p_action" "text", "p_target_type" "text", "p_target_id" "uuid" DEFAULT NULL::"uuid", "p_metadata" "jsonb" DEFAULT '{}'::"jsonb") RETURNS "void"
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO ''
    AS $$
declare
  v_uid uuid := (select auth.uid());
  v_is_privileged boolean;
begin
  if v_uid is null then
    raise exception 'Unauthorized';
  end if;

  select exists (
    select 1
    from public.profiles
    where id = v_uid
      and role in ('admin', 'department_admin', 'organizer')
      and account_status = 'active'
  ) into v_is_privileged;

  if not v_is_privileged then
    raise exception 'Unauthorized: Only active administrators or organizers can manually log actions.' using errcode = '42501';
  end if;

  if p_action is null or btrim(p_action) = '' or length(p_action) > 120 then
    raise exception 'A valid action of at most 120 characters is required.' using errcode = '22023';
  end if;
  if p_target_type is null or btrim(p_target_type) = '' or length(p_target_type) > 80 then
    raise exception 'A valid target type of at most 80 characters is required.' using errcode = '22023';
  end if;
  if jsonb_typeof(coalesce(p_metadata, '{}'::jsonb)) <> 'object' or octet_length(coalesce(p_metadata, '{}'::jsonb)::text) > 16384 then
    raise exception 'Audit metadata must be an object no larger than 16 KiB.' using errcode = '22023';
  end if;

  insert into public.audit_logs (actor_user_id, action, target_type, target_id, metadata)
  values (v_uid, btrim(p_action), btrim(p_target_type), p_target_id, coalesce(p_metadata, '{}'::jsonb));
end;
$$;


ALTER FUNCTION "public"."log_client_action"("p_action" "text", "p_target_type" "text", "p_target_id" "uuid", "p_metadata" "jsonb") OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."organizer_list_credential_directory"() RETURNS TABLE("student_id" "uuid", "student_number" "text", "student_name" "text", "qr_id" "uuid", "qr_credential_status" "text", "qr_issued_at" timestamp with time zone, "qr_expires_at" timestamp with time zone, "qr_revoked_at" timestamp with time zone, "qr_last_successful_check_in_at" timestamp with time zone, "qr_created_at" timestamp with time zone, "qr_updated_at" timestamp with time zone, "facial_id" "uuid", "facial_status" "text", "facial_enrolled_at" timestamp with time zone, "facial_last_verified_at" timestamp with time zone, "facial_consent_recorded_at" timestamp with time zone, "facial_created_at" timestamp with time zone, "facial_updated_at" timestamp with time zone)
    LANGUAGE "sql" SECURITY DEFINER
    SET "search_path" TO ''
    AS $$
  select student.id, student.student_id,
    concat_ws(' ', profile.first_name, nullif(profile.middle_name, ''), profile.last_name, nullif(profile.name_extension, '')),
    qr.id, qr.credential_status, qr.issued_at, qr.expires_at, qr.revoked_at, qr.last_successful_check_in_at, qr.created_at, qr.updated_at,
    facial.id, facial.facial_status, facial.enrolled_at, facial.last_verified_at, facial.consent_recorded_at, facial.created_at, facial.updated_at
  from public.students as student
  join public.profiles as profile on profile.id = student.profile_id
  left join lateral (
    select q.id, q.credential_status, q.issued_at, q.expires_at, q.revoked_at, q.last_successful_check_in_at, q.created_at, q.updated_at
    from public.qr_credentials as q where q.student_id = student.id
    order by q.issued_at desc nulls last, q.created_at desc limit 1
  ) as qr on true
  left join public.facial_profiles as facial on facial.student_id = student.id
  where (select private.is_active_organizer())
    and exists (
      select 1 from public.event_participants as participant
      join public.events as event on event.id = participant.event_id
      where participant.student_id = student.id
        and participant.participant_status <> 'removed'
        and event.organizer_id = (select private.current_organizer_id())
    )
  order by student.student_id;
$$;


ALTER FUNCTION "public"."organizer_list_credential_directory"() OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."organizer_list_invitation_students"("p_limit" integer DEFAULT 20, "p_offset" integer DEFAULT 0, "p_student_ids" "uuid"[] DEFAULT NULL::"uuid"[]) RETURNS "jsonb"
    LANGUAGE "plpgsql" STABLE SECURITY DEFINER
    SET "search_path" TO ''
    AS $$
declare
  v_limit integer := least(greatest(coalesce(p_limit, 20), 1), 1000);
  v_offset integer := greatest(coalesce(p_offset, 0), 0);
  v_result jsonb;
begin
  if not (select private.is_active_organizer()) then
    raise exception 'An active organizer account is required.' using errcode = '42501';
  end if;

  with eligible as (
    select
      s.id,
      s.profile_id,
      s.student_id,
      s.program_id,
      s.department_id,
      s.section_id,
      s.year_level,
      s.student_status,
      s.created_at,
      jsonb_build_object(
        'first_name', p.first_name,
        'middle_name', p.middle_name,
        'last_name', p.last_name,
        'name_extension', p.name_extension,
        'email', p.email,
        'account_status', p.account_status
      ) as profiles,
      jsonb_build_object(
        'section_name', sec.section_name,
        'year_level', sec.year_level
      ) as sections,
      jsonb_build_object(
        'program_code', prog.program_code,
        'program_name', prog.program_name
      ) as programs
    from public.students s
    join public.profiles p on p.id = s.profile_id and p.role = 'student'
    left join public.sections sec on sec.id = s.section_id
    left join public.programs prog on prog.id = s.program_id
    where p_student_ids is null or s.id = any (p_student_ids)
  ),
  page_rows as (
    select * from eligible
    order by student_id, id
    limit v_limit offset v_offset
  )
  select jsonb_build_object(
    'total', (select count(*) from eligible),
    'items', coalesce((select jsonb_agg(to_jsonb(page_rows)) from page_rows), '[]'::jsonb)
  ) into v_result;

  return v_result;
end;
$$;


ALTER FUNCTION "public"."organizer_list_invitation_students"("p_limit" integer, "p_offset" integer, "p_student_ids" "uuid"[]) OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."prepare_offline_event_package"("p_event_id" "uuid") RETURNS "jsonb"
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO ''
    AS $$
declare
  v_actor uuid := auth.uid();
  v_event public.events;
  v_session public.event_sessions;
  v_result jsonb;
begin
  if not private.is_active_organizer() then
    raise exception 'An active organizer account is required.' using errcode = '42501';
  end if;

  select * into v_event from public.events
  where id = p_event_id
    and organizer_id = private.current_organizer_id()
    and event_status in ('scheduled', 'ongoing')
  for update;
  if not found then
    raise exception 'An owned scheduled or ongoing event is required.' using errcode = '42501';
  end if;

  select * into v_session from public.event_sessions
  where event_id = v_event.id
    and session_status in ('scheduled', 'ongoing')
    and coalesce(session_archive_status, 'active') = 'active'
  order by case session_status when 'ongoing' then 0 else 1 end, scheduled_start desc
  limit 1 for update;

  if not found then
    insert into public.event_sessions(
      event_id, created_by, session_name, venue, mode, session_status,
      scheduled_start, scheduled_end, attendance_window_start_at,
      attendance_window_end_at, late_cutoff_at, session_archive_status
    ) values (
      v_event.id, v_actor,
      to_char(v_event.starts_at at time zone 'Asia/Manila', 'YYYY-MM-DD') || ' attendance',
      v_event.venue, 'f2f', 'scheduled', v_event.starts_at, v_event.ends_at,
      v_event.starts_at, v_event.ends_at, v_event.starts_at + interval '15 minutes', 'active'
    ) returning * into v_session;
  end if;

  select jsonb_build_object(
    'cacheVersion', 2,
    'preparedAt', now(),
    'event', jsonb_build_object('id', e.id, 'code', e.event_code, 'title', e.title, 'status', e.event_status, 'startsAt', e.starts_at, 'endsAt', e.ends_at),
    'sessions', coalesce((select jsonb_agg(jsonb_build_object(
      'id', s.id, 'eventId', s.event_id, 'title', s.session_name, 'venue', s.venue,
      'status', s.session_status, 'startsAt', s.scheduled_start, 'endsAt', s.scheduled_end,
      'lateCutoffAt', s.late_cutoff_at, 'attendanceWindowStartAt', s.attendance_window_start_at,
      'attendanceWindowEndAt', s.attendance_window_end_at
    )) from public.event_sessions s where s.event_id=e.id and s.session_status in ('scheduled','ongoing')), '[]'::jsonb),
    'participants', coalesce((select jsonb_agg(jsonb_build_object(
      'studentId', st.id, 'studentNumber', st.student_id,
      'displayName', concat_ws(' ', p.first_name, nullif(p.middle_name, ''), p.last_name),
      'participantStatus', ep.participant_status, 'qrIdentifier', q.id,
      'faceEmbeddings', coalesce((select jsonb_agg(fe.embedding order by fe.pose) from public.student_face_embeddings fe where fe.student_id=st.id and fe.model_name='ArcFace' and fe.detector_backend='retinaface'), '[]'::jsonb)
    )) from public.event_participants ep join public.students st on st.id=ep.student_id join public.profiles p on p.id=st.profile_id
      left join lateral (select qc.id from public.qr_credentials qc where qc.student_id=st.id and qc.credential_status='activated' and (qc.expires_at is null or qc.expires_at>now()) order by qc.issued_at desc limit 1) q on true
      where ep.event_id=e.id and ep.participant_status<>'removed'), '[]'::jsonb),
    'studentDirectory', coalesce((select jsonb_agg(jsonb_build_object(
      'studentId', st.id, 'studentNumber', st.student_id,
      'displayName', concat_ws(' ', p.first_name, nullif(p.middle_name, ''), p.last_name),
      'participantStatus', 'directory', 'qrIdentifier', q.id, 'faceEmbeddings', '[]'::jsonb
    )) from public.students st join public.profiles p on p.id=st.profile_id
      left join lateral (select qc.id from public.qr_credentials qc where qc.student_id=st.id and qc.credential_status='activated' and (qc.expires_at is null or qc.expires_at>now()) order by qc.issued_at desc limit 1) q on true
      where st.student_status in ('enrolled', 'loa') and p.account_status='active'), '[]'::jsonb),
    'attendance', coalesce((select jsonb_agg(jsonb_build_object('sessionId', ar.event_session_id, 'studentId', ar.student_id, 'attendanceStatus', ar.attendance_status, 'timeIn', ar.time_in, 'timeOut', ar.time_out))
      from public.attendance_records ar join public.event_sessions s on s.id=ar.event_session_id where s.event_id=e.id), '[]'::jsonb)
  ) into v_result from public.events e where e.id=v_event.id;

  insert into public.audit_logs(actor_user_id, action, target_type, target_id, metadata)
  values (v_actor, 'event.offline_prepared', 'event', v_event.id, jsonb_build_object('session_id', v_session.id, 'directory_count', jsonb_array_length(v_result->'studentDirectory')));
  return v_result;
end;
$$;


ALTER FUNCTION "public"."prepare_offline_event_package"("p_event_id" "uuid") OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."prevent_facial_profile_replacement"() RETURNS "trigger"
    LANGUAGE "plpgsql"
    SET "search_path" TO ''
    AS $$
begin
  if tg_op = 'UPDATE'
    and (new.enrollment_reference is distinct from old.enrollment_reference
      or new.enrolled_at is distinct from old.enrolled_at
      or new.consent_recorded_at is distinct from old.consent_recorded_at) then
    raise exception 'Facial enrollment is a one-time process and cannot be replaced.' using errcode = '23505';
  end if;
  return new;
end;
$$;


ALTER FUNCTION "public"."prevent_facial_profile_replacement"() OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."prevent_facial_reenrollment"() RETURNS "trigger"
    LANGUAGE "plpgsql"
    SET "search_path" TO ''
    AS $$
begin
  if new.credential_type = 'facial' and new.request_type = 're_enrollment' then
    raise exception 'Facial re-enrollment is no longer supported. Facial enrollment is a one-time process.' using errcode = '22023';
  end if;
  return new;
end;
$$;


ALTER FUNCTION "public"."prevent_facial_reenrollment"() OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."queue_emails_for_event"("p_event_id" "uuid") RETURNS "void"
    LANGUAGE "plpgsql"
    SET "search_path" TO ''
    AS $$
declare
  v_event public.events%rowtype;
begin
  select * into v_event from public.events where id = p_event_id;
  if not found then
    raise exception 'Event was not found.' using errcode = 'P0002';
  end if;

  perform private.queue_event_student_emails_for_event(
    p_event_id,
    'published',
    v_event.created_at
  );
end;
$$;


ALTER FUNCTION "public"."queue_emails_for_event"("p_event_id" "uuid") OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."recalculate_feedback_analytics"() RETURNS "trigger"
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO ''
    AS $$
declare
  _event_id uuid;
  _total_feedback integer;
  _positive integer;
  _neutral integer;
  _negative integer;
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
        select count(*) from public.event_feedback_ratings rating
        join public.event_feedback feedback on feedback.id = rating.feedback_id
        where rating.objective_id = objective.id
      )
  where objective.event_id = _event_id;
  select count(*) into _total_feedback
  from public.event_feedback where event_id = _event_id and sentiment_label is not null;
  if _total_feedback > 0 then
    select
      count(*) filter (where sentiment_label = 'positive'),
      count(*) filter (where sentiment_label = 'neutral'),
      count(*) filter (where sentiment_label = 'negative')
    into _positive, _neutral, _negative
    from public.event_feedback where event_id = _event_id;
    update public.event_summary_snapshots
    set average_sentiment_score = (
          select round(avg(sentiment_score)::numeric, 4)
          from public.event_feedback where event_id = _event_id
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


ALTER FUNCTION "public"."recalculate_feedback_analytics"() OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."reconcile_offline_event_session_end"("p_session_id" "uuid", "p_actual_end" timestamp with time zone, "p_reason" "text", "p_expected_student_ids" "uuid"[]) RETURNS "void"
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO ''
    AS $$
declare
  v_actor uuid := auth.uid();
  v_event public.events;
  v_session public.event_sessions;
  v_now timestamptz := now();
  v_requested_end timestamptz := p_actual_end;
  v_roster_count integer;
  v_unique_expected_count integer;
  v_absent_count integer;
begin
  if not private.is_active_organizer() then
    raise exception 'An active organizer account is required.' using errcode = '42501';
  end if;
  if p_session_id is null or p_actual_end is null or p_reason is null
    or length(btrim(p_reason)) < 5 or p_expected_student_ids is null then
    raise exception 'Valid offline session end details and the prepared participant list are required.' using errcode = '22023';
  end if;
  if p_actual_end > v_now then p_actual_end := v_now; end if;

  select e.* into v_event from public.events e
  join public.event_sessions es on es.event_id = e.id
  where es.id = p_session_id and e.organizer_id = private.current_organizer_id()
  for update of e;
  if not found then raise exception 'Session was not found or is outside this organizer scope.' using errcode = '42501'; end if;
  select es.* into v_session from public.event_sessions es where es.id = p_session_id and es.event_id = v_event.id for update;
  if not found then raise exception 'Session was not found or is outside this organizer scope.' using errcode = '42501'; end if;
  -- The server session is authoritative after a lost response. Once this
  -- organizer-owned session is completed, a retry must not compare a new
  -- device timestamp or rerun absence creation.
  if v_session.session_status = 'completed' then return; end if;
  if v_session.session_status <> 'ongoing' or coalesce(v_session.session_archive_status, 'active') <> 'active'
    or v_event.event_status <> 'ongoing' or v_session.actual_start is null or p_actual_end <= v_session.actual_start then
    raise exception 'Only the matching active offline session can be ended.' using errcode = '22023';
  end if;

  select count(*)::integer into v_unique_expected_count from (select distinct expected.student_id from unnest(p_expected_student_ids) as expected(student_id)) expected;
  if v_unique_expected_count <> cardinality(p_expected_student_ids) then raise exception 'The prepared participant list contains duplicate identities.' using errcode = '22023'; end if;
  select count(*)::integer into v_roster_count from public.event_participants ep where ep.event_id = v_event.id and ep.participant_status <> 'removed';
  if v_roster_count <> cardinality(p_expected_student_ids) or exists (
    select 1 from public.event_participants ep where ep.event_id = v_event.id and ep.participant_status <> 'removed' and not (ep.student_id = any(p_expected_student_ids))
  ) then raise exception 'The event participant list changed after offline preparation; review before finalizing absences.' using errcode = '22023'; end if;
  if exists (
    select 1 from public.attendance_records ar where ar.event_session_id = p_session_id
      and greatest(coalesce(ar.time_in, '-infinity'::timestamptz), coalesce(ar.time_out, '-infinity'::timestamptz)) > p_actual_end
  ) then raise exception 'An attendance record is later than the saved offline session end.' using errcode = '22023'; end if;

  insert into public.attendance_records(event_session_id, student_id, attendance_status, verification_method, recorded_at, recorded_by, remarks)
  select p_session_id, ep.student_id, 'absent', 'manual', p_actual_end, v_actor, 'Automatically marked absent when session ended offline: ' || btrim(p_reason)
  from public.event_participants ep where ep.event_id = v_event.id and ep.participant_status <> 'removed' and ep.student_id = any(p_expected_student_ids)
    and not exists (select 1 from public.attendance_records ar where ar.event_session_id = p_session_id and ar.student_id = ep.student_id)
  on conflict (event_session_id, student_id) where event_session_id is not null do nothing;
  get diagnostics v_absent_count = row_count;
  update public.event_sessions set session_status = 'completed', actual_end = p_actual_end,
    attendance_window_end_at = p_actual_end, ended_reason = btrim(p_reason), updated_at = v_now where id = p_session_id;
  update public.events set event_status = 'completed', updated_at = v_now where id = v_event.id;
  insert into public.audit_logs(actor_user_id, action, target_type, target_id, metadata)
  values (v_actor, 'attendance_session.ended_offline', 'event_session', p_session_id,
    jsonb_build_object('event_id', v_event.id, 'reason', btrim(p_reason), 'actual_end', p_actual_end,
      'requested_end', v_requested_end, 'clock_clamped', v_requested_end <> p_actual_end, 'automatically_absent', v_absent_count));
end;
$$;


ALTER FUNCTION "public"."reconcile_offline_event_session_end"("p_session_id" "uuid", "p_actual_end" timestamp with time zone, "p_reason" "text", "p_expected_student_ids" "uuid"[]) OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."reconcile_offline_event_session_start"("p_session_id" "uuid", "p_actual_start" timestamp with time zone) RETURNS "void"
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO ''
    AS $$
declare
  v_actor uuid := auth.uid();
  v_event public.events;
  v_session public.event_sessions;
  v_now timestamptz := now();
  v_late_cutoff_minutes integer := 15;
  v_prepared_start timestamptz;
  v_requested_start timestamptz := p_actual_start;
begin
  if not private.is_active_organizer() then
    raise exception 'An active organizer account is required.' using errcode = '42501';
  end if;
  if p_session_id is null or p_actual_start is null then
    raise exception 'A valid offline session start time is required.' using errcode = '22023';
  end if;
  if p_actual_start > v_now then p_actual_start := v_now; end if;

  select e.* into v_event
  from public.events e
  join public.event_sessions es on es.event_id = e.id
  where es.id = p_session_id and e.organizer_id = private.current_organizer_id()
  for update of e;
  if not found then
    raise exception 'Session was not found or is outside this organizer scope.' using errcode = '42501';
  end if;

  select es.* into v_session from public.event_sessions es
  where es.id = p_session_id and es.event_id = v_event.id for update;
  if not found or coalesce(v_session.session_archive_status, 'active') <> 'active' then
    raise exception 'The prepared event session is no longer active.' using errcode = '22023';
  end if;
  if v_session.session_status = 'ongoing' then return; end if;
  if v_session.session_status <> 'scheduled'
    or v_event.event_status not in ('scheduled', 'ongoing')
    or v_event.approval_status <> 'approved'
    or to_char(v_event.starts_at at time zone 'Asia/Manila', 'YYYY-MM-DD') <> to_char(p_actual_start at time zone 'Asia/Manila', 'YYYY-MM-DD')
    or to_char(v_session.scheduled_start at time zone 'Asia/Manila', 'YYYY-MM-DD') <> to_char(p_actual_start at time zone 'Asia/Manila', 'YYYY-MM-DD') then
    raise exception 'The event is no longer eligible for the saved offline start.' using errcode = '22023';
  end if;

  v_prepared_start := coalesce(v_session.attendance_window_start_at, v_session.scheduled_start);
  if v_prepared_start is not null and v_session.late_cutoff_at is not null then
    v_late_cutoff_minutes := greatest(0, least(240, round(extract(epoch from (v_session.late_cutoff_at - v_prepared_start)) / 60.0)::integer));
  end if;
  update public.event_sessions set session_status = 'ongoing', actual_start = p_actual_start,
    attendance_window_start_at = p_actual_start, attendance_window_end_at = null,
    late_cutoff_at = p_actual_start + make_interval(mins => v_late_cutoff_minutes), updated_at = v_now
  where id = p_session_id;
  update public.events set event_status = 'ongoing', updated_at = v_now where id = v_event.id;
  insert into public.audit_logs(actor_user_id, action, target_type, target_id, metadata)
  values (v_actor, 'attendance_session.started_offline', 'event_session', p_session_id,
    jsonb_build_object('event_id', v_event.id, 'actual_start', p_actual_start,
      'requested_start', v_requested_start, 'clock_clamped', v_requested_start <> p_actual_start,
      'late_cutoff_minutes', v_late_cutoff_minutes));
end;
$$;


ALTER FUNCTION "public"."reconcile_offline_event_session_start"("p_session_id" "uuid", "p_actual_start" timestamp with time zone) OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."record_approved_event_walkin"("p_local_scan_uuid" "uuid", "p_event_id" "uuid", "p_session_id" "uuid", "p_student_number" "text", "p_identification_method" "text", "p_time_in" timestamp with time zone, "p_time_out" timestamp with time zone DEFAULT NULL::timestamp with time zone, "p_checkout_identification_method" "text" DEFAULT NULL::"text") RETURNS "jsonb"
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO ''
    AS $_$
declare
  v_actor uuid := auth.uid(); v_event public.events; v_session public.event_sessions;
  v_student public.students; v_matches integer; v_record public.attendance_records; v_display_name text;
  v_participant_status text; v_origin text := 'walk_in'; v_disposition text := 'confirmed_walk_in';
  v_checkout text := coalesce(p_checkout_identification_method, p_identification_method);
begin
  if v_actor is null or not private.is_active_organizer() then
    raise exception 'An active organizer account is required.' using errcode = '42501';
  end if;
  if p_local_scan_uuid is null or p_student_number !~ '^[0-9]{2}-[0-9]{5}$'
     or p_identification_method not in ('qr','manual') or p_time_in is null
     or (p_time_out is not null and p_time_out < p_time_in + interval '1 minute')
     or v_checkout not in ('qr','manual') then
    return jsonb_build_object('disposition','discarded_permanent_conflict','reasonCode','invalid_walkin');
  end if;
  select e.* into v_event from public.events e where e.id=p_event_id and e.organizer_id=private.current_organizer_id() for update;
  if not found then raise exception 'An owned event is required.' using errcode = '42501'; end if;
  select s.* into v_session from public.event_sessions s where s.id=p_session_id and s.event_id=v_event.id and s.session_status in ('ongoing','completed');
  if not found or (v_session.actual_end is not null and (p_time_in > v_session.actual_end or p_time_out > v_session.actual_end)) then
    insert into public.audit_logs(actor_user_id,action,target_type,target_id,metadata) values
      (v_actor,'attendance.offline_walkin_discarded','event',v_event.id,jsonb_build_object('reason_code','session_not_available','student_number',p_student_number,'session_id',p_session_id,'local_scan_uuid',p_local_scan_uuid));
    return jsonb_build_object('disposition','discarded_permanent_conflict','reasonCode','session_not_available');
  end if;
  select count(*) into v_matches from public.students s join public.profiles p on p.id=s.profile_id
    where upper(btrim(s.student_id))=upper(btrim(p_student_number)) and s.student_status='enrolled' and p.role='student' and p.account_status='active';
  if v_matches <> 1 then
    insert into public.audit_logs(actor_user_id,action,target_type,target_id,metadata) values
      (v_actor,'attendance.offline_walkin_discarded','event',v_event.id,jsonb_build_object('reason_code','student_not_found','student_number',p_student_number,'session_id',p_session_id,'local_scan_uuid',p_local_scan_uuid));
    return jsonb_build_object('disposition','discarded_permanent_conflict','reasonCode','student_not_found');
  end if;
  select s.* into v_student from public.students s join public.profiles p on p.id=s.profile_id
    where upper(btrim(s.student_id))=upper(btrim(p_student_number)) and s.student_status='enrolled' and p.role='student' and p.account_status='active' order by s.id limit 1;
  select concat_ws(' ', p.first_name, p.middle_name, p.last_name) into v_display_name from public.profiles p where p.id=v_student.profile_id;
  select participant_status into v_participant_status from public.event_participants where event_id=v_event.id and student_id=v_student.id;
  if v_participant_status='removed' then
    insert into public.audit_logs(actor_user_id,action,target_type,target_id,metadata) values
      (v_actor,'attendance.offline_walkin_discarded','event',v_event.id,jsonb_build_object('reason_code','student_removed','student_id',v_student.id,'session_id',p_session_id,'local_scan_uuid',p_local_scan_uuid));
    return jsonb_build_object('disposition','discarded_permanent_conflict','reasonCode','student_removed');
  end if;
  if v_participant_status in ('invited','confirmed') then
    v_origin := 'invited';
    v_disposition := 'confirmed_invited';
  else
    insert into public.event_participants(event_id,student_id,participant_status) values(v_event.id,v_student.id,'walk_in') on conflict(event_id,student_id) do nothing;
  end if;
  select * into v_record from public.attendance_records where event_session_id=p_session_id and student_id=v_student.id for update;
  if found and v_record.local_attendance_uuid is distinct from p_local_scan_uuid then
    insert into public.audit_logs(actor_user_id,action,target_type,target_id,metadata) values
      (v_actor,'attendance.offline_walkin_discarded','attendance_record',v_record.id,jsonb_build_object('reason_code','duplicate_student','student_id',v_student.id,'session_id',p_session_id,'local_scan_uuid',p_local_scan_uuid));
    return jsonb_build_object('disposition','discarded_permanent_conflict','reasonCode','duplicate_student');
  end if;
  insert into public.attendance_records(event_session_id,student_id,attendance_status,attendance_origin,verification_method,checkout_verification_method,time_in,time_out,recorded_at,recorded_by,local_attendance_uuid)
  values(p_session_id,v_student.id,case when v_session.late_cutoff_at is not null and p_time_in>v_session.late_cutoff_at then 'late' else 'present' end,v_origin,p_identification_method,case when p_time_out is null then null else v_checkout end,p_time_in,p_time_out,p_time_in,v_actor,p_local_scan_uuid)
  on conflict(event_session_id,student_id) where event_session_id is not null do update set
    time_out=coalesce(excluded.time_out,public.attendance_records.time_out),
    checkout_verification_method=coalesce(excluded.checkout_verification_method,public.attendance_records.checkout_verification_method),
    attendance_origin=case when public.attendance_records.attendance_origin='walk_in' then 'walk_in' else excluded.attendance_origin end,
    updated_at=now()
  returning * into v_record;
  insert into public.audit_logs(actor_user_id,action,target_type,target_id,metadata) values
    (v_actor,case when v_disposition='confirmed_invited' then 'attendance.offline_invited_reconciled' else 'attendance.walkin_admitted' end,'attendance_record',v_record.id,jsonb_build_object('event_id',v_event.id,'session_id',v_session.id,'student_id',v_student.id,'local_scan_uuid',p_local_scan_uuid));
  return jsonb_build_object('disposition',v_disposition,'attendance',to_jsonb(v_record),'student',jsonb_build_object('id',v_student.id,'studentNumber',v_student.student_id,'displayName',v_display_name));
end;
$_$;


ALTER FUNCTION "public"."record_approved_event_walkin"("p_local_scan_uuid" "uuid", "p_event_id" "uuid", "p_session_id" "uuid", "p_student_number" "text", "p_identification_method" "text", "p_time_in" timestamp with time zone, "p_time_out" timestamp with time zone, "p_checkout_identification_method" "text") OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."record_live_facial_attendance"("p_event_session_id" "uuid", "p_student_id" "uuid", "p_similarity" double precision, "p_action" "text", "p_occurred_at" timestamp with time zone DEFAULT "now"()) RETURNS "jsonb"
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO ''
    AS $$
declare
  v_actor uuid := (select auth.uid());
  v_session public.event_sessions;
  v_profile_id uuid;
  v_facial_profile_id uuid;
  v_record public.attendance_records;
  v_attempt public.verification_attempts;
  v_action text;
  v_status text;
  v_record_exists boolean := false;
begin
  if v_actor is null or not (select private.is_active_organizer()) then
    raise exception 'Only active organizers may record facial attendance.' using errcode = '42501';
  end if;
  if p_similarity is null or p_similarity < 0 or p_similarity > 1 then
    raise exception 'A valid facial similarity score is required.' using errcode = '22023';
  end if;
  if p_action not in ('check_in', 'check_out') then
    raise exception 'Facial attendance action must be check_in or check_out.' using errcode = '22023';
  end if;

  select session.* into v_session
  from public.event_sessions session
  join public.events event on event.id = session.event_id
  join public.organizers organizer on organizer.id = event.organizer_id
  where session.id = p_event_session_id
    and session.session_status = 'ongoing'
    and organizer.profile_id = v_actor
  for update of session;

  if not found then
    raise exception 'An owned active attendance session is required.' using errcode = '42501';
  end if;

  if p_occurred_at < coalesce(v_session.attendance_window_start_at, v_session.actual_start, v_session.scheduled_start)
     or (v_session.attendance_window_end_at is not null and p_occurred_at > v_session.attendance_window_end_at) then
    raise exception 'Facial identification is outside the attendance window.' using errcode = '22023';
  end if;

  if not exists (
    select 1 from public.event_participants participant
    where participant.event_id = v_session.event_id
      and participant.student_id = p_student_id
      and participant.participant_status <> 'removed'
  ) or not exists (
    select 1 from public.facial_profiles facial_profile
    where facial_profile.student_id = p_student_id
      and facial_profile.facial_status = 'activated'
  ) then
    raise exception 'Student is not eligible for facial attendance in this session.' using errcode = '42501';
  end if;

  select facial_profile.id into v_facial_profile_id
  from public.facial_profiles facial_profile
  where facial_profile.student_id = p_student_id
    and facial_profile.facial_status = 'activated';

  v_profile_id := v_actor;
  select * into v_record
  from public.attendance_records
  where event_session_id = p_event_session_id and student_id = p_student_id
  for update;
  v_record_exists := found;

  if v_record_exists and v_record.time_in is not null and (p_action = 'check_in' or v_record.time_out is not null) then
    return jsonb_build_object('action', 'already_recorded', 'record_id', v_record.id, 'attendance_status', v_record.attendance_status);
  end if;
  if p_action = 'check_out' and (not v_record_exists or v_record.time_in is null) then
    raise exception 'Student must check in before facial check-out.' using errcode = '22023';
  end if;
  if p_action = 'check_out' and p_occurred_at < v_record.time_in + interval '1 minute' then
    raise exception 'Time Out must be at least one minute after Time In.' using errcode = '22023';
  end if;

  insert into public.verification_attempts (
    event_session_id, student_id, facial_profile_id, verification_method,
    attempted_at, accepted, failure_code, message
  ) values (
    p_event_session_id, p_student_id, v_facial_profile_id, 'facial',
    p_occurred_at, true, null, 'Live face identified by DeepFace.'
  ) returning * into v_attempt;

  if p_action = 'check_out' then
    update public.attendance_records
    set time_out = p_occurred_at, checkout_verification_method = 'facial', recorded_by = v_profile_id, updated_at = now()
    where id = v_record.id
    returning * into v_record;
    v_action := 'checked_out';
  elsif v_record_exists then
    v_status := case when p_occurred_at > coalesce(v_session.late_cutoff_at, p_occurred_at) then 'late' else 'present' end;
    update public.attendance_records
    set attendance_status = v_status, verification_method = 'facial', verification_attempt_id = v_attempt.id,
        time_in = p_occurred_at, recorded_at = p_occurred_at, recorded_by = v_profile_id, updated_at = now()
    where id = v_record.id
    returning * into v_record;
    v_action := 'checked_in';
  else
    v_status := case when p_occurred_at > coalesce(v_session.late_cutoff_at, p_occurred_at) then 'late' else 'present' end;
    insert into public.attendance_records (
      event_session_id, student_id, verification_attempt_id, attendance_status,
      verification_method, time_in, recorded_at, recorded_by
    ) values (
      p_event_session_id, p_student_id, v_attempt.id, v_status,
      'facial', p_occurred_at, p_occurred_at, v_profile_id
    ) returning * into v_record;
    v_action := 'checked_in';
  end if;

  update public.facial_profiles
  set last_verified_at = p_occurred_at, updated_at = now()
  where student_id = p_student_id;

  insert into public.audit_logs (actor_user_id, action, target_type, target_id, metadata)
  values (
    v_actor, 'attendance.facial_' || v_action, 'attendance_record', v_record.id,
    jsonb_build_object('session_id', p_event_session_id, 'student_id', p_student_id, 'similarity', round(p_similarity::numeric, 4))
  );

  return jsonb_build_object(
    'action', v_action,
    'record_id', v_record.id,
    'attendance_status', v_record.attendance_status,
    'recorded_at', coalesce(v_record.time_out, v_record.time_in, v_record.recorded_at)
  );
end;
$$;


ALTER FUNCTION "public"."record_live_facial_attendance"("p_event_session_id" "uuid", "p_student_id" "uuid", "p_similarity" double precision, "p_action" "text", "p_occurred_at" timestamp with time zone) OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."attendance_records" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "event_session_id" "uuid" NOT NULL,
    "student_id" "uuid" NOT NULL,
    "verification_attempt_id" "uuid",
    "attendance_status" "text" NOT NULL,
    "verification_method" "text" NOT NULL,
    "time_in" timestamp with time zone,
    "time_out" timestamp with time zone,
    "recorded_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "recorded_by" "uuid",
    "remarks" "text",
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "updated_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "late_reason_category" "text",
    "minutes_late" smallint,
    "late_reason" "text",
    "checkout_verification_method" "text",
    "local_attendance_uuid" "uuid",
    "late_reason_option_id" "uuid",
    "finalized_at" timestamp with time zone,
    "late_reason_submitted_at" timestamp with time zone,
    "attendance_origin" "text" DEFAULT 'invited'::"text" NOT NULL,
    CONSTRAINT "attendance_records_attendance_origin_check" CHECK (("attendance_origin" = ANY (ARRAY['invited'::"text", 'walk_in'::"text"]))),
    CONSTRAINT "attendance_records_checkout_method_valid" CHECK ((("checkout_verification_method" IS NULL) OR ("checkout_verification_method" = ANY (ARRAY['qr'::"text", 'facial'::"text", 'manual'::"text"])))),
    CONSTRAINT "attendance_records_checkout_requires_time_out" CHECK ((("checkout_verification_method" IS NULL) OR ("time_out" IS NOT NULL))),
    CONSTRAINT "attendance_records_late_reason_valid" CHECK ((("late_reason_category" IS NULL) OR ("late_reason_category" = ANY (ARRAY['Traffic / Commute'::"text", 'Class or Academic Conflict'::"text", 'Personal / Health'::"text", 'Weather / Force Majeure'::"text", 'Other'::"text"])))),
    CONSTRAINT "attendance_records_method_valid" CHECK (("verification_method" = ANY (ARRAY['qr'::"text", 'facial'::"text", 'manual'::"text", 'online'::"text"]))),
    CONSTRAINT "attendance_records_minutes_late_valid" CHECK ((("minutes_late" IS NULL) OR (("minutes_late" >= 0) AND ("minutes_late" <= 1440)))),
    CONSTRAINT "attendance_records_status_valid" CHECK (("attendance_status" = ANY (ARRAY['present'::"text", 'late'::"text", 'absent'::"text"]))),
    CONSTRAINT "attendance_records_time_order_valid" CHECK ((("time_out" IS NULL) OR ("time_in" IS NULL) OR ("time_out" >= "time_in")))
);


ALTER TABLE "public"."attendance_records" OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."record_manual_event_attendance"("p_session_id" "uuid", "p_student_id" "uuid", "p_status" "text", "p_reason" "text", "p_remarks" "text" DEFAULT NULL::"text", "p_late_reason" "text" DEFAULT NULL::"text", "p_occurred_at" timestamp with time zone DEFAULT "now"()) RETURNS "public"."attendance_records"
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO ''
    AS $$
declare
  v_actor uuid := auth.uid();
  v_session public.event_sessions;
  v_record public.attendance_records;
begin
  if not private.is_active_organizer() then raise exception 'An active organizer account is required.' using errcode = '42501'; end if;
  select es.* into v_session from public.event_sessions es join public.events e on e.id = es.event_id
  where es.id = p_session_id and e.organizer_id = private.current_organizer_id() for update of es;
  if not found or v_session.session_status <> 'ongoing' then raise exception 'An owned active session is required.' using errcode = '42501'; end if;
  if not exists (select 1 from public.event_participants ep where ep.event_id = v_session.event_id and ep.student_id = p_student_id and ep.participant_status <> 'removed') then
    raise exception 'Student is not assigned to this event.' using errcode = '42501';
  end if;
  select * into v_record from public.attendance_records where event_session_id = p_session_id and student_id = p_student_id for update;
  if found and v_record.time_in is not null and v_record.time_out is not null then
    raise exception 'Student has already checked in and out.' using errcode = '23505';
  elsif found and v_record.time_in is not null then
    update public.attendance_records set time_out = p_occurred_at, checkout_verification_method = 'manual',
      recorded_by = v_actor, updated_at = now()
    where id = v_record.id returning * into v_record;
  else
    if p_status not in ('present', 'late') then raise exception 'Manual attendance must be present or late.' using errcode = '22023'; end if;
    if p_reason is null or length(btrim(p_reason)) < 5 then raise exception 'A manual attendance reason of at least 5 characters is required.' using errcode = '22023'; end if;
    if found then
      update public.attendance_records set attendance_status = 'absent', verification_method = 'manual',
        time_in = p_occurred_at, recorded_at = p_occurred_at, recorded_by = v_actor,
        remarks = concat_ws(': ', 'Manual override - ' || btrim(p_reason), nullif(btrim(coalesce(p_remarks, '')), '')),
        finalized_at = null, updated_at = now()
      where id = v_record.id returning * into v_record;
    else
      insert into public.attendance_records(event_session_id, student_id, attendance_status, verification_method, time_in, recorded_at, recorded_by, remarks, finalized_at)
      values (p_session_id, p_student_id, 'absent', 'manual', p_occurred_at, p_occurred_at, v_actor,
        concat_ws(': ', 'Manual entry - ' || btrim(p_reason), nullif(btrim(coalesce(p_remarks, '')), '')), null)
      returning * into v_record;
    end if;
  end if;
  insert into public.audit_logs(actor_user_id, action, target_type, target_id, metadata)
  values (v_actor, 'attendance.manual_recorded', 'attendance_record', v_record.id,
    jsonb_build_object('session_id', p_session_id, 'student_id', p_student_id, 'status', v_record.attendance_status, 'reason', btrim(coalesce(p_reason, ''))));
  return v_record;
end;
$$;


ALTER FUNCTION "public"."record_manual_event_attendance"("p_session_id" "uuid", "p_student_id" "uuid", "p_status" "text", "p_reason" "text", "p_remarks" "text", "p_late_reason" "text", "p_occurred_at" timestamp with time zone) OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."reschedule_organizer_event"("p_event_id" "uuid", "p_venue" "text", "p_starts_at" timestamp with time zone, "p_ends_at" timestamp with time zone, "p_reason" "text") RETURNS "public"."events"
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO ''
    AS $$
declare
  v_actor uuid := auth.uid();
  v_event public.events;
  v_old_start timestamptz;
  v_old_end timestamptz;
  v_old_venue text;
  v_student_ids uuid[];
begin
  if not private.is_active_organizer() then
    raise exception 'An active organizer account is required.' using errcode = '42501';
  end if;
  if p_reason is null or length(btrim(p_reason)) < 5 then
    raise exception 'A rescheduling reason of at least 5 characters is required.' using errcode = '22023';
  end if;
  if p_starts_at <= now() or p_ends_at <= p_starts_at then
    raise exception 'The new schedule must be in the future and end after it starts.' using errcode = '22023';
  end if;

  perform private.lock_event_publish_guard();
  select * into v_event from public.events where id = p_event_id for update;
  if not found or v_event.organizer_id <> private.current_organizer_id() then
    raise exception 'Event was not found or is not owned by this organizer.' using errcode = '42501';
  end if;
  if v_event.event_status = 'completed' then
    raise exception 'Completed events cannot be rescheduled.' using errcode = '22023';
  end if;

  select coalesce(array_agg(ep.student_id), array[]::uuid[]) into v_student_ids
  from public.event_participants ep
  where ep.event_id = p_event_id and ep.participant_status <> 'removed';
  perform private.assert_event_participant_schedule_available(p_event_id, p_starts_at, p_ends_at, v_student_ids);

  v_old_start := v_event.starts_at; v_old_end := v_event.ends_at; v_old_venue := v_event.venue;
  update public.event_sessions
  set session_archive_status = 'archived', rescheduled_at = now(), rescheduled_reason = btrim(p_reason), updated_at = now()
  where event_id = p_event_id and session_archive_status = 'active';
  update public.events
  set venue = btrim(p_venue), starts_at = p_starts_at, ends_at = p_ends_at,
      event_status = 'scheduled', cancellation_reason = null, cancelled_by = null, cancelled_at = null,
      last_rescheduled_at = now(), reschedule_count = coalesce(reschedule_count, 0) + 1, updated_at = now()
  where id = p_event_id returning * into v_event;
  insert into public.audit_logs(actor_user_id, action, target_type, target_id, metadata)
  values (v_actor, 'event.rescheduled', 'event', p_event_id,
    jsonb_build_object('reason', btrim(p_reason), 'old_start', v_old_start, 'new_start', p_starts_at, 'old_end', v_old_end, 'new_end', p_ends_at, 'old_venue', v_old_venue, 'new_venue', p_venue));
  return v_event;
end;
$$;


ALTER FUNCTION "public"."reschedule_organizer_event"("p_event_id" "uuid", "p_venue" "text", "p_starts_at" timestamp with time zone, "p_ends_at" timestamp with time zone, "p_reason" "text") OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."attendance_requests" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "student_id" "uuid" NOT NULL,
    "attendance_record_id" "uuid" NOT NULL,
    "requested_status" "text" NOT NULL,
    "explanation" "text" NOT NULL,
    "request_status" "text" DEFAULT 'pending'::"text" NOT NULL,
    "reviewed_by" "uuid",
    "reviewed_at" timestamp with time zone,
    "review_reason" "text",
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "updated_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    CONSTRAINT "attendance_requests_explanation_not_blank" CHECK (("btrim"("explanation") <> ''::"text")),
    CONSTRAINT "attendance_requests_request_status_valid" CHECK (("request_status" = ANY (ARRAY['pending'::"text", 'approved'::"text", 'rejected'::"text"]))),
    CONSTRAINT "attendance_requests_review_consistent" CHECK (((("request_status" = 'pending'::"text") AND ("reviewed_at" IS NULL)) OR (("request_status" = ANY (ARRAY['approved'::"text", 'rejected'::"text"])) AND ("reviewed_at" IS NOT NULL) AND ("reviewed_by" IS NOT NULL)))),
    CONSTRAINT "attendance_requests_status_valid" CHECK (("requested_status" = ANY (ARRAY['present'::"text", 'late'::"text", 'absent'::"text"])))
);


ALTER TABLE "public"."attendance_requests" OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."review_attendance_request"("p_request_id" "uuid", "p_status" "text", "p_reason" "text" DEFAULT NULL::"text") RETURNS "public"."attendance_requests"
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO ''
    AS $$
declare
  v_actor uuid := auth.uid();
  v_request public.attendance_requests;
begin
  if not private.is_active_organizer() then
    raise exception 'An active organizer account is required.' using errcode = '42501';
  end if;
  if p_status not in ('approved', 'rejected') then
    raise exception 'Invalid review status.' using errcode = '22023';
  end if;

  select * into v_request
  from public.attendance_requests
  where id = p_request_id
  for update;

  if not found then
    raise exception 'Attendance request was not found.' using errcode = 'P0002';
  end if;
  if v_request.request_status <> 'pending' then
    raise exception 'Attendance request has already been reviewed.' using errcode = '23505';
  end if;
  if not exists (
    select 1
    from public.attendance_records ar
    join public.event_sessions es on es.id = ar.event_session_id
    join public.events e on e.id = es.event_id
    join public.organizers o on o.id = e.organizer_id
    where ar.id = v_request.attendance_record_id and o.profile_id = v_actor
  ) then
    raise exception 'Organizer cannot review this attendance request.' using errcode = '42501';
  end if;

  if p_status = 'approved' then
    update public.attendance_records
    set attendance_status = v_request.requested_status,
        remarks = coalesce(nullif(btrim(p_reason), ''), 'Approved attendance correction'),
        updated_at = now()
    where id = v_request.attendance_record_id;
  end if;

  update public.attendance_requests
  set request_status = p_status,
      review_reason = coalesce(nullif(btrim(p_reason), ''),
        case when p_status = 'approved' then 'Approved by organizer' else 'Rejected by organizer' end),
      reviewed_by = v_actor,
      reviewed_at = now(),
      updated_at = now()
  where id = p_request_id
  returning * into v_request;

  insert into public.audit_logs (actor_user_id, action, target_type, target_id, metadata)
  values (v_actor, 'attendance_request.' || p_status, 'attendance_request', p_request_id,
    jsonb_build_object('attendance_record_id', v_request.attendance_record_id));

  return v_request;
end;
$$;


ALTER FUNCTION "public"."review_attendance_request"("p_request_id" "uuid", "p_status" "text", "p_reason" "text") OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."credential_requests" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "student_id" "uuid" NOT NULL,
    "credential_type" "text" NOT NULL,
    "request_type" "text" NOT NULL,
    "reason" "text" NOT NULL,
    "request_status" "text" DEFAULT 'pending'::"text" NOT NULL,
    "reviewed_by" "uuid",
    "reviewed_at" timestamp with time zone,
    "review_remarks" "text",
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "updated_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    CONSTRAINT "credential_requests_credential_type_valid" CHECK (("credential_type" = ANY (ARRAY['qr'::"text", 'facial'::"text"]))),
    CONSTRAINT "credential_requests_reason_not_blank" CHECK (("btrim"("reason") <> ''::"text")),
    CONSTRAINT "credential_requests_review_consistent" CHECK (((("request_status" = 'pending'::"text") AND ("reviewed_at" IS NULL)) OR (("request_status" <> 'pending'::"text") AND ("reviewed_at" IS NOT NULL) AND ("reviewed_by" IS NOT NULL)))),
    CONSTRAINT "credential_requests_status_valid" CHECK (("request_status" = ANY (ARRAY['pending'::"text", 'approved'::"text", 'rejected'::"text", 'resolved'::"text"])))
);


ALTER TABLE "public"."credential_requests" OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."review_credential_request"("p_request_id" "uuid", "p_status" "text", "p_remarks" "text" DEFAULT NULL::"text") RETURNS "public"."credential_requests"
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO ''
    AS $$
declare
  v_actor uuid := auth.uid();
  v_request public.credential_requests;
  v_now timestamptz := now();
begin
  if not private.is_active_organizer() then
    raise exception 'An active organizer account is required.' using errcode = '42501';
  end if;
  if p_status not in ('approved', 'rejected') then
    raise exception 'Invalid review status.' using errcode = '22023';
  end if;

  select * into v_request
  from public.credential_requests
  where id = p_request_id
  for update;

  if not found then
    raise exception 'Credential request was not found.' using errcode = 'P0002';
  end if;
  if v_request.request_status <> 'pending' then
    raise exception 'Credential request has already been reviewed.' using errcode = '23505';
  end if;

  if p_status = 'approved' and v_request.credential_type = 'qr' then
    update public.qr_credentials
    set credential_status = 'inactive', revoked_at = v_now, updated_at = v_now
    where student_id = v_request.student_id and credential_status = 'activated';

    insert into public.qr_credentials (
      student_id, token_hash, credential_status, issued_at, expires_at
    ) values (
      v_request.student_id,
      encode(extensions.digest(gen_random_uuid()::text || v_request.student_id::text || clock_timestamp()::text, 'sha256'), 'hex'),
      'activated', v_now, v_now + interval '1 year'
    );
  end if;

  update public.credential_requests
  set request_status = p_status,
      review_remarks = coalesce(nullif(btrim(p_remarks), ''),
        case when p_status = 'approved' then 'Approved by organizer' else 'Rejected by organizer' end),
      reviewed_by = v_actor,
      reviewed_at = v_now,
      updated_at = v_now
  where id = p_request_id
  returning * into v_request;

  insert into public.audit_logs (actor_user_id, action, target_type, target_id, metadata)
  values (v_actor, 'credential_request.' || p_status, 'credential_request', p_request_id,
    jsonb_build_object('credential_type', v_request.credential_type, 'request_type', v_request.request_type));

  return v_request;
end;
$$;


ALTER FUNCTION "public"."review_credential_request"("p_request_id" "uuid", "p_status" "text", "p_remarks" "text") OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."rls_auto_enable"() RETURNS "event_trigger"
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO 'pg_catalog'
    AS $$
DECLARE
  cmd record;
BEGIN
  FOR cmd IN
    SELECT *
    FROM pg_event_trigger_ddl_commands()
    WHERE command_tag IN ('CREATE TABLE', 'CREATE TABLE AS', 'SELECT INTO')
      AND object_type IN ('table','partitioned table')
  LOOP
     IF cmd.schema_name IS NOT NULL AND cmd.schema_name IN ('public') AND cmd.schema_name NOT IN ('pg_catalog','information_schema') AND cmd.schema_name NOT LIKE 'pg_toast%' AND cmd.schema_name NOT LIKE 'pg_temp%' THEN
      BEGIN
        EXECUTE format('alter table if exists %s enable row level security', cmd.object_identity);
        RAISE LOG 'rls_auto_enable: enabled RLS on %', cmd.object_identity;
      EXCEPTION
        WHEN OTHERS THEN
          RAISE LOG 'rls_auto_enable: failed to enable RLS on %', cmd.object_identity;
      END;
     ELSE
        RAISE LOG 'rls_auto_enable: skip % (either system schema or not in enforced list: %.)', cmd.object_identity, cmd.schema_name;
     END IF;
  END LOOP;
END;
$$;


ALTER FUNCTION "public"."rls_auto_enable"() OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."set_student_credential_status"("p_student_id" "uuid", "p_credential_type" "text", "p_status" "text") RETURNS "void"
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO ''
    AS $$
declare
  v_actor uuid := auth.uid();
begin
  if not private.can_manage_student_credentials(p_student_id) then
    raise exception 'You can only manage credentials for an authorized student.' using errcode = '42501';
  end if;
  if p_credential_type is null
    or p_credential_type not in ('qr', 'facial')
    or p_status is null
    or p_status not in ('activated', 'inactive', 'blocked') then
    raise exception 'Invalid credential status operation.' using errcode = '22023';
  end if;

  if p_credential_type = 'qr' then
    update public.qr_credentials
    set credential_status = p_status,
        revoked_at = case when p_status = 'activated' then null else now() end,
        updated_at = now()
    where student_id = p_student_id
      and (
        p_status <> 'activated'
        or id = (
          select q.id
          from public.qr_credentials q
          where q.student_id = p_student_id
          order by q.issued_at desc nulls last, q.created_at desc
          limit 1
        )
      );
  else
    update public.facial_profiles
    set facial_status = p_status,
        updated_at = now()
    where student_id = p_student_id;
  end if;

  if not found then
    raise exception 'Credential was not found.' using errcode = 'P0002';
  end if;

  insert into public.audit_logs (actor_user_id, action, target_type, target_id, metadata)
  values (
    v_actor,
    'credential.status_changed',
    p_credential_type || '_credential',
    p_student_id,
    jsonb_build_object('status', p_status)
  );
end;
$$;


ALTER FUNCTION "public"."set_student_credential_status"("p_student_id" "uuid", "p_credential_type" "text", "p_status" "text") OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."start_event_attendance_session"("p_event_id" "uuid", "p_venue" "text", "p_scheduled_start" timestamp with time zone, "p_scheduled_end" timestamp with time zone, "p_mode" "text", "p_late_cutoff_minutes" integer DEFAULT 15) RETURNS "public"."event_sessions"
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO ''
    AS $$
declare
  v_actor uuid := auth.uid();
  v_event public.events;
  v_session public.event_sessions;
  v_now timestamptz := now();
  v_today_manila text := to_char(v_now at time zone 'Asia/Manila', 'YYYY-MM-DD');
begin
  if not private.is_active_organizer() then
    raise exception 'An active organizer account is required.' using errcode = '42501';
  end if;
  if p_scheduled_start is null
    or p_scheduled_end is null
    or p_mode not in ('f2f', 'online')
    or p_scheduled_end <= p_scheduled_start
    or p_late_cutoff_minutes not between 0 and 240 then
    raise exception 'Invalid attendance session details.' using errcode = '22023';
  end if;

  select * into v_event
  from public.events
  where id = p_event_id
  for update;

  if not found
    or v_event.organizer_id <> private.current_organizer_id()
    or v_event.event_status in ('completed', 'cancelled') then
    raise exception 'Only an owned active event can start attendance.' using errcode = '42501';
  end if;

  select * into v_session
  from public.event_sessions
  where event_id = p_event_id
    and session_status = 'ongoing'
    and coalesce(session_archive_status, 'active') = 'active'
  limit 1
  for update;
  if found then return v_session; end if;

  if to_char(v_event.starts_at at time zone 'Asia/Manila', 'YYYY-MM-DD') <> v_today_manila
    or to_char(p_scheduled_start at time zone 'Asia/Manila', 'YYYY-MM-DD') <> v_today_manila then
    raise exception 'Events can only be started on their scheduled Manila date. Reschedule the event to today first.' using errcode = '22023';
  end if;

  select * into v_session
  from public.event_sessions
  where event_id = p_event_id
    and session_status = 'scheduled'
    and coalesce(session_archive_status, 'active') = 'active'
    and to_char(scheduled_start at time zone 'Asia/Manila', 'YYYY-MM-DD') = v_today_manila
  order by scheduled_start desc
  limit 1
  for update;

  if found then
    update public.event_sessions
    set venue = btrim(p_venue),
        mode = p_mode,
        session_status = 'ongoing',
        actual_start = v_now,
        attendance_window_start_at = v_now,
        attendance_window_end_at = null,
        late_cutoff_at = v_now + make_interval(mins => p_late_cutoff_minutes),
        updated_at = v_now
    where id = v_session.id
    returning * into v_session;
  else
    insert into public.event_sessions (
      event_id, created_by, session_name, venue, mode, session_status,
      scheduled_start, scheduled_end, actual_start, attendance_window_start_at,
      attendance_window_end_at, late_cutoff_at, session_archive_status
    ) values (
      p_event_id, v_actor,
      to_char(p_scheduled_start at time zone 'Asia/Manila', 'YYYY-MM-DD') || ' attendance',
      btrim(p_venue), p_mode, 'ongoing', p_scheduled_start, p_scheduled_end,
      v_now, v_now, null, v_now + make_interval(mins => p_late_cutoff_minutes), 'active'
    ) returning * into v_session;
  end if;

  update public.events set event_status = 'ongoing', updated_at = v_now where id = p_event_id;
  insert into public.audit_logs(actor_user_id, action, target_type, target_id, metadata)
  values (v_actor, 'attendance_session.started', 'event_session', v_session.id,
    jsonb_build_object('event_id', p_event_id, 'late_cutoff_minutes', p_late_cutoff_minutes));
  return v_session;
end;
$$;


ALTER FUNCTION "public"."start_event_attendance_session"("p_event_id" "uuid", "p_venue" "text", "p_scheduled_start" timestamp with time zone, "p_scheduled_end" timestamp with time zone, "p_mode" "text", "p_late_cutoff_minutes" integer) OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."store_facial_descriptor"("p_face_descriptor" "jsonb") RETURNS "public"."facial_profiles"
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO ''
    AS $$
declare
  v_student_id uuid;
  v_profile public.facial_profiles;
begin
  if p_face_descriptor is null
    or jsonb_typeof(p_face_descriptor) <> 'array'
    or jsonb_array_length(p_face_descriptor) < 32
    or jsonb_array_length(p_face_descriptor) > 4096 then
    raise exception 'A valid face descriptor is required.' using errcode = '22023';
  end if;

  select id into v_student_id
  from public.students
  where profile_id = auth.uid() and student_status = 'enrolled';

  if v_student_id is null then
    raise exception 'An active student account is required.' using errcode = '42501';
  end if;

  update public.facial_profiles
  set face_descriptor = p_face_descriptor,
      descriptor_model = 'human-hse-faceres',
      descriptor_updated_at = now(),
      updated_at = now()
  where student_id = v_student_id and facial_status = 'activated'
  returning * into v_profile;

  if not found then
    raise exception 'An active facial profile is required.' using errcode = 'P0002';
  end if;

  insert into public.audit_logs (actor_user_id, action, target_type, target_id, metadata)
  values (auth.uid(), 'facial_descriptor.stored', 'facial_profile', v_profile.id,
    jsonb_build_object('model', 'human-hse-faceres', 'dimensions', jsonb_array_length(p_face_descriptor)));

  return v_profile;
end;
$$;


ALTER FUNCTION "public"."store_facial_descriptor"("p_face_descriptor" "jsonb") OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."store_student_face_embedding"("p_pose" "text", "p_embedding" "jsonb", "p_model_name" "text", "p_detector_backend" "text") RETURNS "jsonb"
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO ''
    AS $$
declare
  v_student public.students;
  v_complete boolean;
begin
  select * into v_student
  from public.students
  where profile_id = (select auth.uid()) and student_status = 'enrolled'
  for update;
  if not found then raise exception 'An active student account is required.' using errcode = '42501'; end if;
  if p_pose not in ('front', 'left', 'right') then raise exception 'INVALID_POSE' using errcode = '22023'; end if;
  if p_embedding is null or jsonb_typeof(p_embedding) <> 'array' or jsonb_array_length(p_embedding) <> 512 then
    raise exception 'A valid ArcFace embedding is required.' using errcode = '22023';
  end if;
  if p_model_name <> 'ArcFace' or p_detector_backend <> 'retinaface' then
    raise exception 'PLPass requires the ArcFace and RetinaFace enrollment configuration.' using errcode = '22023';
  end if;
  if v_student.initial_facial_enrollment_completed_at is not null then
    raise exception 'ALREADY_ENROLLED' using errcode = '42501';
  end if;

  insert into public.student_face_embeddings (student_id, pose, embedding, model_name, detector_backend)
  values (v_student.id, p_pose, p_embedding, p_model_name, p_detector_backend)
  on conflict (student_id, pose) do update
  set embedding = excluded.embedding, model_name = excluded.model_name, detector_backend = excluded.detector_backend, updated_at = now();

  select count(*) = 3 into v_complete from public.student_face_embeddings where student_id = v_student.id;
  if v_complete then
    insert into public.facial_profiles (student_id, enrollment_reference, facial_status, enrolled_at, consent_recorded_at, updated_at)
    values (v_student.id, 'embedding:' || v_student.id::text, 'activated', now(), now(), now())
    on conflict (student_id) do update set facial_status = 'activated', enrolled_at = excluded.enrolled_at, updated_at = now();
    update public.students set initial_facial_enrollment_completed_at = now(), updated_at = now() where id = v_student.id;
  end if;
  return jsonb_build_object('complete', v_complete, 'completed_poses', coalesce((select jsonb_agg(pose order by pose) from public.student_face_embeddings where student_id = v_student.id), '[]'::jsonb));
end;
$$;


ALTER FUNCTION "public"."store_student_face_embedding"("p_pose" "text", "p_embedding" "jsonb", "p_model_name" "text", "p_detector_backend" "text") OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."submit_event_late_reason"("p_event_session_id" "uuid", "p_late_reason_option_id" "uuid", "p_late_reason" "text" DEFAULT NULL::"text") RETURNS "public"."attendance_records"
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO ''
    AS $$
declare
  v_student_id uuid := private.current_student_id();
  v_session public.event_sessions;
  v_option public.attendance_late_reason_options;
  v_record public.attendance_records;
  v_now timestamptz := now();
begin
  if v_student_id is null then raise exception 'Authenticated student profile is required.' using errcode = '42501'; end if;

  select * into v_session from public.event_sessions
  where id = p_event_session_id
    and session_status in ('scheduled', 'ongoing', 'completed')
  for update;
  if not found or v_session.late_cutoff_at is null then
    raise exception 'The event session does not accept late reasons.' using errcode = '22023';
  end if;
  if v_session.session_status = 'completed' and (v_session.actual_end is null or v_now > v_session.actual_end + interval '24 hours') then
    raise exception 'The late-reason deadline has passed.' using errcode = '22023';
  end if;
  if not exists (select 1 from public.event_participants ep where ep.event_id = v_session.event_id
      and ep.student_id = v_student_id and ep.participant_status <> 'removed') then
    raise exception 'Student is not assigned to this event.' using errcode = '42501';
  end if;
  select * into v_option from public.attendance_late_reason_options where id = p_late_reason_option_id and is_active;
  if not found then raise exception 'Invalid or inactive late reason option.' using errcode = '22023'; end if;
  if v_option.code = 'other' and nullif(btrim(coalesce(p_late_reason, '')), '') is null then
    raise exception 'A custom late reason is required for Other.' using errcode = '22023';
  end if;
  select * into v_record from public.attendance_records
  where event_session_id = p_event_session_id and student_id = v_student_id for update;
  if not found or v_record.time_in is null or v_record.time_out is null then
    raise exception 'Complete Time In and Time Out before submitting a late reason.' using errcode = '22023';
  end if;
  if v_record.time_in <= v_session.late_cutoff_at then
    raise exception 'A late reason is only required when Time In is after the late cutoff.' using errcode = '22023';
  end if;
  if v_now <= v_record.time_out then
    raise exception 'Submit your late reason after Time Out.' using errcode = '22023';
  end if;
  if exists (select 1 from public.event_feedback where attendance_record_id = v_record.id)
     or exists (select 1 from public.event_feedback_tasks where attendance_record_id = v_record.id and task_status = 'completed') then
    raise exception 'The late reason must be submitted before event feedback.' using errcode = '22023';
  end if;
  if v_record.late_reason_option_id is not null and v_record.late_reason_submitted_at > v_record.time_out then
    raise exception 'A late reason has already been submitted for this attendance record.' using errcode = '22023';
  end if;
  if exists (select 1 from public.event_feedback_tasks where attendance_record_id = v_record.id and (task_status <> 'pending' or due_at <= v_now)) then
    raise exception 'The feedback deadline has passed.' using errcode = '22023';
  end if;
  update public.attendance_records set late_reason_option_id = v_option.id,
      late_reason_category = v_option.default_label,
      late_reason = case when v_option.code = 'other' then btrim(p_late_reason) else null end,
      late_reason_submitted_at = v_now, finalized_at = null, updated_at = v_now
  where id = v_record.id returning * into v_record;
  return v_record;
end;
$$;


ALTER FUNCTION "public"."submit_event_late_reason"("p_event_session_id" "uuid", "p_late_reason_option_id" "uuid", "p_late_reason" "text") OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."submit_feedback_task"("p_task_id" "uuid", "p_comment" "text", "p_ratings" "jsonb", "p_sentiment_label" "text" DEFAULT NULL::"text", "p_sentiment_score" numeric DEFAULT NULL::numeric) RETURNS "uuid"
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO ''
    AS $$
declare
  v_task public.event_feedback_tasks;
  v_record public.attendance_records;
  v_feedback_id uuid;
  v_expected_count integer;
  v_received_count integer;
begin
  perform public.expire_overdue_feedback_tasks();
  select * into v_task from public.event_feedback_tasks where id = p_task_id for update;
  if not found or v_task.student_id <> private.current_student_id() then raise exception 'Feedback task was not found.' using errcode = '42501'; end if;
  if v_task.task_status <> 'pending' or v_task.due_at <= now() then raise exception 'This feedback task is no longer available.' using errcode = '22023'; end if;
  select * into v_record from public.attendance_records where id = v_task.attendance_record_id for update;
  if not found or v_record.time_in is null or v_record.time_out is null then raise exception 'Time In and Time Out must be completed before feedback.' using errcode = '22023'; end if;
  select count(*) into v_expected_count from public.event_feedback_task_objectives where task_id = v_task.id;
  select count(*) into v_received_count from jsonb_array_elements(coalesce(p_ratings, '[]'::jsonb));
  if v_received_count <> v_expected_count then raise exception 'Rate every assigned event objective before submitting feedback.' using errcode = '22023'; end if;
  if exists (select 1 from jsonb_to_recordset(p_ratings) as rating(objective_id uuid, rating integer) where rating.rating not between 1 and 9)
     or exists (select 1 from jsonb_to_recordset(p_ratings) as rating(objective_id uuid, rating integer) group by rating.objective_id having count(*) <> 1)
     or exists (select 1 from jsonb_to_recordset(p_ratings) as rating(objective_id uuid, rating integer)
       where not exists (select 1 from public.event_feedback_task_objectives assigned where assigned.task_id = v_task.id and assigned.objective_id = rating.objective_id)) then
    raise exception 'Feedback ratings must match every assigned objective and use values from 1 to 9.' using errcode = '22023';
  end if;
  if v_record.time_in > (select late_cutoff_at from public.event_sessions where id = v_record.event_session_id)
     and (v_record.late_reason_option_id is null or v_record.late_reason_submitted_at is null
       or v_record.late_reason_submitted_at <= v_record.time_out) then
    raise exception 'Submit your late reason after Time Out and before event feedback.' using errcode = '22023';
  end if;
  insert into public.event_feedback(event_id, student_id, attendance_record_id, comment, sentiment_label, sentiment_score)
  values (v_task.event_id, v_task.student_id, v_task.attendance_record_id, nullif(btrim(coalesce(p_comment, '')), ''), p_sentiment_label, p_sentiment_score)
  on conflict (attendance_record_id) do update set comment = excluded.comment, sentiment_label = excluded.sentiment_label,
    sentiment_score = excluded.sentiment_score, updated_at = now() returning id into v_feedback_id;
  delete from public.event_feedback_ratings where feedback_id = v_feedback_id;
  insert into public.event_feedback_ratings(feedback_id, objective_id, rating)
  select v_feedback_id, rating.objective_id, rating.rating from jsonb_to_recordset(p_ratings) as rating(objective_id uuid, rating integer);
  update public.event_feedback_tasks set task_status = 'completed', completed_at = now(), updated_at = now() where id = v_task.id;
  update public.attendance_records set attendance_status = case
      when time_in > (select late_cutoff_at from public.event_sessions where id = event_session_id) then 'late' else 'present' end,
    finalized_at = now(), updated_at = now()
  where id = v_record.id;
  return v_feedback_id;
end;
$$;


ALTER FUNCTION "public"."submit_feedback_task"("p_task_id" "uuid", "p_comment" "text", "p_ratings" "jsonb", "p_sentiment_label" "text", "p_sentiment_score" numeric) OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."submit_late_reason"("p_attendance_record_id" "uuid", "p_late_reason_category" "text", "p_late_reason" "text" DEFAULT NULL::"text") RETURNS "public"."attendance_records"
    LANGUAGE "plpgsql"
    SET "search_path" TO ''
    AS $$
declare
  v_option_id uuid;
begin
  select id into v_option_id
  from public.attendance_late_reason_options
  where is_active and (code = p_late_reason_category or default_label = p_late_reason_category)
  order by sort_order
  limit 1;
  if v_option_id is null then
    raise exception 'Invalid or inactive late reason option.' using errcode = '22023';
  end if;
  return public.submit_late_reason(p_attendance_record_id, v_option_id, p_late_reason);
end;
$$;


ALTER FUNCTION "public"."submit_late_reason"("p_attendance_record_id" "uuid", "p_late_reason_category" "text", "p_late_reason" "text") OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."submit_late_reason"("p_attendance_record_id" "uuid", "p_late_reason_option_id" "uuid", "p_late_reason" "text" DEFAULT NULL::"text") RETURNS "public"."attendance_records"
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO ''
    AS $$
declare
  v_student_id uuid;
  v_option public.attendance_late_reason_options;
  v_record public.attendance_records;
begin
  v_student_id := private.current_student_id();
  if v_student_id is null then
    raise exception 'Authenticated student profile is required.' using errcode = '42501';
  end if;

  select * into v_option
  from public.attendance_late_reason_options
  where id = p_late_reason_option_id and is_active;
  if not found then
    raise exception 'Invalid or inactive late reason option.' using errcode = '22023';
  end if;
  if v_option.code = 'other' and nullif(btrim(coalesce(p_late_reason, '')), '') is null then
    raise exception 'A custom late reason is required for Other.' using errcode = '22023';
  end if;

  update public.attendance_records
  set late_reason_option_id = v_option.id,
      late_reason_category = v_option.default_label,
      late_reason = case when v_option.code = 'other' then btrim(p_late_reason) else null end,
      updated_at = now()
  where id = p_attendance_record_id
    and student_id = v_student_id
    and attendance_status = 'late'
  returning * into v_record;
  if not found then
    raise exception 'Late attendance record was not found for this student.' using errcode = 'P0002';
  end if;
  return v_record;
end;
$$;


ALTER FUNCTION "public"."submit_late_reason"("p_attendance_record_id" "uuid", "p_late_reason_option_id" "uuid", "p_late_reason" "text") OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."sync_offline_event_attendance"("p_local_attendance_uuid" "uuid", "p_session_id" "uuid", "p_student_id" "uuid", "p_identification_method" "text", "p_attendance_status" "text", "p_time_in" timestamp with time zone, "p_time_out" timestamp with time zone DEFAULT NULL::timestamp with time zone, "p_checkout_identification_method" "text" DEFAULT NULL::"text", "p_remarks" "text" DEFAULT NULL::"text", "p_late_reason" "text" DEFAULT NULL::"text") RETURNS "public"."attendance_records"
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO ''
    AS $$
declare
  v_actor uuid := auth.uid();
  v_rate_limit_recorded timestamptz;
  v_session public.event_sessions;
  v_record public.attendance_records;
begin
  if not private.is_active_organizer() then
    raise exception 'An active organizer account is required.' using errcode = '42501';
  end if;

  if p_local_attendance_uuid is null or p_session_id is null or p_student_id is null
     or p_time_in is null
     or (p_time_out is not null and p_time_out < p_time_in + interval '1 minute')
     or p_identification_method not in ('qr','facial','manual')
     or (p_checkout_identification_method is not null
       and p_checkout_identification_method not in ('qr','facial','manual')) then
    raise exception 'Offline attendance identity and ordered time values are required.' using errcode = '22023';
  end if;

  select es.* into v_session
  from public.event_sessions es
  join public.events e on e.id = es.event_id
  where es.id = p_session_id and e.organizer_id = private.current_organizer_id();
  if not found or v_session.session_status not in ('ongoing','completed') then
    raise exception 'An owned event session is required.' using errcode = '42501';
  end if;
  if v_session.actual_end is not null
     and (p_time_in > v_session.actual_end or p_time_out > v_session.actual_end) then
    raise exception 'Offline attendance timestamps cannot be later than the session end.' using errcode = '22023';
  end if;
  if not exists (
    select 1 from public.event_participants ep
    where ep.event_id = v_session.event_id and ep.student_id = p_student_id
      and ep.participant_status <> 'removed'
  ) then
    raise exception 'Student is not assigned to this event.' using errcode = '42501';
  end if;

  -- Repeated copies of the exact rejected payload complete without touching
  -- the limiter or attendance data. A corrected payload is allowed through.
  if exists (
    select 1 from private.offline_attendance_sync_conflicts conflict
    where conflict.actor_id = v_actor
      and conflict.local_attendance_uuid = p_local_attendance_uuid
      and conflict.event_session_id = p_session_id
      and conflict.student_id = p_student_id
      and conflict.offline_time_in = p_time_in
      and conflict.offline_time_out is not distinct from p_time_out
  ) then
    return null;
  end if;

  if not pg_try_advisory_xact_lock(hashtextextended(v_actor::text, 0)) then
    return null;
  end if;

  insert into private.offline_sync_rate_limits(actor_id, last_request_at)
  values (v_actor, clock_timestamp())
  on conflict (actor_id) do update
    set last_request_at = excluded.last_request_at
    where private.offline_sync_rate_limits.last_request_at
      <= excluded.last_request_at - interval '100 milliseconds'
  returning last_request_at into v_rate_limit_recorded;
  if not found then
    return null;
  end if;

  select * into v_record from public.attendance_records
  where local_attendance_uuid = p_local_attendance_uuid for update;
  if found then
    if v_record.event_session_id is distinct from p_session_id
       or v_record.student_id is distinct from p_student_id then
      raise exception 'Offline attendance identity conflicts with its existing record.' using errcode = '23505';
    end if;
    if v_record.time_in is distinct from p_time_in
       or (v_record.time_out is not null and p_time_out is not null
         and v_record.time_out is distinct from p_time_out) then
      insert into private.offline_attendance_sync_conflicts(
        actor_id, local_attendance_uuid, event_session_id, student_id,
        central_attendance_id, offline_time_in, offline_time_out, reason
      ) values (
        v_actor, p_local_attendance_uuid, p_session_id, p_student_id,
        v_record.id, p_time_in, p_time_out, 'central_uuid_time_mismatch'
      ) on conflict (actor_id, local_attendance_uuid) do update set
        event_session_id = excluded.event_session_id,
        student_id = excluded.student_id,
        central_attendance_id = excluded.central_attendance_id,
        offline_time_in = excluded.offline_time_in,
        offline_time_out = excluded.offline_time_out,
        reason = excluded.reason,
        last_detected_at = clock_timestamp();
      return null;
    end if;
    delete from private.offline_attendance_sync_conflicts
      where actor_id = v_actor and local_attendance_uuid = p_local_attendance_uuid;
    if v_record.time_out is null and p_time_out is not null then
      update public.attendance_records set time_out = p_time_out,
        checkout_verification_method = p_checkout_identification_method,
        attendance_status = 'absent',
        finalized_at = case when v_session.session_status = 'completed'
          and (v_session.actual_end is null
            or v_session.actual_end + interval '24 hours' <= now()) then now() else null end,
        recorded_by = v_actor, updated_at = now()
      where id = v_record.id returning * into v_record;
      perform public.expire_overdue_feedback_tasks();
    end if;
    return v_record;
  end if;

  select * into v_record from public.attendance_records
  where event_session_id = p_session_id and student_id = p_student_id for update;
  if found and v_record.time_in is not null and v_record.time_in is distinct from p_time_in then
    insert into private.offline_attendance_sync_conflicts(
      actor_id, local_attendance_uuid, event_session_id, student_id,
      central_attendance_id, offline_time_in, offline_time_out, reason
    ) values (
      v_actor, p_local_attendance_uuid, p_session_id, p_student_id,
      v_record.id, p_time_in, p_time_out, 'central_session_student_time_in_mismatch'
    ) on conflict (actor_id, local_attendance_uuid) do update set
      event_session_id = excluded.event_session_id,
      student_id = excluded.student_id,
      central_attendance_id = excluded.central_attendance_id,
      offline_time_in = excluded.offline_time_in,
      offline_time_out = excluded.offline_time_out,
      reason = excluded.reason,
      last_detected_at = clock_timestamp();
    return null;
  elsif found then
    update public.attendance_records set local_attendance_uuid = p_local_attendance_uuid,
      attendance_status = 'absent',
      finalized_at = case when v_session.session_status = 'completed'
        and (coalesce(time_out, p_time_out) is null or v_session.actual_end is null
          or v_session.actual_end + interval '24 hours' <= now()) then now() else null end,
      verification_method = p_identification_method,
      time_in = p_time_in, time_out = coalesce(time_out, p_time_out),
      checkout_verification_method = coalesce(checkout_verification_method, p_checkout_identification_method),
      recorded_at = p_time_in, recorded_by = v_actor, updated_at = now()
    where id = v_record.id returning * into v_record;
  else
    insert into public.attendance_records(local_attendance_uuid,event_session_id,student_id,attendance_status,
      verification_method,time_in,time_out,checkout_verification_method,recorded_at,recorded_by,remarks,finalized_at)
    values (p_local_attendance_uuid,p_session_id,p_student_id,'absent',p_identification_method,
      p_time_in,p_time_out,p_checkout_identification_method,p_time_in,v_actor,
      nullif(btrim(coalesce(p_remarks,'')),''),
      case when v_session.session_status = 'completed'
        and (p_time_out is null or v_session.actual_end is null
          or v_session.actual_end + interval '24 hours' <= now()) then now() else null end)
    returning * into v_record;
  end if;
  delete from private.offline_attendance_sync_conflicts
    where actor_id = v_actor and local_attendance_uuid = p_local_attendance_uuid;
  perform public.expire_overdue_feedback_tasks();
  return v_record;
end;
$$;


ALTER FUNCTION "public"."sync_offline_event_attendance"("p_local_attendance_uuid" "uuid", "p_session_id" "uuid", "p_student_id" "uuid", "p_identification_method" "text", "p_attendance_status" "text", "p_time_in" timestamp with time zone, "p_time_out" timestamp with time zone, "p_checkout_identification_method" "text", "p_remarks" "text", "p_late_reason" "text") OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."update_organizer_event_metadata"("p_event_id" "uuid", "p_requested_by" "text" DEFAULT NULL::"text", "p_college_office" "text" DEFAULT NULL::"text", "p_number_of_pax" integer DEFAULT NULL::integer, "p_institutional_category" "text" DEFAULT NULL::"text", "p_participation_status" "text" DEFAULT NULL::"text", "p_target_group" "text" DEFAULT NULL::"text", "p_urgency_points" integer DEFAULT 0, "p_priority_score" integer DEFAULT 0, "p_priority_tier" "text" DEFAULT 'Low'::"text", "p_fixed_priority" boolean DEFAULT false) RETURNS "public"."events"
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO ''
    AS $$
declare
  v_event public.events;
  v_department_name text;
begin
  if not private.is_active_organizer() then
    raise exception 'An active organizer account is required.' using errcode = '42501';
  end if;
  if p_number_of_pax is not null and p_number_of_pax < 0 then
    raise exception 'No. of Pax cannot be negative.' using errcode = '22023';
  end if;

  select department.department_name
    into v_department_name
    from public.events event_row
    join public.departments department on department.id = event_row.department_id
   where event_row.id = p_event_id
     and event_row.organizer_id = private.current_organizer_id();

  if v_department_name is null then
    raise exception 'Event department not found or access denied.' using errcode = '42501';
  end if;

  update public.events
     set requested_by = nullif(btrim(p_requested_by), ''),
         college_office = v_department_name,
         number_of_pax = p_number_of_pax,
         institutional_category = p_institutional_category,
         participation_status = p_participation_status,
         target_group = p_target_group,
         urgency_points = p_urgency_points,
         priority_score = p_priority_score,
         priority_tier = p_priority_tier,
         fixed_priority = p_fixed_priority
   where id = p_event_id
     and organizer_id = private.current_organizer_id()
   returning * into v_event;

  if not found then
    raise exception 'Event not found or access denied.' using errcode = '42501';
  end if;
  return v_event;
end;
$$;


ALTER FUNCTION "public"."update_organizer_event_metadata"("p_event_id" "uuid", "p_requested_by" "text", "p_college_office" "text", "p_number_of_pax" integer, "p_institutional_category" "text", "p_participation_status" "text", "p_target_group" "text", "p_urgency_points" integer, "p_priority_score" integer, "p_priority_tier" "text", "p_fixed_priority" boolean) OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."admin_profiles" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "profile_id" "uuid" NOT NULL,
    "department_id" "uuid" NOT NULL,
    "employee_number" "text" NOT NULL,
    "office_name" "text" NOT NULL,
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "updated_at" timestamp with time zone DEFAULT "now"() NOT NULL
);


ALTER TABLE "public"."admin_profiles" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."attendance_late_reason_option_translations" (
    "option_id" "uuid" NOT NULL,
    "locale" "text" NOT NULL,
    "label" "text" NOT NULL,
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "updated_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    CONSTRAINT "attendance_late_reason_translations_label_not_blank" CHECK (("btrim"("label") <> ''::"text")),
    CONSTRAINT "attendance_late_reason_translations_locale_not_blank" CHECK (("btrim"("locale") <> ''::"text"))
);


ALTER TABLE "public"."attendance_late_reason_option_translations" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."attendance_late_reason_options" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "code" "text" NOT NULL,
    "default_label" "text" NOT NULL,
    "sort_order" smallint DEFAULT 0 NOT NULL,
    "is_active" boolean DEFAULT true NOT NULL,
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "updated_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    CONSTRAINT "attendance_late_reason_options_code_not_blank" CHECK (("btrim"("code") <> ''::"text")),
    CONSTRAINT "attendance_late_reason_options_label_not_blank" CHECK (("btrim"("default_label") <> ''::"text"))
);


ALTER TABLE "public"."attendance_late_reason_options" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."attendance_request_attachments" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "request_id" "uuid" NOT NULL,
    "storage_bucket" "text" NOT NULL,
    "storage_object_path" "text" NOT NULL,
    "original_file_name" "text" NOT NULL,
    "mime_type" "text" NOT NULL,
    "file_size_bytes" bigint NOT NULL,
    "uploaded_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    CONSTRAINT "attendance_attachments_bucket_not_blank" CHECK (("btrim"("storage_bucket") <> ''::"text")),
    CONSTRAINT "attendance_attachments_name_not_blank" CHECK (("btrim"("original_file_name") <> ''::"text")),
    CONSTRAINT "attendance_attachments_path_not_blank" CHECK (("btrim"("storage_object_path") <> ''::"text")),
    CONSTRAINT "attendance_attachments_size_valid" CHECK (("file_size_bytes" > 0))
);


ALTER TABLE "public"."attendance_request_attachments" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."audit_logs" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "actor_user_id" "uuid",
    "action" "text" NOT NULL,
    "target_type" "text" NOT NULL,
    "target_id" "uuid",
    "metadata" "jsonb" DEFAULT '{}'::"jsonb" NOT NULL,
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    CONSTRAINT "audit_logs_action_not_blank" CHECK (("btrim"("action") <> ''::"text")),
    CONSTRAINT "audit_logs_metadata_object" CHECK (("jsonb_typeof"("metadata") = 'object'::"text")),
    CONSTRAINT "audit_logs_target_type_not_blank" CHECK (("btrim"("target_type") <> ''::"text"))
);


ALTER TABLE "public"."audit_logs" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."credential_request_attachments" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "request_id" "uuid" NOT NULL,
    "storage_bucket" "text" NOT NULL,
    "storage_object_path" "text" NOT NULL,
    "original_file_name" "text" NOT NULL,
    "mime_type" "text" NOT NULL,
    "file_size_bytes" bigint NOT NULL,
    "uploaded_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    CONSTRAINT "credential_request_attachments_bucket_not_blank" CHECK (("btrim"("storage_bucket") <> ''::"text")),
    CONSTRAINT "credential_request_attachments_name_not_blank" CHECK (("btrim"("original_file_name") <> ''::"text")),
    CONSTRAINT "credential_request_attachments_path_not_blank" CHECK (("btrim"("storage_object_path") <> ''::"text")),
    CONSTRAINT "credential_request_attachments_size_valid" CHECK (("file_size_bytes" > 0))
);


ALTER TABLE "public"."credential_request_attachments" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."departments" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "department_code" "text" NOT NULL,
    "department_name" "text" NOT NULL,
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "updated_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "is_active" boolean DEFAULT true NOT NULL,
    "brand_name_override" "text",
    "logo_path" "text",
    "primary_color" "text",
    "secondary_color" "text",
    CONSTRAINT "departments_code_not_blank" CHECK (("btrim"("department_code") <> ''::"text")),
    CONSTRAINT "departments_name_not_blank" CHECK (("btrim"("department_name") <> ''::"text"))
);


ALTER TABLE "public"."departments" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."event_categories" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "category_name" "text" NOT NULL,
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "updated_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "is_active" boolean DEFAULT true NOT NULL,
    CONSTRAINT "event_categories_name_not_blank" CHECK (("btrim"("category_name") <> ''::"text"))
);


ALTER TABLE "public"."event_categories" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."event_email_outbox" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "recipient_profile_id" "uuid" NOT NULL,
    "recipient_email" "text" NOT NULL,
    "event_id" "uuid" NOT NULL,
    "event_code" "text" NOT NULL,
    "event_title" "text" NOT NULL,
    "subject" "text" NOT NULL,
    "body" "text" NOT NULL,
    "delivery_status" "text" DEFAULT 'pending'::"text" NOT NULL,
    "provider_message_id" "text",
    "error_message" "text",
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "sent_at" timestamp with time zone,
    "notification_type" "text" NOT NULL,
    "event_revision" timestamp with time zone NOT NULL,
    "html_body" "text",
    "attempt_count" integer DEFAULT 0 NOT NULL,
    "next_attempt_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "processing_started_at" timestamp with time zone,
    "processing_token" "uuid",
    "last_attempt_at" timestamp with time zone,
    CONSTRAINT "event_email_outbox_attempt_count_valid" CHECK ((("attempt_count" >= 0) AND ("attempt_count" <= 5))),
    CONSTRAINT "event_email_outbox_delivery_valid" CHECK (("delivery_status" = ANY (ARRAY['pending'::"text", 'processing'::"text", 'sent'::"text", 'failed'::"text", 'skipped'::"text"]))),
    CONSTRAINT "event_email_outbox_email_not_blank" CHECK (("btrim"("recipient_email") <> ''::"text")),
    CONSTRAINT "event_email_outbox_type_valid" CHECK (("notification_type" = ANY (ARRAY['published'::"text", 'rescheduled'::"text", 'participant_added'::"text"])))
);


ALTER TABLE "public"."event_email_outbox" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."event_feedback" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "event_id" "uuid" NOT NULL,
    "student_id" "uuid" NOT NULL,
    "attendance_record_id" "uuid" NOT NULL,
    "comment" "text",
    "sentiment_score" numeric(5,4),
    "sentiment_label" "text",
    "submitted_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "updated_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    CONSTRAINT "event_feedback_comment_not_blank" CHECK ((("comment" IS NULL) OR ("btrim"("comment") <> ''::"text"))),
    CONSTRAINT "event_feedback_sentiment_label_valid" CHECK ((("sentiment_label" IS NULL) OR ("sentiment_label" = ANY (ARRAY['positive'::"text", 'neutral'::"text", 'negative'::"text"])))),
    CONSTRAINT "event_feedback_sentiment_score_valid" CHECK ((("sentiment_score" IS NULL) OR (("sentiment_score" >= ('-1'::integer)::numeric) AND ("sentiment_score" <= (1)::numeric))))
);


ALTER TABLE "public"."event_feedback" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."event_feedback_ratings" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "feedback_id" "uuid" NOT NULL,
    "objective_id" "uuid" NOT NULL,
    "rating" smallint NOT NULL,
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    CONSTRAINT "event_feedback_ratings_value_valid" CHECK ((("rating" >= 1) AND ("rating" <= 9)))
);


ALTER TABLE "public"."event_feedback_ratings" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."event_feedback_task_objectives" (
    "task_id" "uuid" NOT NULL,
    "objective_id" "uuid" NOT NULL,
    "objective_order" smallint NOT NULL,
    "objective_text" "text" NOT NULL,
    CONSTRAINT "event_feedback_task_objectives_objective_order_check" CHECK (("objective_order" >= 1)),
    CONSTRAINT "event_feedback_task_objectives_objective_text_check" CHECK (("btrim"("objective_text") <> ''::"text"))
);


ALTER TABLE "public"."event_feedback_task_objectives" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."event_feedback_tasks" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "attendance_record_id" "uuid" NOT NULL,
    "event_id" "uuid" NOT NULL,
    "student_id" "uuid" NOT NULL,
    "task_status" "text" DEFAULT 'pending'::"text" NOT NULL,
    "due_at" timestamp with time zone NOT NULL,
    "completed_at" timestamp with time zone,
    "expired_at" timestamp with time zone,
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "updated_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    CONSTRAINT "event_feedback_tasks_completion_valid" CHECK (((("task_status" = 'pending'::"text") AND ("completed_at" IS NULL) AND ("expired_at" IS NULL)) OR (("task_status" = 'completed'::"text") AND ("completed_at" IS NOT NULL) AND ("expired_at" IS NULL)) OR (("task_status" = 'expired'::"text") AND ("completed_at" IS NULL) AND ("expired_at" IS NOT NULL)))),
    CONSTRAINT "event_feedback_tasks_task_status_check" CHECK (("task_status" = ANY (ARRAY['pending'::"text", 'completed'::"text", 'expired'::"text"])))
);


ALTER TABLE "public"."event_feedback_tasks" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."event_objectives" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "event_id" "uuid" NOT NULL,
    "objective_order" smallint NOT NULL,
    "objective_text" "text" NOT NULL,
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "updated_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "average_rating" numeric(3,2),
    "rating_count" integer DEFAULT 0 NOT NULL,
    CONSTRAINT "event_objectives_order_valid" CHECK (("objective_order" >= 1)),
    CONSTRAINT "event_objectives_text_not_blank" CHECK (("btrim"("objective_text") <> ''::"text"))
);


ALTER TABLE "public"."event_objectives" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."event_resources" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "event_id" "uuid" NOT NULL,
    "resource_title" "text" NOT NULL,
    "external_url" "text",
    "storage_bucket" "text",
    "storage_object_path" "text",
    "created_by" "uuid" NOT NULL,
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "updated_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    CONSTRAINT "event_resources_external_url_valid" CHECK ((("external_url" IS NULL) OR ("external_url" ~ '^https://'::"text"))),
    CONSTRAINT "event_resources_location_valid" CHECK (((("external_url" IS NOT NULL) AND ("storage_bucket" IS NULL) AND ("storage_object_path" IS NULL)) OR (("external_url" IS NULL) AND ("storage_bucket" IS NOT NULL) AND ("storage_object_path" IS NOT NULL)))),
    CONSTRAINT "event_resources_title_not_blank" CHECK (("btrim"("resource_title") <> ''::"text"))
);


ALTER TABLE "public"."event_resources" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."event_summary_snapshots" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "event_id" "uuid" NOT NULL,
    "present_count" integer NOT NULL,
    "late_count" integer NOT NULL,
    "absent_count" integer NOT NULL,
    "total_registered" integer NOT NULL,
    "attendance_rate" numeric(5,2) NOT NULL,
    "average_sentiment_score" numeric(5,4),
    "positive_percent" numeric(5,2) NOT NULL,
    "neutral_percent" numeric(5,2) NOT NULL,
    "negative_percent" numeric(5,2) NOT NULL,
    "source" "text" DEFAULT 'calculated'::"text" NOT NULL,
    "captured_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "updated_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    CONSTRAINT "event_summary_attendance_rate_valid" CHECK ((("attendance_rate" >= (0)::numeric) AND ("attendance_rate" <= (100)::numeric))),
    CONSTRAINT "event_summary_counts_match" CHECK (((("present_count" + "late_count") + "absent_count") = "total_registered")),
    CONSTRAINT "event_summary_counts_nonnegative" CHECK ((("present_count" >= 0) AND ("late_count" >= 0) AND ("absent_count" >= 0) AND ("total_registered" >= 0))),
    CONSTRAINT "event_summary_sentiment_percentages_valid" CHECK (((("positive_percent" >= (0)::numeric) AND ("positive_percent" <= (100)::numeric)) AND (("neutral_percent" >= (0)::numeric) AND ("neutral_percent" <= (100)::numeric)) AND (("negative_percent" >= (0)::numeric) AND ("negative_percent" <= (100)::numeric)) AND ((("positive_percent" + "neutral_percent") + "negative_percent") = (100)::numeric))),
    CONSTRAINT "event_summary_sentiment_score_valid" CHECK ((("average_sentiment_score" IS NULL) OR (("average_sentiment_score" >= ('-1'::integer)::numeric) AND ("average_sentiment_score" <= (1)::numeric)))),
    CONSTRAINT "event_summary_source_not_blank" CHECK (("btrim"("source") <> ''::"text"))
);


ALTER TABLE "public"."event_summary_snapshots" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."facial_enrollment_history" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "student_id" "uuid" NOT NULL,
    "credential_request_id" "uuid",
    "enrollment_reference" "text" NOT NULL,
    "enrollment_kind" "text" NOT NULL,
    "enrollment_status" "text" DEFAULT 'activated'::"text" NOT NULL,
    "replaced_profile_id" "uuid",
    "created_by" "uuid" NOT NULL,
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    CONSTRAINT "facial_enrollment_history_kind_valid" CHECK (("enrollment_kind" = ANY (ARRAY['initial'::"text", 're_enrollment'::"text"]))),
    CONSTRAINT "facial_enrollment_history_reference_not_blank" CHECK (("btrim"("enrollment_reference") <> ''::"text")),
    CONSTRAINT "facial_enrollment_history_status_valid" CHECK (("enrollment_status" = ANY (ARRAY['activated'::"text", 'superseded'::"text", 'rejected'::"text"])))
);


ALTER TABLE "public"."facial_enrollment_history" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."generated_reports" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "report_name" "text" NOT NULL,
    "scope" "text" NOT NULL,
    "report_format" "text" NOT NULL,
    "report_status" "text" DEFAULT 'queued'::"text" NOT NULL,
    "generated_by" "uuid" NOT NULL,
    "storage_bucket" "text",
    "storage_object_path" "text",
    "generated_at" timestamp with time zone,
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "updated_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    CONSTRAINT "generated_reports_file_consistent" CHECK ((("report_status" <> 'ready'::"text") OR (("storage_bucket" IS NOT NULL) AND ("storage_object_path" IS NOT NULL) AND ("generated_at" IS NOT NULL)))),
    CONSTRAINT "generated_reports_format_valid" CHECK (("report_format" = ANY (ARRAY['pdf'::"text", 'xlsx'::"text"]))),
    CONSTRAINT "generated_reports_name_not_blank" CHECK (("btrim"("report_name") <> ''::"text")),
    CONSTRAINT "generated_reports_scope_not_blank" CHECK (("btrim"("scope") <> ''::"text")),
    CONSTRAINT "generated_reports_status_valid" CHECK (("report_status" = ANY (ARRAY['queued'::"text", 'processing'::"text", 'ready'::"text", 'failed'::"text"])))
);


ALTER TABLE "public"."generated_reports" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."legal_acceptances" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "user_id" "uuid" NOT NULL,
    "document_type" "text" NOT NULL,
    "document_version" "text" NOT NULL,
    "accepted_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    CONSTRAINT "legal_acceptances_document_type_valid" CHECK (("document_type" = ANY (ARRAY['terms'::"text", 'privacy'::"text"]))),
    CONSTRAINT "legal_acceptances_document_version_not_blank" CHECK (("btrim"("document_version") <> ''::"text"))
);


ALTER TABLE "public"."legal_acceptances" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."legal_documents" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "document_type" "text" NOT NULL,
    "sections" "jsonb" NOT NULL,
    "version" "text" NOT NULL,
    "published_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "updated_by" "uuid",
    "updated_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    CONSTRAINT "legal_documents_document_type_check" CHECK (("document_type" = ANY (ARRAY['terms'::"text", 'privacy'::"text"]))),
    CONSTRAINT "legal_documents_sections_array" CHECK (("jsonb_typeof"("sections") = 'array'::"text")),
    CONSTRAINT "legal_documents_version_not_blank" CHECK (("btrim"("version") <> ''::"text"))
);


ALTER TABLE "public"."legal_documents" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."ml_predictions" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "prediction_type" "text" DEFAULT 'random_forest_risk'::"text" NOT NULL,
    "risk_level" "text" NOT NULL,
    "student_id" "uuid",
    "event_id" "uuid",
    "pattern_label" "text" NOT NULL,
    "score" numeric(8,6) NOT NULL,
    "explanation" "text" NOT NULL,
    "generated_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    CONSTRAINT "ml_predictions_explanation_not_blank" CHECK (("btrim"("explanation") <> ''::"text")),
    CONSTRAINT "ml_predictions_pattern_not_blank" CHECK (("btrim"("pattern_label") <> ''::"text")),
    CONSTRAINT "ml_predictions_risk_valid" CHECK (("risk_level" = ANY (ARRAY['low'::"text", 'medium'::"text", 'high'::"text", 'critical'::"text"]))),
    CONSTRAINT "ml_predictions_scope_present" CHECK ((("student_id" IS NOT NULL) OR ("event_id" IS NOT NULL))),
    CONSTRAINT "ml_predictions_score_valid" CHECK ((("score" >= (0)::numeric) AND ("score" <= (1)::numeric))),
    CONSTRAINT "ml_predictions_type_valid" CHECK (("prediction_type" = 'random_forest_risk'::"text"))
);


ALTER TABLE "public"."ml_predictions" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."notification_preferences" (
    "profile_id" "uuid" NOT NULL,
    "preferences" "jsonb" DEFAULT '{}'::"jsonb" NOT NULL,
    "updated_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    CONSTRAINT "notification_preferences_object" CHECK (("jsonb_typeof"("preferences") = 'object'::"text"))
);


ALTER TABLE "public"."notification_preferences" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."notifications" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "recipient_id" "uuid" NOT NULL,
    "notification_type" "text" NOT NULL,
    "title" "text" NOT NULL,
    "message" "text" NOT NULL,
    "notification_status" "text" DEFAULT 'unread'::"text" NOT NULL,
    "action_url" "text",
    "reference_id" "uuid",
    "read_at" timestamp with time zone,
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "notification_code" "text" NOT NULL,
    "severity" "text" DEFAULT 'info'::"text" NOT NULL,
    "requires_action" boolean DEFAULT false NOT NULL,
    "related_type" "text",
    "dedupe_key" "text",
    CONSTRAINT "notifications_message_not_blank" CHECK (("btrim"("message") <> ''::"text")),
    CONSTRAINT "notifications_read_consistent" CHECK (((("notification_status" = 'unread'::"text") AND ("read_at" IS NULL)) OR ("notification_status" = ANY (ARRAY['read'::"text", 'archived'::"text"])))),
    CONSTRAINT "notifications_severity_valid" CHECK (("severity" = ANY (ARRAY['info'::"text", 'warning'::"text", 'critical'::"text"]))),
    CONSTRAINT "notifications_status_valid" CHECK (("notification_status" = ANY (ARRAY['unread'::"text", 'read'::"text", 'archived'::"text"]))),
    CONSTRAINT "notifications_title_not_blank" CHECK (("btrim"("title") <> ''::"text")),
    CONSTRAINT "notifications_type_valid" CHECK (("notification_type" = ANY (ARRAY['attendance'::"text", 'correction'::"text", 'system'::"text", 'report'::"text"])))
);


ALTER TABLE "public"."notifications" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."organizers" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "profile_id" "uuid" NOT NULL,
    "employee_id" "text" NOT NULL,
    "department_id" "uuid",
    "organization_name" "text" DEFAULT 'PLPass'::"text" NOT NULL,
    "position" "text" DEFAULT 'Organizer'::"text" NOT NULL,
    "organizer_status" "text" DEFAULT 'active'::"text" NOT NULL,
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "updated_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "college_logo_path" "text",
    CONSTRAINT "organizers_employee_id_not_blank" CHECK (("btrim"("employee_id") <> ''::"text")),
    CONSTRAINT "organizers_organization_name_not_blank" CHECK (("btrim"("organization_name") <> ''::"text")),
    CONSTRAINT "organizers_position_not_blank" CHECK (("btrim"("position") <> ''::"text")),
    CONSTRAINT "organizers_status_valid" CHECK (("organizer_status" = ANY (ARRAY['active'::"text", 'inactive'::"text"])))
);


ALTER TABLE "public"."organizers" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."profiles" (
    "id" "uuid" NOT NULL,
    "email" "text" NOT NULL,
    "first_name" "text" NOT NULL,
    "middle_name" "text",
    "last_name" "text" NOT NULL,
    "profile_picture" "text",
    "role" "text" NOT NULL,
    "account_status" "text" DEFAULT 'active'::"text" NOT NULL,
    "department_id" "uuid",
    "employee_id" "text",
    "student_id" "text",
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "updated_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "name_extension" "text",
    CONSTRAINT "profiles_account_status_valid" CHECK (("account_status" = ANY (ARRAY['active'::"text", 'inactive'::"text", 'suspended'::"text"]))),
    CONSTRAINT "profiles_email_not_blank" CHECK (("btrim"("email") <> ''::"text")),
    CONSTRAINT "profiles_first_name_not_blank" CHECK (("btrim"("first_name") <> ''::"text")),
    CONSTRAINT "profiles_last_name_not_blank" CHECK (("btrim"("last_name") <> ''::"text")),
    CONSTRAINT "profiles_name_extension_valid" CHECK ((("name_extension" IS NULL) OR ("name_extension" = ANY (ARRAY['Jr.'::"text", 'Sr.'::"text", 'II'::"text", 'III'::"text", 'IV'::"text", 'V'::"text"])))),
    CONSTRAINT "profiles_role_identifier_valid" CHECK (((("role" = ANY (ARRAY['admin'::"text", 'department_admin'::"text", 'organizer'::"text"])) AND ("employee_id" IS NOT NULL) AND ("student_id" IS NULL)) OR (("role" = 'student'::"text") AND ("student_id" IS NOT NULL) AND ("employee_id" IS NULL)))),
    CONSTRAINT "profiles_role_valid" CHECK (("role" = ANY (ARRAY['admin'::"text", 'department_admin'::"text", 'organizer'::"text", 'student'::"text"])))
);


ALTER TABLE "public"."profiles" OWNER TO "postgres";


COMMENT ON COLUMN "public"."profiles"."name_extension" IS 'Optional generational extension selected when an account is created.';



CREATE TABLE IF NOT EXISTS "public"."programs" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "department_id" "uuid" NOT NULL,
    "program_code" "text" NOT NULL,
    "program_name" "text" NOT NULL,
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "updated_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "is_active" boolean DEFAULT true NOT NULL,
    CONSTRAINT "programs_code_not_blank" CHECK (("btrim"("program_code") <> ''::"text")),
    CONSTRAINT "programs_name_not_blank" CHECK (("btrim"("program_name") <> ''::"text"))
);


ALTER TABLE "public"."programs" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."request_email_outbox" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "recipient_profile_id" "uuid" NOT NULL,
    "recipient_email" "text" NOT NULL,
    "request_table" "text" NOT NULL,
    "request_id" "uuid" NOT NULL,
    "request_status" "text" NOT NULL,
    "subject" "text" NOT NULL,
    "body" "text" NOT NULL,
    "delivery_status" "text" DEFAULT 'pending'::"text" NOT NULL,
    "provider_message_id" "text",
    "error_message" "text",
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "sent_at" timestamp with time zone,
    "attempt_count" integer DEFAULT 0 NOT NULL,
    "next_attempt_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "processing_started_at" timestamp with time zone,
    "processing_token" "uuid",
    "last_attempt_at" timestamp with time zone,
    CONSTRAINT "request_email_outbox_delivery_valid" CHECK (("delivery_status" = ANY (ARRAY['pending'::"text", 'processing'::"text", 'sent'::"text", 'failed'::"text", 'skipped'::"text"]))),
    CONSTRAINT "request_email_outbox_email_not_blank" CHECK (("btrim"("recipient_email") <> ''::"text")),
    CONSTRAINT "request_email_outbox_table_valid" CHECK (("request_table" = ANY (ARRAY['attendance_requests'::"text", 'credential_requests'::"text"])))
);


ALTER TABLE "public"."request_email_outbox" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."sections" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "program_id" "uuid" NOT NULL,
    "section_name" "text" NOT NULL,
    "year_level" smallint NOT NULL,
    "academic_year" "text" NOT NULL,
    "semester" "text" NOT NULL,
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "updated_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "is_active" boolean DEFAULT true NOT NULL,
    CONSTRAINT "sections_academic_year_not_blank" CHECK (("btrim"("academic_year") <> ''::"text")),
    CONSTRAINT "sections_name_not_blank" CHECK (("btrim"("section_name") <> ''::"text")),
    CONSTRAINT "sections_year_level_valid" CHECK ((("year_level" >= 1) AND ("year_level" <= 8)))
);


ALTER TABLE "public"."sections" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."semesters" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "semester_name" "text" NOT NULL,
    "academic_year" "text" NOT NULL,
    "start_date" "date" NOT NULL,
    "end_date" "date" NOT NULL,
    "status" "text" DEFAULT 'upcoming'::"text" NOT NULL,
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "updated_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    CONSTRAINT "semesters_academic_year_not_blank" CHECK (("btrim"("academic_year") <> ''::"text")),
    CONSTRAINT "semesters_date_order_valid" CHECK (("end_date" >= "start_date")),
    CONSTRAINT "semesters_name_not_blank" CHECK (("btrim"("semester_name") <> ''::"text")),
    CONSTRAINT "semesters_status_valid" CHECK (("status" = ANY (ARRAY['upcoming'::"text", 'active'::"text", 'completed'::"text"])))
);


ALTER TABLE "public"."semesters" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."student_face_embeddings" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "student_id" "uuid" NOT NULL,
    "pose" "text" NOT NULL,
    "embedding" "jsonb" NOT NULL,
    "model_name" "text" NOT NULL,
    "detector_backend" "text" NOT NULL,
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "updated_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    CONSTRAINT "student_face_embeddings_embedding_check" CHECK ((("jsonb_typeof"("embedding") = 'array'::"text") AND (("jsonb_array_length"("embedding") >= 256) AND ("jsonb_array_length"("embedding") <= 1024)))),
    CONSTRAINT "student_face_embeddings_pose_check" CHECK (("pose" = ANY (ARRAY['front'::"text", 'left'::"text", 'right'::"text"])))
);


ALTER TABLE "public"."student_face_embeddings" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."students" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "profile_id" "uuid" NOT NULL,
    "student_id" "text" NOT NULL,
    "program_id" "uuid" NOT NULL,
    "department_id" "uuid" NOT NULL,
    "section_id" "uuid" NOT NULL,
    "year_level" smallint NOT NULL,
    "student_status" "text" DEFAULT 'enrolled'::"text" NOT NULL,
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "updated_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "initial_facial_enrollment_completed_at" timestamp with time zone,
    CONSTRAINT "check_student_id_format" CHECK (("student_id" ~ '^[0-9]{2}-[0-9]{5}$'::"text")),
    CONSTRAINT "students_id_not_blank" CHECK (("btrim"("student_id") <> ''::"text")),
    CONSTRAINT "students_status_valid" CHECK (("student_status" = ANY (ARRAY['enrolled'::"text", 'loa'::"text", 'dropped'::"text", 'archived'::"text"]))),
    CONSTRAINT "students_year_level_valid" CHECK ((("year_level" >= 1) AND ("year_level" <= 8)))
);


ALTER TABLE "public"."students" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."system_settings" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "institution_name" "text" DEFAULT 'PLPass'::"text" NOT NULL,
    "current_school_year" "text" DEFAULT '2026-2027'::"text" NOT NULL,
    "current_semester_id" "uuid",
    "attendance_late_cutoff_minutes" integer DEFAULT 15 NOT NULL,
    "default_session_duration_minutes" integer DEFAULT 90 NOT NULL,
    "verification_policy" "text" DEFAULT 'Use an approved QR reader or facial verification device.'::"text" NOT NULL,
    "notification_preferences" "jsonb" DEFAULT '{}'::"jsonb" NOT NULL,
    "updated_by" "uuid",
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "updated_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    CONSTRAINT "system_settings_duration_valid" CHECK ((("default_session_duration_minutes" >= 1) AND ("default_session_duration_minutes" <= 1440))),
    CONSTRAINT "system_settings_institution_not_blank" CHECK (("btrim"("institution_name") <> ''::"text")),
    CONSTRAINT "system_settings_late_cutoff_valid" CHECK ((("attendance_late_cutoff_minutes" >= 0) AND ("attendance_late_cutoff_minutes" <= 240))),
    CONSTRAINT "system_settings_notification_object" CHECK (("jsonb_typeof"("notification_preferences") = 'object'::"text")),
    CONSTRAINT "system_settings_school_year_not_blank" CHECK (("btrim"("current_school_year") <> ''::"text")),
    CONSTRAINT "system_settings_verification_policy_not_blank" CHECK (("btrim"("verification_policy") <> ''::"text"))
);


ALTER TABLE "public"."system_settings" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."verification_attempts" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "event_session_id" "uuid" NOT NULL,
    "student_id" "uuid",
    "qr_credential_id" "uuid",
    "facial_profile_id" "uuid",
    "verification_method" "text" NOT NULL,
    "accepted" boolean NOT NULL,
    "failure_code" "text",
    "message" "text" NOT NULL,
    "attempted_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    CONSTRAINT "verification_attempts_matching_credential" CHECK (((("verification_method" = 'qr'::"text") AND ("qr_credential_id" IS NOT NULL) AND ("facial_profile_id" IS NULL)) OR (("verification_method" = 'facial'::"text") AND ("facial_profile_id" IS NOT NULL) AND ("qr_credential_id" IS NULL)) OR (("accepted" = false) AND ("qr_credential_id" IS NULL) AND ("facial_profile_id" IS NULL)))),
    CONSTRAINT "verification_attempts_message_not_blank" CHECK (("btrim"("message") <> ''::"text")),
    CONSTRAINT "verification_attempts_method_valid" CHECK (("verification_method" = ANY (ARRAY['qr'::"text", 'facial'::"text"])))
);


ALTER TABLE "public"."verification_attempts" OWNER TO "postgres";


ALTER TABLE ONLY "public"."admin_profiles"
    ADD CONSTRAINT "admin_profiles_employee_number_key" UNIQUE ("employee_number");



ALTER TABLE ONLY "public"."admin_profiles"
    ADD CONSTRAINT "admin_profiles_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."attendance_request_attachments"
    ADD CONSTRAINT "attendance_attachments_request_path_unique" UNIQUE ("request_id", "storage_object_path");



ALTER TABLE ONLY "public"."attendance_late_reason_option_translations"
    ADD CONSTRAINT "attendance_late_reason_option_translations_pkey" PRIMARY KEY ("option_id", "locale");



ALTER TABLE ONLY "public"."attendance_late_reason_options"
    ADD CONSTRAINT "attendance_late_reason_options_code_key" UNIQUE ("code");



ALTER TABLE ONLY "public"."attendance_late_reason_options"
    ADD CONSTRAINT "attendance_late_reason_options_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."attendance_records"
    ADD CONSTRAINT "attendance_records_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."attendance_records"
    ADD CONSTRAINT "attendance_records_verification_attempt_id_key" UNIQUE ("verification_attempt_id");



ALTER TABLE ONLY "public"."attendance_request_attachments"
    ADD CONSTRAINT "attendance_request_attachments_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."attendance_requests"
    ADD CONSTRAINT "attendance_requests_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."audit_logs"
    ADD CONSTRAINT "audit_logs_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."credential_request_attachments"
    ADD CONSTRAINT "credential_request_attachments_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."credential_request_attachments"
    ADD CONSTRAINT "credential_request_attachments_request_path_unique" UNIQUE ("request_id", "storage_object_path");



ALTER TABLE ONLY "public"."credential_requests"
    ADD CONSTRAINT "credential_requests_pkey" PRIMARY KEY ("id");



ALTER TABLE "public"."credential_requests"
    ADD CONSTRAINT "credential_requests_type_valid" CHECK (("request_type" = ANY (ARRAY['replacement'::"text", 'technical_issue'::"text"]))) NOT VALID;



ALTER TABLE ONLY "public"."departments"
    ADD CONSTRAINT "departments_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."event_categories"
    ADD CONSTRAINT "event_categories_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."event_email_outbox"
    ADD CONSTRAINT "event_email_outbox_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."event_feedback"
    ADD CONSTRAINT "event_feedback_attendance_record_unique" UNIQUE ("attendance_record_id");



ALTER TABLE ONLY "public"."event_feedback"
    ADD CONSTRAINT "event_feedback_event_student_unique" UNIQUE ("event_id", "student_id");



ALTER TABLE ONLY "public"."event_feedback"
    ADD CONSTRAINT "event_feedback_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."event_feedback_ratings"
    ADD CONSTRAINT "event_feedback_ratings_feedback_objective_unique" UNIQUE ("feedback_id", "objective_id");



ALTER TABLE ONLY "public"."event_feedback_ratings"
    ADD CONSTRAINT "event_feedback_ratings_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."event_feedback_task_objectives"
    ADD CONSTRAINT "event_feedback_task_objectives_pkey" PRIMARY KEY ("task_id", "objective_id");



ALTER TABLE ONLY "public"."event_feedback_task_objectives"
    ADD CONSTRAINT "event_feedback_task_objectives_task_id_objective_order_key" UNIQUE ("task_id", "objective_order");



ALTER TABLE ONLY "public"."event_feedback_tasks"
    ADD CONSTRAINT "event_feedback_tasks_attendance_record_id_key" UNIQUE ("attendance_record_id");



ALTER TABLE ONLY "public"."event_feedback_tasks"
    ADD CONSTRAINT "event_feedback_tasks_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."event_objectives"
    ADD CONSTRAINT "event_objectives_event_order_unique" UNIQUE ("event_id", "objective_order");



ALTER TABLE ONLY "public"."event_objectives"
    ADD CONSTRAINT "event_objectives_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."event_participants"
    ADD CONSTRAINT "event_participants_event_student_unique" UNIQUE ("event_id", "student_id");



ALTER TABLE ONLY "public"."event_participants"
    ADD CONSTRAINT "event_participants_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."event_resources"
    ADD CONSTRAINT "event_resources_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."event_sessions"
    ADD CONSTRAINT "event_sessions_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."event_summary_snapshots"
    ADD CONSTRAINT "event_summary_snapshots_event_id_key" UNIQUE ("event_id");



ALTER TABLE ONLY "public"."event_summary_snapshots"
    ADD CONSTRAINT "event_summary_snapshots_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."events"
    ADD CONSTRAINT "events_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."facial_enrollment_history"
    ADD CONSTRAINT "facial_enrollment_history_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."facial_profiles"
    ADD CONSTRAINT "facial_profiles_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."facial_profiles"
    ADD CONSTRAINT "facial_profiles_student_id_key" UNIQUE ("student_id");



ALTER TABLE ONLY "public"."generated_reports"
    ADD CONSTRAINT "generated_reports_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."legal_acceptances"
    ADD CONSTRAINT "legal_acceptances_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."legal_acceptances"
    ADD CONSTRAINT "legal_acceptances_user_document_version_unique" UNIQUE ("user_id", "document_type", "document_version");



ALTER TABLE ONLY "public"."legal_documents"
    ADD CONSTRAINT "legal_documents_document_type_key" UNIQUE ("document_type");



ALTER TABLE ONLY "public"."legal_documents"
    ADD CONSTRAINT "legal_documents_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."ml_predictions"
    ADD CONSTRAINT "ml_predictions_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."notification_preferences"
    ADD CONSTRAINT "notification_preferences_pkey" PRIMARY KEY ("profile_id");



ALTER TABLE ONLY "public"."notifications"
    ADD CONSTRAINT "notifications_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."organizers"
    ADD CONSTRAINT "organizers_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."organizers"
    ADD CONSTRAINT "organizers_profile_id_key" UNIQUE ("profile_id");



ALTER TABLE ONLY "public"."profiles"
    ADD CONSTRAINT "profiles_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."programs"
    ADD CONSTRAINT "programs_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."qr_credentials"
    ADD CONSTRAINT "qr_credentials_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."request_email_outbox"
    ADD CONSTRAINT "request_email_outbox_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."sections"
    ADD CONSTRAINT "sections_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."semesters"
    ADD CONSTRAINT "semesters_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."student_face_embeddings"
    ADD CONSTRAINT "student_face_embeddings_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."student_face_embeddings"
    ADD CONSTRAINT "student_face_embeddings_student_id_pose_key" UNIQUE ("student_id", "pose");



ALTER TABLE ONLY "public"."students"
    ADD CONSTRAINT "students_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."students"
    ADD CONSTRAINT "students_profile_id_key" UNIQUE ("profile_id");



ALTER TABLE ONLY "public"."system_settings"
    ADD CONSTRAINT "system_settings_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."verification_attempts"
    ADD CONSTRAINT "verification_attempts_pkey" PRIMARY KEY ("id");



CREATE INDEX "admin_profiles_department_id_idx" ON "public"."admin_profiles" USING "btree" ("department_id");



CREATE INDEX "admin_profiles_profile_id_idx" ON "public"."admin_profiles" USING "btree" ("profile_id");



CREATE INDEX "attendance_late_reason_options_active_order_idx" ON "public"."attendance_late_reason_options" USING "btree" ("is_active", "sort_order", "default_label");



CREATE INDEX "attendance_records_event_session_id_idx" ON "public"."attendance_records" USING "btree" ("event_session_id");



CREATE UNIQUE INDEX "attendance_records_event_student_unique_idx" ON "public"."attendance_records" USING "btree" ("event_session_id", "student_id") WHERE ("event_session_id" IS NOT NULL);



CREATE INDEX "attendance_records_late_reason_option_idx" ON "public"."attendance_records" USING "btree" ("late_reason_option_id");



CREATE UNIQUE INDEX "attendance_records_local_uuid_unique_idx" ON "public"."attendance_records" USING "btree" ("local_attendance_uuid") WHERE ("local_attendance_uuid" IS NOT NULL);



CREATE INDEX "attendance_records_recorded_by_idx" ON "public"."attendance_records" USING "btree" ("recorded_by");



CREATE UNIQUE INDEX "attendance_records_session_student_uidx" ON "public"."attendance_records" USING "btree" ("event_session_id", "student_id");



CREATE INDEX "attendance_records_student_id_idx" ON "public"."attendance_records" USING "btree" ("student_id");



CREATE INDEX "attendance_records_student_recorded_idx" ON "public"."attendance_records" USING "btree" ("student_id", "recorded_at" DESC);



CREATE INDEX "attendance_records_student_status_idx" ON "public"."attendance_records" USING "btree" ("student_id", "attendance_status");



CREATE INDEX "attendance_records_walkin_origin_idx" ON "public"."attendance_records" USING "btree" ("event_session_id", "attendance_origin");



CREATE INDEX "attendance_request_attachments_request_id_idx" ON "public"."attendance_request_attachments" USING "btree" ("request_id");



CREATE INDEX "attendance_requests_attendance_record_id_idx" ON "public"."attendance_requests" USING "btree" ("attendance_record_id");



CREATE UNIQUE INDEX "attendance_requests_one_pending_per_record_idx" ON "public"."attendance_requests" USING "btree" ("student_id", "attendance_record_id") WHERE ("request_status" = 'pending'::"text");



CREATE INDEX "attendance_requests_reviewed_by_idx" ON "public"."attendance_requests" USING "btree" ("reviewed_by");



CREATE INDEX "attendance_requests_status_created_idx" ON "public"."attendance_requests" USING "btree" ("request_status", "created_at" DESC);



CREATE INDEX "attendance_requests_student_id_idx" ON "public"."attendance_requests" USING "btree" ("student_id");



CREATE INDEX "attendance_requests_student_status_idx" ON "public"."attendance_requests" USING "btree" ("student_id", "request_status", "created_at" DESC);



CREATE INDEX "audit_logs_actor_user_id_idx" ON "public"."audit_logs" USING "btree" ("actor_user_id");



CREATE INDEX "audit_logs_created_at_idx" ON "public"."audit_logs" USING "btree" ("created_at" DESC);



CREATE INDEX "audit_logs_target_idx" ON "public"."audit_logs" USING "btree" ("target_type", "target_id");



CREATE INDEX "credential_request_attachments_request_id_idx" ON "public"."credential_request_attachments" USING "btree" ("request_id");



CREATE UNIQUE INDEX "credential_requests_one_pending_type_idx" ON "public"."credential_requests" USING "btree" ("student_id", "credential_type", "request_type") WHERE ("request_status" = 'pending'::"text");



CREATE INDEX "credential_requests_reviewed_by_idx" ON "public"."credential_requests" USING "btree" ("reviewed_by");



CREATE INDEX "credential_requests_status_created_idx" ON "public"."credential_requests" USING "btree" ("request_status", "created_at" DESC);



CREATE INDEX "credential_requests_student_id_idx" ON "public"."credential_requests" USING "btree" ("student_id");



CREATE UNIQUE INDEX "departments_code_unique_idx" ON "public"."departments" USING "btree" ("lower"("department_code"));



CREATE UNIQUE INDEX "event_categories_name_unique_idx" ON "public"."event_categories" USING "btree" ("lower"("category_name"));



CREATE INDEX "event_email_outbox_due_idx" ON "public"."event_email_outbox" USING "btree" ("next_attempt_at", "created_at") WHERE ("delivery_status" = 'pending'::"text");



CREATE INDEX "event_email_outbox_event_idx" ON "public"."event_email_outbox" USING "btree" ("event_id");



CREATE INDEX "event_email_outbox_failed_idx" ON "public"."event_email_outbox" USING "btree" ("created_at" DESC) WHERE ("delivery_status" = 'failed'::"text");



CREATE INDEX "event_email_outbox_pending_idx" ON "public"."event_email_outbox" USING "btree" ("delivery_status", "created_at") WHERE ("delivery_status" = 'pending'::"text");



CREATE INDEX "event_email_outbox_recipient_profile_id_idx" ON "public"."event_email_outbox" USING "btree" ("recipient_profile_id");



CREATE UNIQUE INDEX "event_email_outbox_revision_unique" ON "public"."event_email_outbox" USING "btree" ("event_id", "recipient_profile_id", "notification_type", "event_revision");



CREATE INDEX "event_feedback_ratings_objective_id_idx" ON "public"."event_feedback_ratings" USING "btree" ("objective_id");



CREATE INDEX "event_feedback_student_id_idx" ON "public"."event_feedback" USING "btree" ("student_id");



CREATE INDEX "event_feedback_task_objectives_objective_id_idx" ON "public"."event_feedback_task_objectives" USING "btree" ("objective_id");



CREATE INDEX "event_feedback_tasks_event_id_idx" ON "public"."event_feedback_tasks" USING "btree" ("event_id");



CREATE INDEX "event_feedback_tasks_student_status_due_idx" ON "public"."event_feedback_tasks" USING "btree" ("student_id", "task_status", "due_at");



CREATE INDEX "event_participants_event_id_idx" ON "public"."event_participants" USING "btree" ("event_id");



CREATE INDEX "event_participants_student_id_idx" ON "public"."event_participants" USING "btree" ("student_id");



CREATE INDEX "event_participants_student_status_idx" ON "public"."event_participants" USING "btree" ("student_id", "participant_status");



CREATE INDEX "event_resources_created_by_idx" ON "public"."event_resources" USING "btree" ("created_by");



CREATE INDEX "event_resources_event_id_idx" ON "public"."event_resources" USING "btree" ("event_id");



CREATE INDEX "event_sessions_archive_status_idx" ON "public"."event_sessions" USING "btree" ("session_archive_status");



CREATE INDEX "event_sessions_created_by_idx" ON "public"."event_sessions" USING "btree" ("created_by");



CREATE INDEX "event_sessions_event_id_idx" ON "public"."event_sessions" USING "btree" ("event_id");



CREATE INDEX "event_sessions_status_start_idx" ON "public"."event_sessions" USING "btree" ("session_status", "scheduled_start");



CREATE INDEX "event_sessions_superseded_by_idx" ON "public"."event_sessions" USING "btree" ("superseded_by");



CREATE INDEX "events_cancelled_by_idx" ON "public"."events" USING "btree" ("cancelled_by");



CREATE INDEX "events_category_id_idx" ON "public"."events" USING "btree" ("category_id");



CREATE UNIQUE INDEX "events_code_unique_idx" ON "public"."events" USING "btree" ("lower"("event_code"));



CREATE INDEX "events_department_id_idx" ON "public"."events" USING "btree" ("department_id");



CREATE INDEX "events_last_rescheduled_idx" ON "public"."events" USING "btree" ("last_rescheduled_at" DESC);



CREATE INDEX "events_organizer_id_idx" ON "public"."events" USING "btree" ("organizer_id");



CREATE INDEX "events_priority_level_idx" ON "public"."events" USING "btree" ("priority_level");



CREATE INDEX "events_published_by_idx" ON "public"."events" USING "btree" ("published_by");



CREATE INDEX "events_status_starts_at_idx" ON "public"."events" USING "btree" ("event_status", "starts_at");



CREATE INDEX "facial_enrollment_history_created_by_idx" ON "public"."facial_enrollment_history" USING "btree" ("created_by");



CREATE INDEX "facial_enrollment_history_credential_request_id_idx" ON "public"."facial_enrollment_history" USING "btree" ("credential_request_id");



CREATE INDEX "facial_enrollment_history_student_created_idx" ON "public"."facial_enrollment_history" USING "btree" ("student_id", "created_at" DESC);



CREATE UNIQUE INDEX "facial_profiles_enrollment_reference_unique_idx" ON "public"."facial_profiles" USING "btree" ("enrollment_reference");



CREATE INDEX "generated_reports_generated_by_idx" ON "public"."generated_reports" USING "btree" ("generated_by");



CREATE INDEX "generated_reports_status_created_idx" ON "public"."generated_reports" USING "btree" ("report_status", "created_at" DESC);



CREATE INDEX "legal_acceptances_user_id_idx" ON "public"."legal_acceptances" USING "btree" ("user_id");



CREATE INDEX "ml_predictions_event_id_idx" ON "public"."ml_predictions" USING "btree" ("event_id");



CREATE INDEX "ml_predictions_risk_generated_idx" ON "public"."ml_predictions" USING "btree" ("risk_level", "generated_at" DESC);



CREATE INDEX "ml_predictions_student_id_idx" ON "public"."ml_predictions" USING "btree" ("student_id");



CREATE UNIQUE INDEX "notifications_dedupe_key_unique" ON "public"."notifications" USING "btree" ("dedupe_key") WHERE ("dedupe_key" IS NOT NULL);



CREATE INDEX "notifications_recipient_status_created_idx" ON "public"."notifications" USING "btree" ("recipient_id", "notification_status", "created_at" DESC);



CREATE INDEX "organizers_college_logo_path_idx" ON "public"."organizers" USING "btree" ("college_logo_path") WHERE ("college_logo_path" IS NOT NULL);



CREATE INDEX "organizers_department_id_idx" ON "public"."organizers" USING "btree" ("department_id");



CREATE UNIQUE INDEX "organizers_employee_id_unique_idx" ON "public"."organizers" USING "btree" ("lower"("employee_id"));



CREATE INDEX "organizers_status_idx" ON "public"."organizers" USING "btree" ("organizer_status");



CREATE INDEX "profiles_department_id_idx" ON "public"."profiles" USING "btree" ("department_id");



CREATE UNIQUE INDEX "profiles_email_unique_idx" ON "public"."profiles" USING "btree" ("lower"("email"));



CREATE UNIQUE INDEX "profiles_employee_id_unique_idx" ON "public"."profiles" USING "btree" ("lower"("employee_id")) WHERE ("employee_id" IS NOT NULL);



CREATE INDEX "profiles_role_status_idx" ON "public"."profiles" USING "btree" ("role", "account_status");



CREATE UNIQUE INDEX "profiles_student_id_unique_idx" ON "public"."profiles" USING "btree" ("lower"("student_id")) WHERE ("student_id" IS NOT NULL);



CREATE UNIQUE INDEX "programs_department_code_unique_idx" ON "public"."programs" USING "btree" ("department_id", "lower"("program_code"));



CREATE INDEX "programs_department_id_idx" ON "public"."programs" USING "btree" ("department_id");



CREATE UNIQUE INDEX "qr_credentials_one_active_per_student_idx" ON "public"."qr_credentials" USING "btree" ("student_id") WHERE ("credential_status" = 'activated'::"text");



CREATE INDEX "qr_credentials_student_id_idx" ON "public"."qr_credentials" USING "btree" ("student_id");



CREATE UNIQUE INDEX "qr_credentials_token_hash_unique_idx" ON "public"."qr_credentials" USING "btree" ("token_hash");



CREATE INDEX "request_email_outbox_due_idx" ON "public"."request_email_outbox" USING "btree" ("next_attempt_at", "created_at") WHERE ("delivery_status" = 'pending'::"text");



CREATE INDEX "request_email_outbox_failed_idx" ON "public"."request_email_outbox" USING "btree" ("created_at" DESC) WHERE ("delivery_status" = 'failed'::"text");



CREATE INDEX "request_email_outbox_pending_idx" ON "public"."request_email_outbox" USING "btree" ("delivery_status", "created_at") WHERE ("delivery_status" = 'pending'::"text");



CREATE INDEX "request_email_outbox_recipient_profile_id_idx" ON "public"."request_email_outbox" USING "btree" ("recipient_profile_id");



CREATE UNIQUE INDEX "sections_identity_unique_idx" ON "public"."sections" USING "btree" ("program_id", "lower"("section_name"), "academic_year", "semester");



CREATE INDEX "sections_program_id_idx" ON "public"."sections" USING "btree" ("program_id");



CREATE UNIQUE INDEX "semesters_identity_unique_idx" ON "public"."semesters" USING "btree" ("academic_year", "lower"("semester_name"));



CREATE UNIQUE INDEX "semesters_single_active_idx" ON "public"."semesters" USING "btree" ("status") WHERE ("status" = 'active'::"text");



CREATE INDEX "students_department_id_idx" ON "public"."students" USING "btree" ("department_id");



CREATE INDEX "students_program_id_idx" ON "public"."students" USING "btree" ("program_id");



CREATE INDEX "students_section_id_idx" ON "public"."students" USING "btree" ("section_id");



CREATE INDEX "students_status_idx" ON "public"."students" USING "btree" ("student_status");



CREATE UNIQUE INDEX "students_student_id_unique_idx" ON "public"."students" USING "btree" ("lower"("student_id"));



CREATE INDEX "system_settings_current_semester_id_idx" ON "public"."system_settings" USING "btree" ("current_semester_id");



CREATE INDEX "system_settings_updated_by_idx" ON "public"."system_settings" USING "btree" ("updated_by");



CREATE INDEX "verification_attempts_event_session_id_idx" ON "public"."verification_attempts" USING "btree" ("event_session_id");



CREATE INDEX "verification_attempts_facial_profile_id_idx" ON "public"."verification_attempts" USING "btree" ("facial_profile_id");



CREATE INDEX "verification_attempts_method_time_idx" ON "public"."verification_attempts" USING "btree" ("verification_method", "attempted_at" DESC);



CREATE INDEX "verification_attempts_qr_credential_id_idx" ON "public"."verification_attempts" USING "btree" ("qr_credential_id");



CREATE INDEX "verification_attempts_student_id_idx" ON "public"."verification_attempts" USING "btree" ("student_id");



CREATE OR REPLACE TRIGGER "attendance_records_prevent_pending_feedback_finalization" BEFORE INSERT OR UPDATE OF "finalized_at", "attendance_status" ON "public"."attendance_records" FOR EACH ROW EXECUTE FUNCTION "private"."prevent_pending_feedback_finalization"();



CREATE OR REPLACE TRIGGER "attendance_records_sync_late_reason_option" BEFORE INSERT OR UPDATE OF "late_reason_category", "late_reason_option_id" ON "public"."attendance_records" FOR EACH ROW EXECUTE FUNCTION "private"."sync_late_reason_option_id"();



CREATE OR REPLACE TRIGGER "attendance_records_sync_qr_last_used" AFTER INSERT OR UPDATE OF "time_out" ON "public"."attendance_records" FOR EACH ROW EXECUTE FUNCTION "private"."sync_qr_credential_last_used"();



CREATE OR REPLACE TRIGGER "create_feedback_tasks_after_session_completion" AFTER UPDATE OF "session_status" ON "public"."event_sessions" FOR EACH ROW EXECUTE FUNCTION "private"."create_feedback_tasks_after_session_completion"();



CREATE OR REPLACE TRIGGER "credential_requests_no_facial_reenrollment" BEFORE INSERT OR UPDATE ON "public"."credential_requests" FOR EACH ROW EXECUTE FUNCTION "public"."prevent_facial_reenrollment"();



CREATE OR REPLACE TRIGGER "enforce_event_attendance_completion" BEFORE INSERT OR UPDATE OF "attendance_status", "event_session_id", "time_in", "time_out", "late_reason_option_id", "late_reason_submitted_at", "finalized_at" ON "public"."attendance_records" FOR EACH ROW EXECUTE FUNCTION "private"."enforce_event_attendance_completion"();



CREATE OR REPLACE TRIGGER "ensure_current_school_year_semesters" AFTER INSERT OR UPDATE OF "current_school_year" ON "public"."system_settings" FOR EACH ROW EXECUTE FUNCTION "private"."ensure_current_school_year_semesters"();



CREATE OR REPLACE TRIGGER "ensure_feedback_task_for_completed_session" AFTER INSERT OR UPDATE OF "time_in", "time_out" ON "public"."attendance_records" FOR EACH ROW EXECUTE FUNCTION "private"."ensure_feedback_task_for_completed_session"();



CREATE OR REPLACE TRIGGER "event_resources_limit_five" BEFORE INSERT ON "public"."event_resources" FOR EACH ROW EXECUTE FUNCTION "private"."enforce_event_resource_limit"();



CREATE OR REPLACE TRIGGER "facial_profiles_one_time_enrollment" BEFORE UPDATE ON "public"."facial_profiles" FOR EACH ROW EXECUTE FUNCTION "public"."prevent_facial_profile_replacement"();



CREATE OR REPLACE TRIGGER "finalize_incomplete_event_attendance_after_session" AFTER UPDATE OF "session_status" ON "public"."event_sessions" FOR EACH ROW EXECUTE FUNCTION "private"."finalize_incomplete_event_attendance_after_session"();



CREATE OR REPLACE TRIGGER "normalize_account_status_notification" BEFORE INSERT OR UPDATE OF "notification_code", "requires_action", "action_url" ON "public"."notifications" FOR EACH ROW WHEN (("new"."notification_code" = 'account.status_changed'::"text")) EXECUTE FUNCTION "private"."normalize_account_status_notification"();



CREATE OR REPLACE TRIGGER "normalize_notification_row" BEFORE INSERT ON "public"."notifications" FOR EACH ROW EXECUTE FUNCTION "private"."normalize_notification_row"();



CREATE OR REPLACE TRIGGER "notify_admin_event_started_after_insert" AFTER INSERT ON "public"."event_sessions" FOR EACH ROW EXECUTE FUNCTION "private"."notify_admin_event_started"();



CREATE OR REPLACE TRIGGER "notify_admin_event_started_after_update" AFTER UPDATE OF "actual_start" ON "public"."event_sessions" FOR EACH ROW EXECUTE FUNCTION "private"."notify_admin_event_started"();



CREATE OR REPLACE TRIGGER "notify_attendance_finalization_after_update" AFTER UPDATE OF "attendance_status", "finalized_at" ON "public"."attendance_records" FOR EACH ROW EXECUTE FUNCTION "private"."notify_attendance_finalization"();



CREATE OR REPLACE TRIGGER "notify_feedback_task_after_insert" AFTER INSERT ON "public"."event_feedback_tasks" FOR EACH ROW EXECUTE FUNCTION "private"."notify_feedback_task_created"();



CREATE OR REPLACE TRIGGER "notify_profile_account_status_after_update" AFTER UPDATE OF "account_status" ON "public"."profiles" FOR EACH ROW EXECUTE FUNCTION "private"."notify_profile_account_status_change"();



CREATE OR REPLACE TRIGGER "notify_student_event_change_after_insert" AFTER INSERT ON "public"."events" FOR EACH ROW EXECUTE FUNCTION "private"."notify_student_event_change"();



CREATE OR REPLACE TRIGGER "notify_student_event_change_after_update" AFTER UPDATE OF "approval_status", "event_status", "starts_at", "ends_at", "venue" ON "public"."events" FOR EACH ROW EXECUTE FUNCTION "private"."notify_student_event_change"();



CREATE OR REPLACE TRIGGER "notify_student_event_invitation_after_insert" AFTER INSERT ON "public"."event_participants" FOR EACH ROW EXECUTE FUNCTION "private"."notify_student_event_invitation"();



CREATE OR REPLACE TRIGGER "notify_student_event_invitation_after_update" AFTER UPDATE OF "participant_status" ON "public"."event_participants" FOR EACH ROW WHEN ((("old"."participant_status" = 'removed'::"text") AND ("new"."participant_status" <> 'removed'::"text"))) EXECUTE FUNCTION "private"."notify_student_event_invitation"();



CREATE OR REPLACE TRIGGER "on_feedback_changed" AFTER INSERT OR DELETE OR UPDATE ON "public"."event_feedback" FOR EACH ROW EXECUTE FUNCTION "public"."recalculate_feedback_analytics"();



CREATE OR REPLACE TRIGGER "on_feedback_rating_changed" AFTER INSERT OR DELETE OR UPDATE ON "public"."event_feedback_ratings" FOR EACH ROW EXECUTE FUNCTION "public"."recalculate_feedback_analytics"();



CREATE OR REPLACE TRIGGER "propagate_department_branding_to_organizers" AFTER UPDATE OF "department_name", "brand_name_override", "logo_path" ON "public"."departments" FOR EACH ROW EXECUTE FUNCTION "private"."propagate_department_branding_to_organizers"();



CREATE OR REPLACE TRIGGER "queue_attendance_request_progress_email" AFTER UPDATE OF "request_status" ON "public"."attendance_requests" FOR EACH ROW EXECUTE FUNCTION "private"."queue_attendance_request_progress_email"();



CREATE OR REPLACE TRIGGER "queue_credential_request_progress_email" AFTER UPDATE OF "request_status" ON "public"."credential_requests" FOR EACH ROW EXECUTE FUNCTION "private"."queue_credential_request_progress_email"();



CREATE OR REPLACE TRIGGER "queue_event_email_after_participant_insert" AFTER INSERT ON "public"."event_participants" FOR EACH ROW EXECUTE FUNCTION "private"."queue_event_email_after_participant_insert"();



CREATE OR REPLACE TRIGGER "queue_event_email_after_participant_reactivated" AFTER UPDATE OF "participant_status" ON "public"."event_participants" FOR EACH ROW WHEN ((("old"."participant_status" = 'removed'::"text") AND ("new"."participant_status" <> 'removed'::"text"))) EXECUTE FUNCTION "private"."queue_event_email_after_participant_reactivated"();



CREATE OR REPLACE TRIGGER "queue_event_email_after_reschedule" AFTER UPDATE OF "starts_at", "ends_at", "venue" ON "public"."events" FOR EACH ROW EXECUTE FUNCTION "private"."queue_event_email_after_reschedule"();



CREATE OR REPLACE TRIGGER "require_finalized_attendance_for_correction" BEFORE INSERT OR UPDATE OF "attendance_record_id", "requested_status" ON "public"."attendance_requests" FOR EACH ROW EXECUTE FUNCTION "private"."require_finalized_attendance_for_correction"();



CREATE OR REPLACE TRIGGER "stamp_event_department_from_organizer" BEFORE INSERT OR UPDATE OF "organizer_id", "department_id" ON "public"."events" FOR EACH ROW EXECUTE FUNCTION "private"."stamp_event_department_from_organizer"();



CREATE OR REPLACE TRIGGER "suppress_student_attendance_exception" BEFORE INSERT ON "public"."notifications" FOR EACH ROW EXECUTE FUNCTION "private"."suppress_student_attendance_exception"();



CREATE OR REPLACE TRIGGER "sync_organizer_branding_from_department" BEFORE INSERT OR UPDATE OF "department_id", "organization_name", "college_logo_path" ON "public"."organizers" FOR EACH ROW EXECUTE FUNCTION "private"."sync_organizer_branding_from_department"();



ALTER TABLE ONLY "public"."admin_profiles"
    ADD CONSTRAINT "admin_profiles_department_id_fkey" FOREIGN KEY ("department_id") REFERENCES "public"."departments"("id") ON DELETE RESTRICT;



ALTER TABLE ONLY "public"."admin_profiles"
    ADD CONSTRAINT "admin_profiles_profile_id_fkey" FOREIGN KEY ("profile_id") REFERENCES "public"."profiles"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."attendance_late_reason_option_translations"
    ADD CONSTRAINT "attendance_late_reason_option_translations_option_id_fkey" FOREIGN KEY ("option_id") REFERENCES "public"."attendance_late_reason_options"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."attendance_records"
    ADD CONSTRAINT "attendance_records_event_session_id_fkey" FOREIGN KEY ("event_session_id") REFERENCES "public"."event_sessions"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."attendance_records"
    ADD CONSTRAINT "attendance_records_late_reason_option_id_fkey" FOREIGN KEY ("late_reason_option_id") REFERENCES "public"."attendance_late_reason_options"("id");



ALTER TABLE ONLY "public"."attendance_records"
    ADD CONSTRAINT "attendance_records_recorded_by_fkey" FOREIGN KEY ("recorded_by") REFERENCES "public"."profiles"("id") ON DELETE SET NULL;



ALTER TABLE ONLY "public"."attendance_records"
    ADD CONSTRAINT "attendance_records_student_id_fkey" FOREIGN KEY ("student_id") REFERENCES "public"."students"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."attendance_records"
    ADD CONSTRAINT "attendance_records_verification_attempt_id_fkey" FOREIGN KEY ("verification_attempt_id") REFERENCES "public"."verification_attempts"("id") ON DELETE SET NULL;



ALTER TABLE ONLY "public"."attendance_request_attachments"
    ADD CONSTRAINT "attendance_request_attachments_request_id_fkey" FOREIGN KEY ("request_id") REFERENCES "public"."attendance_requests"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."attendance_requests"
    ADD CONSTRAINT "attendance_requests_attendance_record_id_fkey" FOREIGN KEY ("attendance_record_id") REFERENCES "public"."attendance_records"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."attendance_requests"
    ADD CONSTRAINT "attendance_requests_reviewed_by_fkey" FOREIGN KEY ("reviewed_by") REFERENCES "public"."profiles"("id") ON DELETE SET NULL;



ALTER TABLE ONLY "public"."attendance_requests"
    ADD CONSTRAINT "attendance_requests_student_id_fkey" FOREIGN KEY ("student_id") REFERENCES "public"."students"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."audit_logs"
    ADD CONSTRAINT "audit_logs_actor_user_id_fkey" FOREIGN KEY ("actor_user_id") REFERENCES "public"."profiles"("id") ON DELETE SET NULL;



ALTER TABLE ONLY "public"."credential_request_attachments"
    ADD CONSTRAINT "credential_request_attachments_request_id_fkey" FOREIGN KEY ("request_id") REFERENCES "public"."credential_requests"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."credential_requests"
    ADD CONSTRAINT "credential_requests_reviewed_by_fkey" FOREIGN KEY ("reviewed_by") REFERENCES "public"."profiles"("id") ON DELETE SET NULL;



ALTER TABLE ONLY "public"."credential_requests"
    ADD CONSTRAINT "credential_requests_student_id_fkey" FOREIGN KEY ("student_id") REFERENCES "public"."students"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."event_email_outbox"
    ADD CONSTRAINT "event_email_outbox_event_id_fkey" FOREIGN KEY ("event_id") REFERENCES "public"."events"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."event_email_outbox"
    ADD CONSTRAINT "event_email_outbox_recipient_profile_id_fkey" FOREIGN KEY ("recipient_profile_id") REFERENCES "public"."profiles"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."event_feedback"
    ADD CONSTRAINT "event_feedback_attendance_record_id_fkey" FOREIGN KEY ("attendance_record_id") REFERENCES "public"."attendance_records"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."event_feedback"
    ADD CONSTRAINT "event_feedback_event_id_fkey" FOREIGN KEY ("event_id") REFERENCES "public"."events"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."event_feedback_ratings"
    ADD CONSTRAINT "event_feedback_ratings_feedback_id_fkey" FOREIGN KEY ("feedback_id") REFERENCES "public"."event_feedback"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."event_feedback_ratings"
    ADD CONSTRAINT "event_feedback_ratings_objective_id_fkey" FOREIGN KEY ("objective_id") REFERENCES "public"."event_objectives"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."event_feedback"
    ADD CONSTRAINT "event_feedback_student_id_fkey" FOREIGN KEY ("student_id") REFERENCES "public"."students"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."event_feedback_task_objectives"
    ADD CONSTRAINT "event_feedback_task_objectives_objective_id_fkey" FOREIGN KEY ("objective_id") REFERENCES "public"."event_objectives"("id") ON DELETE RESTRICT;



ALTER TABLE ONLY "public"."event_feedback_task_objectives"
    ADD CONSTRAINT "event_feedback_task_objectives_task_id_fkey" FOREIGN KEY ("task_id") REFERENCES "public"."event_feedback_tasks"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."event_feedback_tasks"
    ADD CONSTRAINT "event_feedback_tasks_attendance_record_id_fkey" FOREIGN KEY ("attendance_record_id") REFERENCES "public"."attendance_records"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."event_feedback_tasks"
    ADD CONSTRAINT "event_feedback_tasks_event_id_fkey" FOREIGN KEY ("event_id") REFERENCES "public"."events"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."event_feedback_tasks"
    ADD CONSTRAINT "event_feedback_tasks_student_id_fkey" FOREIGN KEY ("student_id") REFERENCES "public"."students"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."event_objectives"
    ADD CONSTRAINT "event_objectives_event_id_fkey" FOREIGN KEY ("event_id") REFERENCES "public"."events"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."event_participants"
    ADD CONSTRAINT "event_participants_event_id_fkey" FOREIGN KEY ("event_id") REFERENCES "public"."events"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."event_participants"
    ADD CONSTRAINT "event_participants_student_id_fkey" FOREIGN KEY ("student_id") REFERENCES "public"."students"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."event_resources"
    ADD CONSTRAINT "event_resources_created_by_fkey" FOREIGN KEY ("created_by") REFERENCES "public"."profiles"("id") ON DELETE RESTRICT;



ALTER TABLE ONLY "public"."event_resources"
    ADD CONSTRAINT "event_resources_event_id_fkey" FOREIGN KEY ("event_id") REFERENCES "public"."events"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."event_sessions"
    ADD CONSTRAINT "event_sessions_created_by_fkey" FOREIGN KEY ("created_by") REFERENCES "public"."profiles"("id") ON DELETE RESTRICT;



ALTER TABLE ONLY "public"."event_sessions"
    ADD CONSTRAINT "event_sessions_event_id_fkey" FOREIGN KEY ("event_id") REFERENCES "public"."events"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."event_sessions"
    ADD CONSTRAINT "event_sessions_superseded_by_fkey" FOREIGN KEY ("superseded_by") REFERENCES "public"."event_sessions"("id") ON DELETE SET NULL;



ALTER TABLE ONLY "public"."event_summary_snapshots"
    ADD CONSTRAINT "event_summary_snapshots_event_id_fkey" FOREIGN KEY ("event_id") REFERENCES "public"."events"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."events"
    ADD CONSTRAINT "events_cancelled_by_fkey" FOREIGN KEY ("cancelled_by") REFERENCES "public"."profiles"("id") ON DELETE SET NULL;



ALTER TABLE ONLY "public"."events"
    ADD CONSTRAINT "events_category_id_fkey" FOREIGN KEY ("category_id") REFERENCES "public"."event_categories"("id") ON DELETE RESTRICT;



ALTER TABLE ONLY "public"."events"
    ADD CONSTRAINT "events_department_id_fkey" FOREIGN KEY ("department_id") REFERENCES "public"."departments"("id") ON DELETE SET NULL;



ALTER TABLE ONLY "public"."events"
    ADD CONSTRAINT "events_organizer_id_fkey" FOREIGN KEY ("organizer_id") REFERENCES "public"."organizers"("id") ON DELETE RESTRICT;



ALTER TABLE ONLY "public"."events"
    ADD CONSTRAINT "events_published_by_fkey" FOREIGN KEY ("published_by") REFERENCES "public"."profiles"("id") ON DELETE SET NULL;



ALTER TABLE ONLY "public"."facial_enrollment_history"
    ADD CONSTRAINT "facial_enrollment_history_created_by_fkey" FOREIGN KEY ("created_by") REFERENCES "public"."profiles"("id") ON DELETE RESTRICT;



ALTER TABLE ONLY "public"."facial_enrollment_history"
    ADD CONSTRAINT "facial_enrollment_history_credential_request_id_fkey" FOREIGN KEY ("credential_request_id") REFERENCES "public"."credential_requests"("id") ON DELETE SET NULL;



ALTER TABLE ONLY "public"."facial_enrollment_history"
    ADD CONSTRAINT "facial_enrollment_history_student_id_fkey" FOREIGN KEY ("student_id") REFERENCES "public"."students"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."facial_profiles"
    ADD CONSTRAINT "facial_profiles_student_id_fkey" FOREIGN KEY ("student_id") REFERENCES "public"."students"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."generated_reports"
    ADD CONSTRAINT "generated_reports_generated_by_fkey" FOREIGN KEY ("generated_by") REFERENCES "public"."profiles"("id") ON DELETE RESTRICT;



ALTER TABLE ONLY "public"."legal_acceptances"
    ADD CONSTRAINT "legal_acceptances_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "auth"."users"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."legal_documents"
    ADD CONSTRAINT "legal_documents_updated_by_fkey" FOREIGN KEY ("updated_by") REFERENCES "auth"."users"("id");



ALTER TABLE ONLY "public"."ml_predictions"
    ADD CONSTRAINT "ml_predictions_event_id_fkey" FOREIGN KEY ("event_id") REFERENCES "public"."events"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."ml_predictions"
    ADD CONSTRAINT "ml_predictions_student_id_fkey" FOREIGN KEY ("student_id") REFERENCES "public"."students"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."notification_preferences"
    ADD CONSTRAINT "notification_preferences_profile_id_fkey" FOREIGN KEY ("profile_id") REFERENCES "public"."profiles"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."notifications"
    ADD CONSTRAINT "notifications_recipient_id_fkey" FOREIGN KEY ("recipient_id") REFERENCES "public"."profiles"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."organizers"
    ADD CONSTRAINT "organizers_department_id_fkey" FOREIGN KEY ("department_id") REFERENCES "public"."departments"("id") ON DELETE SET NULL;



ALTER TABLE ONLY "public"."organizers"
    ADD CONSTRAINT "organizers_profile_id_fkey" FOREIGN KEY ("profile_id") REFERENCES "public"."profiles"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."profiles"
    ADD CONSTRAINT "profiles_department_id_fkey" FOREIGN KEY ("department_id") REFERENCES "public"."departments"("id") ON DELETE SET NULL;



ALTER TABLE ONLY "public"."profiles"
    ADD CONSTRAINT "profiles_id_fkey" FOREIGN KEY ("id") REFERENCES "auth"."users"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."programs"
    ADD CONSTRAINT "programs_department_id_fkey" FOREIGN KEY ("department_id") REFERENCES "public"."departments"("id") ON DELETE RESTRICT;



ALTER TABLE ONLY "public"."qr_credentials"
    ADD CONSTRAINT "qr_credentials_student_id_fkey" FOREIGN KEY ("student_id") REFERENCES "public"."students"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."request_email_outbox"
    ADD CONSTRAINT "request_email_outbox_recipient_profile_id_fkey" FOREIGN KEY ("recipient_profile_id") REFERENCES "public"."profiles"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."sections"
    ADD CONSTRAINT "sections_program_id_fkey" FOREIGN KEY ("program_id") REFERENCES "public"."programs"("id") ON DELETE RESTRICT;



ALTER TABLE ONLY "public"."student_face_embeddings"
    ADD CONSTRAINT "student_face_embeddings_student_id_fkey" FOREIGN KEY ("student_id") REFERENCES "public"."students"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."students"
    ADD CONSTRAINT "students_department_id_fkey" FOREIGN KEY ("department_id") REFERENCES "public"."departments"("id") ON DELETE RESTRICT;



ALTER TABLE ONLY "public"."students"
    ADD CONSTRAINT "students_profile_id_fkey" FOREIGN KEY ("profile_id") REFERENCES "public"."profiles"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."students"
    ADD CONSTRAINT "students_program_id_fkey" FOREIGN KEY ("program_id") REFERENCES "public"."programs"("id") ON DELETE RESTRICT;



ALTER TABLE ONLY "public"."students"
    ADD CONSTRAINT "students_section_id_fkey" FOREIGN KEY ("section_id") REFERENCES "public"."sections"("id") ON DELETE RESTRICT;



ALTER TABLE ONLY "public"."system_settings"
    ADD CONSTRAINT "system_settings_current_semester_id_fkey" FOREIGN KEY ("current_semester_id") REFERENCES "public"."semesters"("id") ON DELETE SET NULL;



ALTER TABLE ONLY "public"."system_settings"
    ADD CONSTRAINT "system_settings_updated_by_fkey" FOREIGN KEY ("updated_by") REFERENCES "public"."profiles"("id") ON DELETE SET NULL;



ALTER TABLE ONLY "public"."verification_attempts"
    ADD CONSTRAINT "verification_attempts_event_session_id_fkey" FOREIGN KEY ("event_session_id") REFERENCES "public"."event_sessions"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."verification_attempts"
    ADD CONSTRAINT "verification_attempts_facial_profile_id_fkey" FOREIGN KEY ("facial_profile_id") REFERENCES "public"."facial_profiles"("id") ON DELETE SET NULL;



ALTER TABLE ONLY "public"."verification_attempts"
    ADD CONSTRAINT "verification_attempts_qr_credential_id_fkey" FOREIGN KEY ("qr_credential_id") REFERENCES "public"."qr_credentials"("id") ON DELETE SET NULL;



ALTER TABLE ONLY "public"."verification_attempts"
    ADD CONSTRAINT "verification_attempts_student_id_fkey" FOREIGN KEY ("student_id") REFERENCES "public"."students"("id") ON DELETE SET NULL;



CREATE POLICY "Students can record their own legal acceptances" ON "public"."legal_acceptances" FOR INSERT TO "authenticated" WITH CHECK (((( SELECT "auth"."uid"() AS "uid") = "user_id") AND (EXISTS ( SELECT 1
   FROM "public"."profiles"
  WHERE (("profiles"."id" = ( SELECT "auth"."uid"() AS "uid")) AND ("profiles"."role" = 'student'::"text"))))));



CREATE POLICY "Students can view their own legal acceptances" ON "public"."legal_acceptances" FOR SELECT TO "authenticated" USING (((( SELECT "auth"."uid"() AS "uid") = "user_id") AND (EXISTS ( SELECT 1
   FROM "public"."profiles"
  WHERE (("profiles"."id" = ( SELECT "auth"."uid"() AS "uid")) AND ("profiles"."role" = 'student'::"text"))))));



ALTER TABLE "public"."admin_profiles" ENABLE ROW LEVEL SECURITY;


CREATE POLICY "admin_profiles_update_admin" ON "public"."admin_profiles" FOR UPDATE TO "authenticated" USING ((EXISTS ( SELECT 1
   FROM "public"."profiles" "p"
  WHERE (("p"."id" = ( SELECT "auth"."uid"() AS "uid")) AND ("p"."role" = 'admin'::"text") AND ("p"."account_status" = 'active'::"text"))))) WITH CHECK ((EXISTS ( SELECT 1
   FROM "public"."profiles" "p"
  WHERE (("p"."id" = ( SELECT "auth"."uid"() AS "uid")) AND ("p"."role" = 'admin'::"text") AND ("p"."account_status" = 'active'::"text")))));



CREATE POLICY "attendance_attachments_delete_self" ON "public"."attendance_request_attachments" FOR DELETE TO "authenticated" USING ((EXISTS ( SELECT 1
   FROM "public"."attendance_requests"
  WHERE (("attendance_requests"."id" = "attendance_request_attachments"."request_id") AND ("attendance_requests"."student_id" = ( SELECT "private"."current_student_id"() AS "current_student_id")) AND ("attendance_requests"."request_status" = 'pending'::"text")))));



CREATE POLICY "attendance_attachments_insert_self" ON "public"."attendance_request_attachments" FOR INSERT TO "authenticated" WITH CHECK ((EXISTS ( SELECT 1
   FROM "public"."attendance_requests"
  WHERE (("attendance_requests"."id" = "attendance_request_attachments"."request_id") AND ("attendance_requests"."student_id" = ( SELECT "private"."current_student_id"() AS "current_student_id")) AND ("attendance_requests"."request_status" = 'pending'::"text")))));



CREATE POLICY "attendance_attachments_read" ON "public"."attendance_request_attachments" FOR SELECT TO "authenticated" USING ((EXISTS ( SELECT 1
   FROM ((("public"."attendance_requests" "request"
     JOIN "public"."attendance_records" "record" ON (("record"."id" = "request"."attendance_record_id")))
     JOIN "public"."event_sessions" "session" ON (("session"."id" = "record"."event_session_id")))
     JOIN "public"."events" "event" ON (("event"."id" = "session"."event_id")))
  WHERE (("request"."id" = "attendance_request_attachments"."request_id") AND (("request"."student_id" = ( SELECT "private"."current_student_id"() AS "current_student_id")) OR ("event"."organizer_id" = ( SELECT "private"."current_organizer_id"() AS "current_organizer_id")))))));



ALTER TABLE "public"."attendance_late_reason_option_translations" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."attendance_late_reason_options" ENABLE ROW LEVEL SECURITY;


CREATE POLICY "attendance_late_reason_options_read" ON "public"."attendance_late_reason_options" FOR SELECT TO "authenticated" USING ((( SELECT "private"."is_active_user"() AS "is_active_user") AND ("is_active" OR ( SELECT "private"."is_active_organizer"() AS "is_active_organizer"))));



CREATE POLICY "attendance_late_reason_translations_read" ON "public"."attendance_late_reason_option_translations" FOR SELECT TO "authenticated" USING ((( SELECT "private"."is_active_user"() AS "is_active_user") AND (EXISTS ( SELECT 1
   FROM "public"."attendance_late_reason_options" "opt"
  WHERE (("opt"."id" = "attendance_late_reason_option_translations"."option_id") AND ("opt"."is_active" OR ( SELECT "private"."is_active_organizer"() AS "is_active_organizer")))))));



ALTER TABLE "public"."attendance_records" ENABLE ROW LEVEL SECURITY;


CREATE POLICY "attendance_records_insert_owner" ON "public"."attendance_records" FOR INSERT TO "authenticated" WITH CHECK ((EXISTS ( SELECT 1
   FROM ("public"."event_sessions"
     JOIN "public"."events" ON (("events"."id" = "event_sessions"."event_id")))
  WHERE (("event_sessions"."id" = "attendance_records"."event_session_id") AND ("events"."organizer_id" = ( SELECT "private"."current_organizer_id"() AS "current_organizer_id"))))));



CREATE POLICY "attendance_records_update_owner" ON "public"."attendance_records" FOR UPDATE TO "authenticated" USING ((EXISTS ( SELECT 1
   FROM ("public"."event_sessions"
     JOIN "public"."events" ON (("events"."id" = "event_sessions"."event_id")))
  WHERE (("event_sessions"."id" = "attendance_records"."event_session_id") AND ("events"."organizer_id" = ( SELECT "private"."current_organizer_id"() AS "current_organizer_id")))))) WITH CHECK ((EXISTS ( SELECT 1
   FROM ("public"."event_sessions"
     JOIN "public"."events" ON (("events"."id" = "event_sessions"."event_id")))
  WHERE (("event_sessions"."id" = "attendance_records"."event_session_id") AND ("events"."organizer_id" = ( SELECT "private"."current_organizer_id"() AS "current_organizer_id"))))));



ALTER TABLE "public"."attendance_request_attachments" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."attendance_requests" ENABLE ROW LEVEL SECURITY;


CREATE POLICY "attendance_requests_insert_self" ON "public"."attendance_requests" FOR INSERT TO "authenticated" WITH CHECK (("student_id" = ( SELECT "private"."current_student_id"() AS "current_student_id")));



CREATE POLICY "attendance_requests_read" ON "public"."attendance_requests" FOR SELECT TO "authenticated" USING ((("student_id" = ( SELECT "private"."current_student_id"() AS "current_student_id")) OR (EXISTS ( SELECT 1
   FROM (("public"."attendance_records"
     JOIN "public"."event_sessions" ON (("event_sessions"."id" = "attendance_records"."event_session_id")))
     JOIN "public"."events" ON (("events"."id" = "event_sessions"."event_id")))
  WHERE (("attendance_records"."id" = "attendance_requests"."attendance_record_id") AND ("events"."organizer_id" = ( SELECT "private"."current_organizer_id"() AS "current_organizer_id")))))));



CREATE POLICY "attendance_requests_update_organizer" ON "public"."attendance_requests" FOR UPDATE TO "authenticated" USING ((EXISTS ( SELECT 1
   FROM (("public"."attendance_records"
     JOIN "public"."event_sessions" ON (("event_sessions"."id" = "attendance_records"."event_session_id")))
     JOIN "public"."events" ON (("events"."id" = "event_sessions"."event_id")))
  WHERE (("attendance_records"."id" = "attendance_requests"."attendance_record_id") AND ("events"."organizer_id" = ( SELECT "private"."current_organizer_id"() AS "current_organizer_id")))))) WITH CHECK ((EXISTS ( SELECT 1
   FROM (("public"."attendance_records"
     JOIN "public"."event_sessions" ON (("event_sessions"."id" = "attendance_records"."event_session_id")))
     JOIN "public"."events" ON (("events"."id" = "event_sessions"."event_id")))
  WHERE (("attendance_records"."id" = "attendance_requests"."attendance_record_id") AND ("events"."organizer_id" = ( SELECT "private"."current_organizer_id"() AS "current_organizer_id"))))));



ALTER TABLE "public"."audit_logs" ENABLE ROW LEVEL SECURITY;


CREATE POLICY "authenticated_select_admin_profiles" ON "public"."admin_profiles" FOR SELECT TO "authenticated" USING ((( SELECT "private"."is_active_admin"() AS "is_active_admin") OR (("profile_id" = ( SELECT "auth"."uid"() AS "uid")) AND ( SELECT "private"."is_active_department_admin"() AS "is_active_department_admin")) OR ( SELECT "private"."is_active_admin"() AS "is_active_admin")));



CREATE POLICY "authenticated_select_attendance_records" ON "public"."attendance_records" FOR SELECT TO "authenticated" USING ((( SELECT "private"."is_active_admin"() AS "is_active_admin") OR ( SELECT "private"."is_active_admin"() AS "is_active_admin") OR (("student_id" = ( SELECT "private"."current_student_id"() AS "current_student_id")) OR (EXISTS ( SELECT 1
   FROM ("public"."event_sessions" "es"
     JOIN "public"."events" "e" ON (("e"."id" = "es"."event_id")))
  WHERE (("es"."id" = "attendance_records"."event_session_id") AND (("e"."organizer_id" = ( SELECT "private"."current_organizer_id"() AS "current_organizer_id")) OR (( SELECT "private"."is_active_department_admin"() AS "is_active_department_admin") AND ("e"."department_id" = ( SELECT "private"."current_department_id"() AS "current_department_id"))))))))));



CREATE POLICY "authenticated_select_audit_logs" ON "public"."audit_logs" FOR SELECT TO "authenticated" USING ((( SELECT "private"."is_active_admin"() AS "is_active_admin") OR (( SELECT "private"."is_active_organizer"() AS "is_active_organizer") OR (EXISTS ( SELECT 1
   FROM "public"."profiles"
  WHERE (("profiles"."id" = ( SELECT "auth"."uid"() AS "uid")) AND ("profiles"."role" = 'admin'::"text") AND ("profiles"."account_status" = 'active'::"text"))))) OR (( SELECT "private"."is_active_department_admin"() AS "is_active_department_admin") AND (( SELECT "private"."current_department_id"() AS "current_department_id") IS NOT NULL) AND (("actor_user_id" = ( SELECT "auth"."uid"() AS "uid")) OR (EXISTS ( SELECT 1
   FROM "public"."organizers" "organizer"
  WHERE (("organizer"."profile_id" = "audit_logs"."actor_user_id") AND ("organizer"."department_id" = ( SELECT "private"."current_department_id"() AS "current_department_id"))))) OR (EXISTS ( SELECT 1
   FROM "public"."students" "student"
  WHERE (("student"."profile_id" = "audit_logs"."actor_user_id") AND ("student"."department_id" = ( SELECT "private"."current_department_id"() AS "current_department_id")))))))));



CREATE POLICY "authenticated_select_credential_requests" ON "public"."credential_requests" FOR SELECT TO "authenticated" USING ((( SELECT "private"."is_active_admin"() AS "is_active_admin") OR (("student_id" = ( SELECT "private"."current_student_id"() AS "current_student_id")) OR ( SELECT "private"."organizer_can_access_student"("credential_requests"."student_id") AS "organizer_can_access_student"))));



CREATE POLICY "authenticated_select_departments" ON "public"."departments" FOR SELECT TO "authenticated" USING ((( SELECT "private"."is_active_admin"() AS "is_active_admin") OR (( SELECT "private"."is_active_user"() AS "is_active_user") AND ((NOT ( SELECT "private"."is_active_department_admin"() AS "is_active_department_admin")) OR ("id" = ( SELECT "private"."current_department_id"() AS "current_department_id")))) OR ( SELECT "private"."is_active_user"() AS "is_active_user")));



CREATE POLICY "authenticated_select_event_categories" ON "public"."event_categories" FOR SELECT TO "authenticated" USING ((( SELECT "private"."is_active_admin"() AS "is_active_admin") OR ( SELECT "private"."is_active_user"() AS "is_active_user") OR ( SELECT "private"."is_active_user"() AS "is_active_user")));



CREATE POLICY "authenticated_select_event_email_outbox" ON "public"."event_email_outbox" FOR SELECT TO "authenticated" USING ((( SELECT "private"."is_active_admin"() AS "is_active_admin") OR (( SELECT "private"."is_active_department_admin"() AS "is_active_department_admin") AND (EXISTS ( SELECT 1
   FROM "public"."events" "e"
  WHERE (("e"."id" = "event_email_outbox"."event_id") AND ("e"."department_id" = ( SELECT "private"."current_department_id"() AS "current_department_id")))))) OR (("event_id" IN ( SELECT "e"."id"
   FROM "public"."events" "e"
  WHERE ("e"."organizer_id" IN ( SELECT "o"."id"
           FROM "public"."organizers" "o"
          WHERE ("o"."profile_id" = ( SELECT "auth"."uid"() AS "uid")))))) OR ("recipient_profile_id" = ( SELECT "auth"."uid"() AS "uid")))));



CREATE POLICY "authenticated_select_event_feedback" ON "public"."event_feedback" FOR SELECT TO "authenticated" USING ((( SELECT "private"."is_active_admin"() AS "is_active_admin") OR ( SELECT "private"."is_active_admin"() AS "is_active_admin") OR (("student_id" = ( SELECT "private"."current_student_id"() AS "current_student_id")) OR (EXISTS ( SELECT 1
   FROM "public"."events"
  WHERE (("events"."id" = "event_feedback"."event_id") AND ("events"."organizer_id" = ( SELECT "private"."current_organizer_id"() AS "current_organizer_id"))))))));



CREATE POLICY "authenticated_select_event_feedback_ratings" ON "public"."event_feedback_ratings" FOR SELECT TO "authenticated" USING ((( SELECT "private"."is_active_admin"() AS "is_active_admin") OR ( SELECT "private"."is_active_admin"() AS "is_active_admin") OR (EXISTS ( SELECT 1
   FROM ("public"."event_feedback"
     JOIN "public"."events" ON (("events"."id" = "event_feedback"."event_id")))
  WHERE (("event_feedback"."id" = "event_feedback_ratings"."feedback_id") AND (("event_feedback"."student_id" = ( SELECT "private"."current_student_id"() AS "current_student_id")) OR ("events"."organizer_id" = ( SELECT "private"."current_organizer_id"() AS "current_organizer_id"))))))));



CREATE POLICY "authenticated_select_event_feedback_task_objectives" ON "public"."event_feedback_task_objectives" FOR SELECT TO "authenticated" USING ((( SELECT "private"."is_active_admin"() AS "is_active_admin") OR ( SELECT "private"."is_active_admin"() AS "is_active_admin") OR (EXISTS ( SELECT 1
   FROM "public"."event_feedback_tasks" "task"
  WHERE (("task"."id" = "event_feedback_task_objectives"."task_id") AND (("task"."student_id" = ( SELECT "private"."current_student_id"() AS "current_student_id")) OR (EXISTS ( SELECT 1
           FROM "public"."events" "e"
          WHERE (("e"."id" = "task"."event_id") AND ("e"."organizer_id" = ( SELECT "private"."current_organizer_id"() AS "current_organizer_id")))))))))));



CREATE POLICY "authenticated_select_event_feedback_tasks" ON "public"."event_feedback_tasks" FOR SELECT TO "authenticated" USING ((( SELECT "private"."is_active_admin"() AS "is_active_admin") OR ( SELECT "private"."is_active_admin"() AS "is_active_admin") OR (("student_id" = ( SELECT "private"."current_student_id"() AS "current_student_id")) OR (EXISTS ( SELECT 1
   FROM "public"."events" "e"
  WHERE (("e"."id" = "event_feedback_tasks"."event_id") AND ("e"."organizer_id" = ( SELECT "private"."current_organizer_id"() AS "current_organizer_id"))))))));



CREATE POLICY "authenticated_select_event_objectives" ON "public"."event_objectives" FOR SELECT TO "authenticated" USING ((( SELECT "private"."is_active_admin"() AS "is_active_admin") OR ( SELECT "private"."is_active_admin"() AS "is_active_admin") OR (EXISTS ( SELECT 1
   FROM "public"."events"
  WHERE (("events"."id" = "event_objectives"."event_id") AND (("events"."approval_status" = 'approved'::"text") OR ("events"."organizer_id" = ( SELECT "private"."current_organizer_id"() AS "current_organizer_id"))))))));



CREATE POLICY "authenticated_select_event_participants" ON "public"."event_participants" FOR SELECT TO "authenticated" USING ((( SELECT "private"."is_active_admin"() AS "is_active_admin") OR ( SELECT "private"."is_active_admin"() AS "is_active_admin") OR (("student_id" = ( SELECT "private"."current_student_id"() AS "current_student_id")) OR (EXISTS ( SELECT 1
   FROM "public"."events" "e"
  WHERE (("e"."id" = "event_participants"."event_id") AND (("e"."organizer_id" = ( SELECT "private"."current_organizer_id"() AS "current_organizer_id")) OR (( SELECT "private"."is_active_department_admin"() AS "is_active_department_admin") AND ("e"."department_id" = ( SELECT "private"."current_department_id"() AS "current_department_id"))))))))));



CREATE POLICY "authenticated_select_event_resources" ON "public"."event_resources" FOR SELECT TO "authenticated" USING ((( SELECT "private"."is_active_admin"() AS "is_active_admin") OR ( SELECT "private"."is_active_admin"() AS "is_active_admin") OR (EXISTS ( SELECT 1
   FROM "public"."events" "e"
  WHERE (("e"."id" = "event_resources"."event_id") AND (("e"."organizer_id" = ( SELECT "private"."current_organizer_id"() AS "current_organizer_id")) OR (("e"."approval_status" = 'approved'::"text") AND ("e"."event_status" <> 'draft'::"text") AND ( SELECT "private"."is_current_student_event_participant"("e"."id") AS "is_current_student_event_participant"))))))));



CREATE POLICY "authenticated_select_event_sessions" ON "public"."event_sessions" FOR SELECT TO "authenticated" USING ((( SELECT "private"."is_active_admin"() AS "is_active_admin") OR ( SELECT "private"."is_active_admin"() AS "is_active_admin") OR (EXISTS ( SELECT 1
   FROM "public"."events" "e"
  WHERE (("e"."id" = "event_sessions"."event_id") AND ((( SELECT "private"."is_active_department_admin"() AS "is_active_department_admin") AND ("e"."department_id" = ( SELECT "private"."current_department_id"() AS "current_department_id"))) OR ((( SELECT "private"."is_active_department_admin"() AS "is_active_department_admin") IS FALSE) AND (("e"."approval_status" = 'approved'::"text") OR ("e"."organizer_id" = ( SELECT "private"."current_organizer_id"() AS "current_organizer_id"))))))))));



CREATE POLICY "authenticated_select_event_summary_snapshots" ON "public"."event_summary_snapshots" FOR SELECT TO "authenticated" USING ((( SELECT "private"."is_active_admin"() AS "is_active_admin") OR ( SELECT "private"."is_active_admin"() AS "is_active_admin") OR (EXISTS ( SELECT 1
   FROM "public"."events"
  WHERE (("events"."id" = "event_summary_snapshots"."event_id") AND (("events"."organizer_id" = ( SELECT "private"."current_organizer_id"() AS "current_organizer_id")) OR ((( SELECT "private"."current_student_id"() AS "current_student_id") IS NOT NULL) AND ("events"."approval_status" = 'approved'::"text") AND ("events"."event_status" <> 'draft'::"text") AND (("events"."visibility" = 'public'::"text") OR ( SELECT "private"."is_current_student_event_participant"("events"."id") AS "is_current_student_event_participant")))))))));



CREATE POLICY "authenticated_select_events" ON "public"."events" FOR SELECT TO "authenticated" USING ((( SELECT "private"."is_active_admin"() AS "is_active_admin") OR ( SELECT "private"."is_active_admin"() AS "is_active_admin") OR (( SELECT "private"."is_active_user"() AS "is_active_user") AND (("organizer_id" = ( SELECT "private"."current_organizer_id"() AS "current_organizer_id")) OR (( SELECT "private"."is_active_department_admin"() AS "is_active_department_admin") AND ("department_id" = ( SELECT "private"."current_department_id"() AS "current_department_id"))) OR ((( SELECT "private"."current_student_id"() AS "current_student_id") IS NOT NULL) AND ("approval_status" = 'approved'::"text") AND ("event_status" <> 'draft'::"text") AND (("visibility" = 'public'::"text") OR ( SELECT "private"."is_current_student_event_participant"("events"."id") AS "is_current_student_event_participant")))))));



CREATE POLICY "authenticated_select_facial_profiles" ON "public"."facial_profiles" FOR SELECT TO "authenticated" USING (((( SELECT "private"."is_active_department_admin"() AS "is_active_department_admin") AND (EXISTS ( SELECT 1
   FROM "public"."students" "student"
  WHERE (("student"."id" = "facial_profiles"."student_id") AND ("student"."department_id" = ( SELECT "private"."current_department_id"() AS "current_department_id")))))) OR (("student_id" = ( SELECT "private"."current_student_id"() AS "current_student_id")) OR ( SELECT "private"."organizer_can_access_student"("facial_profiles"."student_id") AS "organizer_can_access_student"))));



CREATE POLICY "authenticated_select_generated_reports" ON "public"."generated_reports" FOR SELECT TO "authenticated" USING ((( SELECT "private"."is_active_admin"() AS "is_active_admin") OR ( SELECT "private"."is_active_admin"() AS "is_active_admin") OR (( SELECT "private"."is_active_department_admin"() AS "is_active_department_admin") AND (EXISTS ( SELECT 1
   FROM "public"."organizers" "o"
  WHERE (("o"."profile_id" = "generated_reports"."generated_by") AND ("o"."department_id" = ( SELECT "private"."current_department_id"() AS "current_department_id")))))) OR (("generated_by" = ( SELECT "auth"."uid"() AS "uid")) AND ( SELECT "private"."is_active_organizer"() AS "is_active_organizer"))));



CREATE POLICY "authenticated_select_ml_predictions" ON "public"."ml_predictions" FOR SELECT TO "authenticated" USING ((( SELECT "private"."is_active_admin"() AS "is_active_admin") OR ( SELECT "private"."is_active_admin"() AS "is_active_admin") OR (("student_id" = ( SELECT "private"."current_student_id"() AS "current_student_id")) OR (EXISTS ( SELECT 1
   FROM "public"."events"
  WHERE (("events"."id" = "ml_predictions"."event_id") AND ("events"."organizer_id" = ( SELECT "private"."current_organizer_id"() AS "current_organizer_id"))))))));



CREATE POLICY "authenticated_select_notifications" ON "public"."notifications" FOR SELECT TO "authenticated" USING ((( SELECT "private"."is_active_admin"() AS "is_active_admin") OR (("recipient_id" = ( SELECT "auth"."uid"() AS "uid")) AND ( SELECT "private"."is_active_user"() AS "is_active_user"))));



CREATE POLICY "authenticated_select_organizers" ON "public"."organizers" FOR SELECT TO "authenticated" USING ((( SELECT "private"."is_active_admin"() AS "is_active_admin") OR ((("profile_id" = ( SELECT "auth"."uid"() AS "uid")) AND ( SELECT "private"."is_active_user"() AS "is_active_user")) OR ( SELECT "private"."is_active_admin"() AS "is_active_admin") OR (( SELECT "private"."is_active_department_admin"() AS "is_active_department_admin") AND ("department_id" = ( SELECT "private"."current_department_id"() AS "current_department_id"))))));



CREATE POLICY "authenticated_select_profiles" ON "public"."profiles" FOR SELECT TO "authenticated" USING ((( SELECT "private"."is_active_admin"() AS "is_active_admin") OR ((("id" = ( SELECT "auth"."uid"() AS "uid")) AND ( SELECT "private"."is_active_user"() AS "is_active_user")) OR ( SELECT "private"."is_active_admin"() AS "is_active_admin") OR (EXISTS ( SELECT 1
   FROM "public"."students" "s"
  WHERE (("s"."profile_id" = "profiles"."id") AND ( SELECT "private"."organizer_can_access_student"("s"."id") AS "organizer_can_access_student")))) OR (("role" = 'organizer'::"text") AND ("account_status" = 'active'::"text") AND ("department_id" = ( SELECT "private"."current_organizer_department_id"() AS "current_organizer_department_id")) AND ( SELECT "private"."is_active_organizer"() AS "is_active_organizer"))) OR (( SELECT "private"."is_active_department_admin"() AS "is_active_department_admin") AND (EXISTS ( SELECT 1
   FROM "public"."organizers" "o"
  WHERE (("o"."profile_id" = "profiles"."id") AND ("o"."department_id" = ( SELECT "private"."current_department_id"() AS "current_department_id")))))) OR (( SELECT "private"."is_active_department_admin"() AS "is_active_department_admin") AND (EXISTS ( SELECT 1
   FROM "public"."students" "s"
  WHERE (("s"."profile_id" = "profiles"."id") AND ("s"."department_id" = ( SELECT "private"."current_department_id"() AS "current_department_id"))))))));



CREATE POLICY "authenticated_select_programs" ON "public"."programs" FOR SELECT TO "authenticated" USING ((( SELECT "private"."is_active_admin"() AS "is_active_admin") OR (( SELECT "private"."is_active_user"() AS "is_active_user") AND (NOT ( SELECT "private"."is_active_department_admin"() AS "is_active_department_admin"))) OR (( SELECT "private"."is_active_department_admin"() AS "is_active_department_admin") AND ("department_id" = ( SELECT "private"."current_department_id"() AS "current_department_id")))));



CREATE POLICY "authenticated_select_qr_credentials" ON "public"."qr_credentials" FOR SELECT TO "authenticated" USING ((( SELECT "private"."is_active_admin"() AS "is_active_admin") OR (( SELECT "private"."is_active_department_admin"() AS "is_active_department_admin") AND (EXISTS ( SELECT 1
   FROM "public"."students" "student"
  WHERE (("student"."id" = "qr_credentials"."student_id") AND ("student"."department_id" = ( SELECT "private"."current_department_id"() AS "current_department_id")))))) OR (("student_id" = ( SELECT "private"."current_student_id"() AS "current_student_id")) OR ( SELECT "private"."organizer_can_access_student"("qr_credentials"."student_id") AS "organizer_can_access_student"))));



CREATE POLICY "authenticated_select_request_email_outbox" ON "public"."request_email_outbox" FOR SELECT TO "authenticated" USING ((( SELECT "private"."is_active_admin"() AS "is_active_admin") OR ("recipient_profile_id" = ( SELECT "auth"."uid"() AS "uid")) OR ("recipient_profile_id" = ( SELECT "auth"."uid"() AS "uid"))));



CREATE POLICY "authenticated_select_sections" ON "public"."sections" FOR SELECT TO "authenticated" USING ((( SELECT "private"."is_active_admin"() AS "is_active_admin") OR (( SELECT "private"."is_active_user"() AS "is_active_user") AND (NOT ( SELECT "private"."is_active_department_admin"() AS "is_active_department_admin"))) OR (( SELECT "private"."is_active_department_admin"() AS "is_active_department_admin") AND (EXISTS ( SELECT 1
   FROM "public"."programs" "p"
  WHERE (("p"."id" = "sections"."program_id") AND ("p"."department_id" = ( SELECT "private"."current_department_id"() AS "current_department_id"))))))));



CREATE POLICY "authenticated_select_semesters" ON "public"."semesters" FOR SELECT TO "authenticated" USING ((( SELECT "private"."is_active_admin"() AS "is_active_admin") OR ( SELECT "private"."is_active_user"() AS "is_active_user")));



CREATE POLICY "authenticated_select_students" ON "public"."students" FOR SELECT TO "authenticated" USING ((( SELECT "private"."is_active_admin"() AS "is_active_admin") OR ((("profile_id" = ( SELECT "auth"."uid"() AS "uid")) AND ( SELECT "private"."is_active_user"() AS "is_active_user")) OR ( SELECT "private"."organizer_can_access_student"("students"."id") AS "organizer_can_access_student") OR (( SELECT "private"."is_active_department_admin"() AS "is_active_department_admin") AND ("department_id" = ( SELECT "private"."current_department_id"() AS "current_department_id"))))));



CREATE POLICY "authenticated_select_system_settings" ON "public"."system_settings" FOR SELECT TO "authenticated" USING ((( SELECT "private"."is_active_admin"() AS "is_active_admin") OR ( SELECT "private"."is_active_user"() AS "is_active_user")));



ALTER TABLE "public"."credential_request_attachments" ENABLE ROW LEVEL SECURITY;


CREATE POLICY "credential_request_attachments_delete_self" ON "public"."credential_request_attachments" FOR DELETE TO "authenticated" USING ((EXISTS ( SELECT 1
   FROM "public"."credential_requests"
  WHERE (("credential_requests"."id" = "credential_request_attachments"."request_id") AND ("credential_requests"."student_id" = ( SELECT "private"."current_student_id"() AS "current_student_id")) AND ("credential_requests"."request_status" = 'pending'::"text")))));



CREATE POLICY "credential_request_attachments_insert_self" ON "public"."credential_request_attachments" FOR INSERT TO "authenticated" WITH CHECK ((EXISTS ( SELECT 1
   FROM "public"."credential_requests"
  WHERE (("credential_requests"."id" = "credential_request_attachments"."request_id") AND ("credential_requests"."student_id" = ( SELECT "private"."current_student_id"() AS "current_student_id")) AND ("credential_requests"."request_status" = 'pending'::"text")))));



CREATE POLICY "credential_request_attachments_read" ON "public"."credential_request_attachments" FOR SELECT TO "authenticated" USING ((EXISTS ( SELECT 1
   FROM "public"."credential_requests"
  WHERE (("credential_requests"."id" = "credential_request_attachments"."request_id") AND (("credential_requests"."student_id" = ( SELECT "private"."current_student_id"() AS "current_student_id")) OR ( SELECT "private"."is_active_organizer"() AS "is_active_organizer"))))));



ALTER TABLE "public"."credential_requests" ENABLE ROW LEVEL SECURITY;


CREATE POLICY "credential_requests_insert_self" ON "public"."credential_requests" FOR INSERT TO "authenticated" WITH CHECK ((("student_id" = ( SELECT "private"."current_student_id"() AS "current_student_id")) AND (NOT (("credential_type" = 'facial'::"text") AND ("request_type" = 're_enrollment'::"text")))));



CREATE POLICY "credential_requests_update_scoped" ON "public"."credential_requests" FOR UPDATE TO "authenticated" USING (( SELECT "private"."organizer_can_access_student"("credential_requests"."student_id") AS "organizer_can_access_student")) WITH CHECK (( SELECT "private"."organizer_can_access_student"("credential_requests"."student_id") AS "organizer_can_access_student"));



ALTER TABLE "public"."departments" ENABLE ROW LEVEL SECURITY;


CREATE POLICY "departments_branding_update_department_admin" ON "public"."departments" FOR UPDATE TO "authenticated" USING ((( SELECT "private"."is_active_department_admin"() AS "is_active_department_admin") AND ("id" = ( SELECT "private"."current_department_id"() AS "current_department_id")))) WITH CHECK ((( SELECT "private"."is_active_department_admin"() AS "is_active_department_admin") AND ("id" = ( SELECT "private"."current_department_id"() AS "current_department_id"))));



ALTER TABLE "public"."event_categories" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."event_email_outbox" ENABLE ROW LEVEL SECURITY;


CREATE POLICY "event_email_outbox_update_organizer" ON "public"."event_email_outbox" FOR UPDATE TO "authenticated" USING (("event_id" IN ( SELECT "e"."id"
   FROM "public"."events" "e"
  WHERE ("e"."organizer_id" IN ( SELECT "o"."id"
           FROM "public"."organizers" "o"
          WHERE ("o"."profile_id" = ( SELECT "auth"."uid"() AS "uid"))))))) WITH CHECK (("event_id" IN ( SELECT "e"."id"
   FROM "public"."events" "e"
  WHERE ("e"."organizer_id" IN ( SELECT "o"."id"
           FROM "public"."organizers" "o"
          WHERE ("o"."profile_id" = ( SELECT "auth"."uid"() AS "uid")))))));



ALTER TABLE "public"."event_feedback" ENABLE ROW LEVEL SECURITY;


CREATE POLICY "event_feedback_insert_self" ON "public"."event_feedback" FOR INSERT TO "authenticated" WITH CHECK ((("student_id" = ( SELECT "private"."current_student_id"() AS "current_student_id")) AND (EXISTS ( SELECT 1
   FROM ("public"."attendance_records"
     JOIN "public"."event_sessions" ON (("event_sessions"."id" = "attendance_records"."event_session_id")))
  WHERE (("attendance_records"."id" = "event_feedback"."attendance_record_id") AND ("attendance_records"."student_id" = "event_feedback"."student_id") AND ("event_sessions"."event_id" = "event_feedback"."event_id"))))));



ALTER TABLE "public"."event_feedback_ratings" ENABLE ROW LEVEL SECURITY;


CREATE POLICY "event_feedback_ratings_insert_self" ON "public"."event_feedback_ratings" FOR INSERT TO "authenticated" WITH CHECK ((EXISTS ( SELECT 1
   FROM "public"."event_feedback"
  WHERE (("event_feedback"."id" = "event_feedback_ratings"."feedback_id") AND ("event_feedback"."student_id" = ( SELECT "private"."current_student_id"() AS "current_student_id"))))));



CREATE POLICY "event_feedback_ratings_update_self" ON "public"."event_feedback_ratings" FOR UPDATE TO "authenticated" USING ((EXISTS ( SELECT 1
   FROM "public"."event_feedback"
  WHERE (("event_feedback"."id" = "event_feedback_ratings"."feedback_id") AND ("event_feedback"."student_id" = ( SELECT "private"."current_student_id"() AS "current_student_id")))))) WITH CHECK ((EXISTS ( SELECT 1
   FROM "public"."event_feedback"
  WHERE (("event_feedback"."id" = "event_feedback_ratings"."feedback_id") AND ("event_feedback"."student_id" = ( SELECT "private"."current_student_id"() AS "current_student_id"))))));



ALTER TABLE "public"."event_feedback_task_objectives" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."event_feedback_tasks" ENABLE ROW LEVEL SECURITY;


CREATE POLICY "event_feedback_update_self" ON "public"."event_feedback" FOR UPDATE TO "authenticated" USING (("student_id" = ( SELECT "private"."current_student_id"() AS "current_student_id"))) WITH CHECK (("student_id" = ( SELECT "private"."current_student_id"() AS "current_student_id")));



ALTER TABLE "public"."event_objectives" ENABLE ROW LEVEL SECURITY;


CREATE POLICY "event_objectives_delete_owner" ON "public"."event_objectives" FOR DELETE TO "authenticated" USING ((EXISTS ( SELECT 1
   FROM "public"."events"
  WHERE (("events"."id" = "event_objectives"."event_id") AND ("events"."organizer_id" = ( SELECT "private"."current_organizer_id"() AS "current_organizer_id"))))));



CREATE POLICY "event_objectives_insert_owner" ON "public"."event_objectives" FOR INSERT TO "authenticated" WITH CHECK ((EXISTS ( SELECT 1
   FROM "public"."events"
  WHERE (("events"."id" = "event_objectives"."event_id") AND ("events"."organizer_id" = ( SELECT "private"."current_organizer_id"() AS "current_organizer_id"))))));



CREATE POLICY "event_objectives_update_owner" ON "public"."event_objectives" FOR UPDATE TO "authenticated" USING ((EXISTS ( SELECT 1
   FROM "public"."events"
  WHERE (("events"."id" = "event_objectives"."event_id") AND ("events"."organizer_id" = ( SELECT "private"."current_organizer_id"() AS "current_organizer_id")))))) WITH CHECK ((EXISTS ( SELECT 1
   FROM "public"."events"
  WHERE (("events"."id" = "event_objectives"."event_id") AND ("events"."organizer_id" = ( SELECT "private"."current_organizer_id"() AS "current_organizer_id"))))));



ALTER TABLE "public"."event_participants" ENABLE ROW LEVEL SECURITY;


CREATE POLICY "event_participants_delete_owner" ON "public"."event_participants" FOR DELETE TO "authenticated" USING ((EXISTS ( SELECT 1
   FROM "public"."events"
  WHERE (("events"."id" = "event_participants"."event_id") AND ("events"."organizer_id" = ( SELECT "private"."current_organizer_id"() AS "current_organizer_id"))))));



CREATE POLICY "event_participants_update_owner" ON "public"."event_participants" FOR UPDATE TO "authenticated" USING ((EXISTS ( SELECT 1
   FROM "public"."events"
  WHERE (("events"."id" = "event_participants"."event_id") AND ("events"."organizer_id" = ( SELECT "private"."current_organizer_id"() AS "current_organizer_id")))))) WITH CHECK ((EXISTS ( SELECT 1
   FROM "public"."events"
  WHERE (("events"."id" = "event_participants"."event_id") AND ("events"."organizer_id" = ( SELECT "private"."current_organizer_id"() AS "current_organizer_id"))))));



ALTER TABLE "public"."event_resources" ENABLE ROW LEVEL SECURITY;


CREATE POLICY "event_resources_delete_owner" ON "public"."event_resources" FOR DELETE TO "authenticated" USING ((EXISTS ( SELECT 1
   FROM "public"."events" "e"
  WHERE (("e"."id" = "event_resources"."event_id") AND ("e"."organizer_id" = ( SELECT "private"."current_organizer_id"() AS "current_organizer_id"))))));



CREATE POLICY "event_resources_insert_owner" ON "public"."event_resources" FOR INSERT TO "authenticated" WITH CHECK ((("created_by" = ( SELECT "auth"."uid"() AS "uid")) AND (EXISTS ( SELECT 1
   FROM "public"."events" "e"
  WHERE (("e"."id" = "event_resources"."event_id") AND ("e"."organizer_id" = ( SELECT "private"."current_organizer_id"() AS "current_organizer_id")))))));



CREATE POLICY "event_resources_update_owner" ON "public"."event_resources" FOR UPDATE TO "authenticated" USING ((EXISTS ( SELECT 1
   FROM "public"."events" "e"
  WHERE (("e"."id" = "event_resources"."event_id") AND ("e"."organizer_id" = ( SELECT "private"."current_organizer_id"() AS "current_organizer_id")))))) WITH CHECK ((("created_by" = ( SELECT "auth"."uid"() AS "uid")) AND (EXISTS ( SELECT 1
   FROM "public"."events" "e"
  WHERE (("e"."id" = "event_resources"."event_id") AND ("e"."organizer_id" = ( SELECT "private"."current_organizer_id"() AS "current_organizer_id")))))));



ALTER TABLE "public"."event_sessions" ENABLE ROW LEVEL SECURITY;


CREATE POLICY "event_sessions_delete_owner" ON "public"."event_sessions" FOR DELETE TO "authenticated" USING ((EXISTS ( SELECT 1
   FROM "public"."events"
  WHERE (("events"."id" = "event_sessions"."event_id") AND ("events"."organizer_id" = ( SELECT "private"."current_organizer_id"() AS "current_organizer_id"))))));



CREATE POLICY "event_sessions_insert_owner" ON "public"."event_sessions" FOR INSERT TO "authenticated" WITH CHECK ((EXISTS ( SELECT 1
   FROM "public"."events"
  WHERE (("events"."id" = "event_sessions"."event_id") AND ("events"."organizer_id" = ( SELECT "private"."current_organizer_id"() AS "current_organizer_id"))))));



CREATE POLICY "event_sessions_update_owner" ON "public"."event_sessions" FOR UPDATE TO "authenticated" USING ((EXISTS ( SELECT 1
   FROM "public"."events"
  WHERE (("events"."id" = "event_sessions"."event_id") AND ("events"."organizer_id" = ( SELECT "private"."current_organizer_id"() AS "current_organizer_id")))))) WITH CHECK ((EXISTS ( SELECT 1
   FROM "public"."events"
  WHERE (("events"."id" = "event_sessions"."event_id") AND ("events"."organizer_id" = ( SELECT "private"."current_organizer_id"() AS "current_organizer_id"))))));



ALTER TABLE "public"."event_summary_snapshots" ENABLE ROW LEVEL SECURITY;


CREATE POLICY "event_summary_snapshots_insert_owner" ON "public"."event_summary_snapshots" FOR INSERT TO "authenticated" WITH CHECK ((EXISTS ( SELECT 1
   FROM "public"."events"
  WHERE (("events"."id" = "event_summary_snapshots"."event_id") AND ("events"."organizer_id" = ( SELECT "private"."current_organizer_id"() AS "current_organizer_id"))))));



CREATE POLICY "event_summary_snapshots_update_owner" ON "public"."event_summary_snapshots" FOR UPDATE TO "authenticated" USING ((EXISTS ( SELECT 1
   FROM "public"."events"
  WHERE (("events"."id" = "event_summary_snapshots"."event_id") AND ("events"."organizer_id" = ( SELECT "private"."current_organizer_id"() AS "current_organizer_id")))))) WITH CHECK ((EXISTS ( SELECT 1
   FROM "public"."events"
  WHERE (("events"."id" = "event_summary_snapshots"."event_id") AND ("events"."organizer_id" = ( SELECT "private"."current_organizer_id"() AS "current_organizer_id"))))));



ALTER TABLE "public"."events" ENABLE ROW LEVEL SECURITY;


CREATE POLICY "events_delete_owner" ON "public"."events" FOR DELETE TO "authenticated" USING (("organizer_id" = ( SELECT "private"."current_organizer_id"() AS "current_organizer_id")));



CREATE POLICY "events_insert_owner" ON "public"."events" FOR INSERT TO "authenticated" WITH CHECK ((( SELECT "private"."is_active_organizer"() AS "is_active_organizer") AND ("organizer_id" = ( SELECT "private"."current_organizer_id"() AS "current_organizer_id"))));



CREATE POLICY "events_update_owner" ON "public"."events" FOR UPDATE TO "authenticated" USING (("organizer_id" = ( SELECT "private"."current_organizer_id"() AS "current_organizer_id"))) WITH CHECK (("organizer_id" = ( SELECT "private"."current_organizer_id"() AS "current_organizer_id")));



ALTER TABLE "public"."facial_enrollment_history" ENABLE ROW LEVEL SECURITY;


CREATE POLICY "facial_enrollment_history_read_scoped" ON "public"."facial_enrollment_history" FOR SELECT TO "authenticated" USING ((("student_id" = ( SELECT "private"."current_student_id"() AS "current_student_id")) OR ( SELECT "private"."is_active_organizer"() AS "is_active_organizer")));



ALTER TABLE "public"."facial_profiles" ENABLE ROW LEVEL SECURITY;


CREATE POLICY "facial_profiles_delete_scoped" ON "public"."facial_profiles" FOR DELETE TO "authenticated" USING (( SELECT "private"."organizer_can_access_student"("facial_profiles"."student_id") AS "organizer_can_access_student"));



CREATE POLICY "facial_profiles_insert_scoped" ON "public"."facial_profiles" FOR INSERT TO "authenticated" WITH CHECK (( SELECT "private"."organizer_can_access_student"("facial_profiles"."student_id") AS "organizer_can_access_student"));



CREATE POLICY "facial_profiles_update_scoped" ON "public"."facial_profiles" FOR UPDATE TO "authenticated" USING (( SELECT "private"."organizer_can_access_student"("facial_profiles"."student_id") AS "organizer_can_access_student")) WITH CHECK (( SELECT "private"."organizer_can_access_student"("facial_profiles"."student_id") AS "organizer_can_access_student"));



ALTER TABLE "public"."generated_reports" ENABLE ROW LEVEL SECURITY;


CREATE POLICY "generated_reports_insert_owner" ON "public"."generated_reports" FOR INSERT TO "authenticated" WITH CHECK ((("generated_by" = ( SELECT "auth"."uid"() AS "uid")) AND ( SELECT "private"."is_active_organizer"() AS "is_active_organizer")));



ALTER TABLE "public"."legal_acceptances" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."legal_documents" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."ml_predictions" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."notification_preferences" ENABLE ROW LEVEL SECURITY;


CREATE POLICY "notification_preferences_insert_self" ON "public"."notification_preferences" FOR INSERT TO "authenticated" WITH CHECK (("profile_id" = ( SELECT "auth"."uid"() AS "uid")));



CREATE POLICY "notification_preferences_read_self" ON "public"."notification_preferences" FOR SELECT TO "authenticated" USING (("profile_id" = ( SELECT "auth"."uid"() AS "uid")));



CREATE POLICY "notification_preferences_update_self" ON "public"."notification_preferences" FOR UPDATE TO "authenticated" USING (("profile_id" = ( SELECT "auth"."uid"() AS "uid"))) WITH CHECK (("profile_id" = ( SELECT "auth"."uid"() AS "uid")));



ALTER TABLE "public"."notifications" ENABLE ROW LEVEL SECURITY;


CREATE POLICY "notifications_update_self" ON "public"."notifications" FOR UPDATE TO "authenticated" USING ((("recipient_id" = ( SELECT "auth"."uid"() AS "uid")) AND ( SELECT "private"."is_active_user"() AS "is_active_user"))) WITH CHECK ((("recipient_id" = ( SELECT "auth"."uid"() AS "uid")) AND ( SELECT "private"."is_active_user"() AS "is_active_user")));



ALTER TABLE "public"."organizers" ENABLE ROW LEVEL SECURITY;


CREATE POLICY "organizers_update_admin_branding" ON "public"."organizers" FOR UPDATE TO "authenticated" USING (( SELECT "private"."is_active_admin"() AS "is_active_admin")) WITH CHECK (( SELECT "private"."is_active_admin"() AS "is_active_admin"));



ALTER TABLE "public"."profiles" ENABLE ROW LEVEL SECURITY;


CREATE POLICY "profiles_update_self" ON "public"."profiles" FOR UPDATE TO "authenticated" USING ((("id" = ( SELECT "auth"."uid"() AS "uid")) AND ( SELECT "private"."is_active_user"() AS "is_active_user"))) WITH CHECK ((("id" = ( SELECT "auth"."uid"() AS "uid")) AND ( SELECT "private"."is_active_user"() AS "is_active_user")));



ALTER TABLE "public"."programs" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."qr_credentials" ENABLE ROW LEVEL SECURITY;


CREATE POLICY "qr_credentials_delete_scoped" ON "public"."qr_credentials" FOR DELETE TO "authenticated" USING (( SELECT "private"."organizer_can_access_student"("qr_credentials"."student_id") AS "organizer_can_access_student"));



CREATE POLICY "qr_credentials_insert_organizer" ON "public"."qr_credentials" FOR INSERT TO "authenticated" WITH CHECK (( SELECT "private"."is_active_organizer"() AS "is_active_organizer"));



CREATE POLICY "qr_credentials_update_scoped" ON "public"."qr_credentials" FOR UPDATE TO "authenticated" USING (( SELECT "private"."organizer_can_access_student"("qr_credentials"."student_id") AS "organizer_can_access_student")) WITH CHECK (( SELECT "private"."organizer_can_access_student"("qr_credentials"."student_id") AS "organizer_can_access_student"));



ALTER TABLE "public"."request_email_outbox" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."sections" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."semesters" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."student_face_embeddings" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."students" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."system_settings" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."verification_attempts" ENABLE ROW LEVEL SECURITY;


CREATE POLICY "verification_attempts_insert_owner" ON "public"."verification_attempts" FOR INSERT TO "authenticated" WITH CHECK ((( SELECT "private"."is_active_organizer"() AS "is_active_organizer") AND (EXISTS ( SELECT 1
   FROM ("public"."event_sessions"
     JOIN "public"."events" ON (("events"."id" = "event_sessions"."event_id")))
  WHERE (("event_sessions"."id" = "verification_attempts"."event_session_id") AND ("events"."organizer_id" = ( SELECT "private"."current_organizer_id"() AS "current_organizer_id")))))));



CREATE POLICY "verification_attempts_read" ON "public"."verification_attempts" FOR SELECT TO "authenticated" USING ((("student_id" = ( SELECT "private"."current_student_id"() AS "current_student_id")) OR (EXISTS ( SELECT 1
   FROM ("public"."event_sessions"
     JOIN "public"."events" ON (("events"."id" = "event_sessions"."event_id")))
  WHERE (("event_sessions"."id" = "verification_attempts"."event_session_id") AND ("events"."organizer_id" = ( SELECT "private"."current_organizer_id"() AS "current_organizer_id")))))));



GRANT USAGE ON SCHEMA "public" TO "postgres";
GRANT USAGE ON SCHEMA "public" TO "anon";
GRANT USAGE ON SCHEMA "public" TO "authenticated";
GRANT USAGE ON SCHEMA "public" TO "service_role";



GRANT ALL ON TABLE "public"."event_participants" TO "service_role";
GRANT SELECT,INSERT,DELETE,UPDATE ON TABLE "public"."event_participants" TO "authenticated";



REVOKE ALL ON FUNCTION "public"."add_organizer_event_participants"("p_event_id" "uuid", "p_student_ids" "uuid"[]) FROM PUBLIC;
GRANT ALL ON FUNCTION "public"."add_organizer_event_participants"("p_event_id" "uuid", "p_student_ids" "uuid"[]) TO "authenticated";



GRANT ALL ON TABLE "public"."events" TO "service_role";
GRANT SELECT,INSERT,DELETE,UPDATE ON TABLE "public"."events" TO "authenticated";



REVOKE ALL ON FUNCTION "public"."admin_finish_event"("p_event_id" "uuid", "p_reason" "text") FROM PUBLIC;



REVOKE ALL ON FUNCTION "public"."admin_list_credential_statuses"() FROM PUBLIC;
GRANT ALL ON FUNCTION "public"."admin_list_credential_statuses"() TO "authenticated";



REVOKE ALL ON FUNCTION "public"."admin_manage_catalog_entry"("p_table" "text", "p_id" "uuid", "p_values" "jsonb") FROM PUBLIC;
GRANT ALL ON FUNCTION "public"."admin_manage_catalog_entry"("p_table" "text", "p_id" "uuid", "p_values" "jsonb") TO "authenticated";



REVOKE ALL ON FUNCTION "public"."admin_publish_legal_document"("p_document_type" "text", "p_sections" "jsonb", "p_expected_version" "text") FROM PUBLIC;
GRANT ALL ON FUNCTION "public"."admin_publish_legal_document"("p_document_type" "text", "p_sections" "jsonb", "p_expected_version" "text") TO "authenticated";



GRANT ALL ON TABLE "public"."event_sessions" TO "service_role";
GRANT SELECT,INSERT,DELETE,UPDATE ON TABLE "public"."event_sessions" TO "authenticated";



REVOKE ALL ON FUNCTION "public"."admin_recover_attendance_session"("p_session_id" "uuid", "p_reason" "text") FROM PUBLIC;



REVOKE ALL ON FUNCTION "public"."admin_retry_email_job"("p_job_id" "uuid", "p_source" "text", "p_reason" "text") FROM PUBLIC;
GRANT ALL ON FUNCTION "public"."admin_retry_email_job"("p_job_id" "uuid", "p_source" "text", "p_reason" "text") TO "authenticated";



REVOKE ALL ON FUNCTION "public"."admin_revoke_user_sessions"("p_actor_user_id" "uuid", "p_target_user_id" "uuid", "p_reason" "text") FROM PUBLIC;
GRANT ALL ON FUNCTION "public"."admin_revoke_user_sessions"("p_actor_user_id" "uuid", "p_target_user_id" "uuid", "p_reason" "text") TO "service_role";



REVOKE ALL ON FUNCTION "public"."admin_run_data_consistency_check"() FROM PUBLIC;
GRANT ALL ON FUNCTION "public"."admin_run_data_consistency_check"() TO "authenticated";



REVOKE ALL ON FUNCTION "public"."admin_update_system_settings"("p_settings_id" "uuid", "p_changes" "jsonb") FROM PUBLIC;
GRANT ALL ON FUNCTION "public"."admin_update_system_settings"("p_settings_id" "uuid", "p_changes" "jsonb") TO "authenticated";



REVOKE ALL ON FUNCTION "public"."advance_event_attendance_capture_phase"("p_session_id" "uuid") FROM PUBLIC;
GRANT ALL ON FUNCTION "public"."advance_event_attendance_capture_phase"("p_session_id" "uuid") TO "authenticated";



REVOKE ALL ON FUNCTION "public"."cancel_organizer_event"("p_event_id" "uuid", "p_reason" "text") FROM PUBLIC;
GRANT ALL ON FUNCTION "public"."cancel_organizer_event"("p_event_id" "uuid", "p_reason" "text") TO "authenticated";



REVOKE ALL ON FUNCTION "public"."claim_event_email_outbox_batch"("p_limit" integer) FROM PUBLIC;
GRANT ALL ON FUNCTION "public"."claim_event_email_outbox_batch"("p_limit" integer) TO "service_role";



REVOKE ALL ON FUNCTION "public"."claim_event_email_outbox_batch_with_daily_cap"("p_limit" integer, "p_daily_cap" integer) FROM PUBLIC;
GRANT ALL ON FUNCTION "public"."claim_event_email_outbox_batch_with_daily_cap"("p_limit" integer, "p_daily_cap" integer) TO "service_role";



REVOKE ALL ON FUNCTION "public"."claim_request_email_outbox_batch"("p_limit" integer) FROM PUBLIC;
GRANT ALL ON FUNCTION "public"."claim_request_email_outbox_batch"("p_limit" integer) TO "service_role";



REVOKE ALL ON FUNCTION "public"."claim_request_email_outbox_batch_with_daily_cap"("p_limit" integer, "p_daily_cap" integer) FROM PUBLIC;
GRANT ALL ON FUNCTION "public"."claim_request_email_outbox_batch_with_daily_cap"("p_limit" integer, "p_daily_cap" integer) TO "service_role";



REVOKE ALL ON FUNCTION "public"."complete_event_email_outbox_delivery"("p_outbox_id" "uuid", "p_processing_token" "uuid", "p_provider_message_id" "text") FROM PUBLIC;
GRANT ALL ON FUNCTION "public"."complete_event_email_outbox_delivery"("p_outbox_id" "uuid", "p_processing_token" "uuid", "p_provider_message_id" "text") TO "service_role";



GRANT ALL ON TABLE "public"."facial_profiles" TO "service_role";
GRANT INSERT,DELETE,UPDATE ON TABLE "public"."facial_profiles" TO "authenticated";



GRANT SELECT("id") ON TABLE "public"."facial_profiles" TO "authenticated";



GRANT SELECT("student_id") ON TABLE "public"."facial_profiles" TO "authenticated";



GRANT SELECT("facial_status") ON TABLE "public"."facial_profiles" TO "authenticated";



GRANT SELECT("enrolled_at") ON TABLE "public"."facial_profiles" TO "authenticated";



GRANT SELECT("last_verified_at") ON TABLE "public"."facial_profiles" TO "authenticated";



GRANT SELECT("consent_recorded_at") ON TABLE "public"."facial_profiles" TO "authenticated";



GRANT SELECT("created_at") ON TABLE "public"."facial_profiles" TO "authenticated";



GRANT SELECT("updated_at") ON TABLE "public"."facial_profiles" TO "authenticated";



REVOKE ALL ON FUNCTION "public"."complete_facial_enrollment"("p_enrollment_reference" "text") FROM PUBLIC;
GRANT ALL ON FUNCTION "public"."complete_facial_enrollment"("p_enrollment_reference" "text") TO "authenticated";



REVOKE ALL ON FUNCTION "public"."complete_request_email_outbox_delivery"("p_outbox_id" "uuid", "p_processing_token" "uuid", "p_provider_message_id" "text") FROM PUBLIC;
GRANT ALL ON FUNCTION "public"."complete_request_email_outbox_delivery"("p_outbox_id" "uuid", "p_processing_token" "uuid", "p_provider_message_id" "text") TO "service_role";



REVOKE ALL ON FUNCTION "public"."create_organizer_event"("p_event_code" "text", "p_category_id" "uuid", "p_title" "text", "p_description" "text", "p_venue" "text", "p_starts_at" timestamp with time zone, "p_ends_at" timestamp with time zone, "p_priority_level" "text", "p_impact_score" numeric, "p_visibility" "text", "p_participant_ids" "uuid"[], "p_objectives" "text"[], "p_resource_title" "text", "p_resource_url" "text", "p_publish_reason" "text") FROM PUBLIC;
GRANT ALL ON FUNCTION "public"."create_organizer_event"("p_event_code" "text", "p_category_id" "uuid", "p_title" "text", "p_description" "text", "p_venue" "text", "p_starts_at" timestamp with time zone, "p_ends_at" timestamp with time zone, "p_priority_level" "text", "p_impact_score" numeric, "p_visibility" "text", "p_participant_ids" "uuid"[], "p_objectives" "text"[], "p_resource_title" "text", "p_resource_url" "text", "p_publish_reason" "text") TO "authenticated";



REVOKE ALL ON FUNCTION "public"."create_organizer_event_with_metadata"("p_event_code" "text", "p_category_id" "uuid", "p_title" "text", "p_description" "text", "p_venue" "text", "p_starts_at" timestamp with time zone, "p_ends_at" timestamp with time zone, "p_priority_level" "text", "p_impact_score" numeric, "p_visibility" "text", "p_participant_ids" "uuid"[], "p_objectives" "text"[], "p_resource_title" "text", "p_resource_url" "text", "p_publish_reason" "text", "p_requested_by" "text", "p_college_office" "text", "p_number_of_pax" integer, "p_institutional_category" "text", "p_participation_status" "text", "p_target_group" "text", "p_urgency_points" integer, "p_priority_score" integer, "p_priority_tier" "text", "p_fixed_priority" boolean) FROM PUBLIC;
GRANT ALL ON FUNCTION "public"."create_organizer_event_with_metadata"("p_event_code" "text", "p_category_id" "uuid", "p_title" "text", "p_description" "text", "p_venue" "text", "p_starts_at" timestamp with time zone, "p_ends_at" timestamp with time zone, "p_priority_level" "text", "p_impact_score" numeric, "p_visibility" "text", "p_participant_ids" "uuid"[], "p_objectives" "text"[], "p_resource_title" "text", "p_resource_url" "text", "p_publish_reason" "text", "p_requested_by" "text", "p_college_office" "text", "p_number_of_pax" integer, "p_institutional_category" "text", "p_participation_status" "text", "p_target_group" "text", "p_urgency_points" integer, "p_priority_score" integer, "p_priority_tier" "text", "p_fixed_priority" boolean) TO "authenticated";



REVOKE ALL ON FUNCTION "public"."defer_due_email_outbox_deliveries"("p_defer_until" timestamp with time zone, "p_reason" "text") FROM PUBLIC;
GRANT ALL ON FUNCTION "public"."defer_due_email_outbox_deliveries"("p_defer_until" timestamp with time zone, "p_reason" "text") TO "service_role";



REVOKE ALL ON FUNCTION "public"."defer_event_email_outbox_delivery"("p_outbox_id" "uuid", "p_processing_token" "uuid", "p_defer_until" timestamp with time zone, "p_reason" "text") FROM PUBLIC;
GRANT ALL ON FUNCTION "public"."defer_event_email_outbox_delivery"("p_outbox_id" "uuid", "p_processing_token" "uuid", "p_defer_until" timestamp with time zone, "p_reason" "text") TO "service_role";



REVOKE ALL ON FUNCTION "public"."defer_request_email_outbox_delivery"("p_outbox_id" "uuid", "p_processing_token" "uuid", "p_defer_until" timestamp with time zone, "p_reason" "text") FROM PUBLIC;
GRANT ALL ON FUNCTION "public"."defer_request_email_outbox_delivery"("p_outbox_id" "uuid", "p_processing_token" "uuid", "p_defer_until" timestamp with time zone, "p_reason" "text") TO "service_role";



REVOKE ALL ON FUNCTION "public"."department_admin_issue_qr_credential"("p_student_id" "uuid", "p_expires_at" timestamp with time zone) FROM PUBLIC;
GRANT ALL ON FUNCTION "public"."department_admin_issue_qr_credential"("p_student_id" "uuid", "p_expires_at" timestamp with time zone) TO "authenticated";



REVOKE ALL ON FUNCTION "public"."department_admin_list_credential_statuses"("p_student_ids" "uuid"[]) FROM PUBLIC;
GRANT ALL ON FUNCTION "public"."department_admin_list_credential_statuses"("p_student_ids" "uuid"[]) TO "authenticated";



REVOKE ALL ON FUNCTION "public"."department_admin_recover_stuck_attendance_session"("p_session_id" "uuid", "p_reason" "text") FROM PUBLIC;
GRANT ALL ON FUNCTION "public"."department_admin_recover_stuck_attendance_session"("p_session_id" "uuid", "p_reason" "text") TO "authenticated";



REVOKE ALL ON FUNCTION "public"."department_admin_retry_event_email_job"("p_job_id" "uuid", "p_reason" "text") FROM PUBLIC;
GRANT ALL ON FUNCTION "public"."department_admin_retry_event_email_job"("p_job_id" "uuid", "p_reason" "text") TO "authenticated";



REVOKE ALL ON FUNCTION "public"."discard_empty_event_session"("p_session_id" "uuid") FROM PUBLIC;
GRANT ALL ON FUNCTION "public"."discard_empty_event_session"("p_session_id" "uuid") TO "authenticated";



REVOKE ALL ON FUNCTION "public"."end_event_attendance_session"("p_session_id" "uuid", "p_reason" "text") FROM PUBLIC;
GRANT ALL ON FUNCTION "public"."end_event_attendance_session"("p_session_id" "uuid", "p_reason" "text") TO "authenticated";



REVOKE ALL ON FUNCTION "public"."expire_overdue_feedback_tasks"() FROM PUBLIC;



REVOKE ALL ON FUNCTION "public"."fail_event_email_outbox_delivery"("p_outbox_id" "uuid", "p_processing_token" "uuid", "p_error_message" "text") FROM PUBLIC;
GRANT ALL ON FUNCTION "public"."fail_event_email_outbox_delivery"("p_outbox_id" "uuid", "p_processing_token" "uuid", "p_error_message" "text") TO "service_role";



REVOKE ALL ON FUNCTION "public"."fail_request_email_outbox_delivery"("p_outbox_id" "uuid", "p_processing_token" "uuid", "p_error_message" "text") FROM PUBLIC;
GRANT ALL ON FUNCTION "public"."fail_request_email_outbox_delivery"("p_outbox_id" "uuid", "p_processing_token" "uuid", "p_error_message" "text") TO "service_role";



REVOKE ALL ON FUNCTION "public"."finalize_event_attendance_session"("p_session_id" "uuid", "p_reason" "text", "p_attendance_records" "jsonb") FROM PUBLIC;



GRANT ALL ON TABLE "public"."qr_credentials" TO "service_role";
GRANT INSERT,DELETE,UPDATE ON TABLE "public"."qr_credentials" TO "authenticated";



GRANT SELECT("id") ON TABLE "public"."qr_credentials" TO "authenticated";



GRANT SELECT("student_id") ON TABLE "public"."qr_credentials" TO "authenticated";



GRANT SELECT("credential_status") ON TABLE "public"."qr_credentials" TO "authenticated";



GRANT SELECT("issued_at") ON TABLE "public"."qr_credentials" TO "authenticated";



GRANT SELECT("expires_at") ON TABLE "public"."qr_credentials" TO "authenticated";



GRANT SELECT("revoked_at") ON TABLE "public"."qr_credentials" TO "authenticated";



GRANT SELECT("last_successful_check_in_at") ON TABLE "public"."qr_credentials" TO "authenticated";



GRANT SELECT("created_at") ON TABLE "public"."qr_credentials" TO "authenticated";



GRANT SELECT("updated_at") ON TABLE "public"."qr_credentials" TO "authenticated";



REVOKE ALL ON FUNCTION "public"."generate_student_qr_credential"() FROM PUBLIC;
GRANT ALL ON FUNCTION "public"."generate_student_qr_credential"() TO "authenticated";



REVOKE ALL ON FUNCTION "public"."get_event_attendance_capture_phase"("p_session_id" "uuid") FROM PUBLIC;
GRANT ALL ON FUNCTION "public"."get_event_attendance_capture_phase"("p_session_id" "uuid") TO "authenticated";



REVOKE ALL ON FUNCTION "public"."get_event_participant_schedule_conflicts"("p_starts_at" timestamp with time zone, "p_ends_at" timestamp with time zone, "p_student_ids" "uuid"[]) FROM PUBLIC;
GRANT ALL ON FUNCTION "public"."get_event_participant_schedule_conflicts"("p_starts_at" timestamp with time zone, "p_ends_at" timestamp with time zone, "p_student_ids" "uuid"[]) TO "authenticated";



REVOKE ALL ON FUNCTION "public"."get_facial_descriptor_for_organizer"("p_student_id" "uuid", "p_event_session_id" "uuid") FROM PUBLIC;
GRANT ALL ON FUNCTION "public"."get_facial_descriptor_for_organizer"("p_student_id" "uuid", "p_event_session_id" "uuid") TO "authenticated";



REVOKE ALL ON FUNCTION "public"."get_live_facial_candidate_ids"("p_event_session_id" "uuid") FROM PUBLIC;
GRANT ALL ON FUNCTION "public"."get_live_facial_candidate_ids"("p_event_session_id" "uuid") TO "authenticated";



REVOKE ALL ON FUNCTION "public"."get_live_facial_candidates"("p_event_session_id" "uuid") FROM PUBLIC;
GRANT ALL ON FUNCTION "public"."get_live_facial_candidates"("p_event_session_id" "uuid") TO "authenticated";



REVOKE ALL ON FUNCTION "public"."get_next_event_code"() FROM PUBLIC;
GRANT ALL ON FUNCTION "public"."get_next_event_code"() TO "authenticated";



REVOKE ALL ON FUNCTION "public"."get_published_legal_document"("p_document_type" "text") FROM PUBLIC;
GRANT ALL ON FUNCTION "public"."get_published_legal_document"("p_document_type" "text") TO "anon";
GRANT ALL ON FUNCTION "public"."get_published_legal_document"("p_document_type" "text") TO "authenticated";



REVOKE ALL ON FUNCTION "public"."get_student_dashboard_summary"() FROM PUBLIC;
GRANT ALL ON FUNCTION "public"."get_student_dashboard_summary"() TO "authenticated";



REVOKE ALL ON FUNCTION "public"."identify_event_participant_by_face"("p_event_session_id" "uuid", "p_live_descriptor" "jsonb") FROM PUBLIC;



REVOKE ALL ON FUNCTION "public"."issue_qr_credential"("p_student_id" "uuid", "p_expires_at" timestamp with time zone) FROM PUBLIC;
GRANT ALL ON FUNCTION "public"."issue_qr_credential"("p_student_id" "uuid", "p_expires_at" timestamp with time zone) TO "authenticated";



REVOKE ALL ON FUNCTION "public"."list_student_finalized_event_years"() FROM PUBLIC;
GRANT ALL ON FUNCTION "public"."list_student_finalized_event_years"() TO "authenticated";



REVOKE ALL ON FUNCTION "public"."log_client_action"("p_action" "text", "p_target_type" "text", "p_target_id" "uuid", "p_metadata" "jsonb") FROM PUBLIC;
GRANT ALL ON FUNCTION "public"."log_client_action"("p_action" "text", "p_target_type" "text", "p_target_id" "uuid", "p_metadata" "jsonb") TO "authenticated";



REVOKE ALL ON FUNCTION "public"."organizer_list_credential_directory"() FROM PUBLIC;
GRANT ALL ON FUNCTION "public"."organizer_list_credential_directory"() TO "authenticated";



REVOKE ALL ON FUNCTION "public"."organizer_list_invitation_students"("p_limit" integer, "p_offset" integer, "p_student_ids" "uuid"[]) FROM PUBLIC;
GRANT ALL ON FUNCTION "public"."organizer_list_invitation_students"("p_limit" integer, "p_offset" integer, "p_student_ids" "uuid"[]) TO "authenticated";



REVOKE ALL ON FUNCTION "public"."prepare_offline_event_package"("p_event_id" "uuid") FROM PUBLIC;
GRANT ALL ON FUNCTION "public"."prepare_offline_event_package"("p_event_id" "uuid") TO "authenticated";



REVOKE ALL ON FUNCTION "public"."prevent_facial_profile_replacement"() FROM PUBLIC;



REVOKE ALL ON FUNCTION "public"."prevent_facial_reenrollment"() FROM PUBLIC;



REVOKE ALL ON FUNCTION "public"."queue_emails_for_event"("p_event_id" "uuid") FROM PUBLIC;
GRANT ALL ON FUNCTION "public"."queue_emails_for_event"("p_event_id" "uuid") TO "service_role";



REVOKE ALL ON FUNCTION "public"."recalculate_feedback_analytics"() FROM PUBLIC;



REVOKE ALL ON FUNCTION "public"."reconcile_offline_event_session_end"("p_session_id" "uuid", "p_actual_end" timestamp with time zone, "p_reason" "text", "p_expected_student_ids" "uuid"[]) FROM PUBLIC;
GRANT ALL ON FUNCTION "public"."reconcile_offline_event_session_end"("p_session_id" "uuid", "p_actual_end" timestamp with time zone, "p_reason" "text", "p_expected_student_ids" "uuid"[]) TO "authenticated";



REVOKE ALL ON FUNCTION "public"."reconcile_offline_event_session_start"("p_session_id" "uuid", "p_actual_start" timestamp with time zone) FROM PUBLIC;
GRANT ALL ON FUNCTION "public"."reconcile_offline_event_session_start"("p_session_id" "uuid", "p_actual_start" timestamp with time zone) TO "authenticated";



REVOKE ALL ON FUNCTION "public"."record_approved_event_walkin"("p_local_scan_uuid" "uuid", "p_event_id" "uuid", "p_session_id" "uuid", "p_student_number" "text", "p_identification_method" "text", "p_time_in" timestamp with time zone, "p_time_out" timestamp with time zone, "p_checkout_identification_method" "text") FROM PUBLIC;
GRANT ALL ON FUNCTION "public"."record_approved_event_walkin"("p_local_scan_uuid" "uuid", "p_event_id" "uuid", "p_session_id" "uuid", "p_student_number" "text", "p_identification_method" "text", "p_time_in" timestamp with time zone, "p_time_out" timestamp with time zone, "p_checkout_identification_method" "text") TO "authenticated";



REVOKE ALL ON FUNCTION "public"."record_live_facial_attendance"("p_event_session_id" "uuid", "p_student_id" "uuid", "p_similarity" double precision, "p_action" "text", "p_occurred_at" timestamp with time zone) FROM PUBLIC;
GRANT ALL ON FUNCTION "public"."record_live_facial_attendance"("p_event_session_id" "uuid", "p_student_id" "uuid", "p_similarity" double precision, "p_action" "text", "p_occurred_at" timestamp with time zone) TO "authenticated";



GRANT ALL ON TABLE "public"."attendance_records" TO "service_role";
GRANT SELECT,INSERT,UPDATE ON TABLE "public"."attendance_records" TO "authenticated";



REVOKE ALL ON FUNCTION "public"."record_manual_event_attendance"("p_session_id" "uuid", "p_student_id" "uuid", "p_status" "text", "p_reason" "text", "p_remarks" "text", "p_late_reason" "text", "p_occurred_at" timestamp with time zone) FROM PUBLIC;
GRANT ALL ON FUNCTION "public"."record_manual_event_attendance"("p_session_id" "uuid", "p_student_id" "uuid", "p_status" "text", "p_reason" "text", "p_remarks" "text", "p_late_reason" "text", "p_occurred_at" timestamp with time zone) TO "authenticated";



REVOKE ALL ON FUNCTION "public"."reschedule_organizer_event"("p_event_id" "uuid", "p_venue" "text", "p_starts_at" timestamp with time zone, "p_ends_at" timestamp with time zone, "p_reason" "text") FROM PUBLIC;
GRANT ALL ON FUNCTION "public"."reschedule_organizer_event"("p_event_id" "uuid", "p_venue" "text", "p_starts_at" timestamp with time zone, "p_ends_at" timestamp with time zone, "p_reason" "text") TO "authenticated";



GRANT ALL ON TABLE "public"."attendance_requests" TO "service_role";
GRANT SELECT,INSERT,UPDATE ON TABLE "public"."attendance_requests" TO "authenticated";



REVOKE ALL ON FUNCTION "public"."review_attendance_request"("p_request_id" "uuid", "p_status" "text", "p_reason" "text") FROM PUBLIC;
GRANT ALL ON FUNCTION "public"."review_attendance_request"("p_request_id" "uuid", "p_status" "text", "p_reason" "text") TO "authenticated";



GRANT ALL ON TABLE "public"."credential_requests" TO "service_role";
GRANT SELECT,INSERT,UPDATE ON TABLE "public"."credential_requests" TO "authenticated";



REVOKE ALL ON FUNCTION "public"."review_credential_request"("p_request_id" "uuid", "p_status" "text", "p_remarks" "text") FROM PUBLIC;
GRANT ALL ON FUNCTION "public"."review_credential_request"("p_request_id" "uuid", "p_status" "text", "p_remarks" "text") TO "authenticated";



REVOKE ALL ON FUNCTION "public"."rls_auto_enable"() FROM PUBLIC;



REVOKE ALL ON FUNCTION "public"."set_student_credential_status"("p_student_id" "uuid", "p_credential_type" "text", "p_status" "text") FROM PUBLIC;
GRANT ALL ON FUNCTION "public"."set_student_credential_status"("p_student_id" "uuid", "p_credential_type" "text", "p_status" "text") TO "authenticated";



REVOKE ALL ON FUNCTION "public"."start_event_attendance_session"("p_event_id" "uuid", "p_venue" "text", "p_scheduled_start" timestamp with time zone, "p_scheduled_end" timestamp with time zone, "p_mode" "text", "p_late_cutoff_minutes" integer) FROM PUBLIC;
GRANT ALL ON FUNCTION "public"."start_event_attendance_session"("p_event_id" "uuid", "p_venue" "text", "p_scheduled_start" timestamp with time zone, "p_scheduled_end" timestamp with time zone, "p_mode" "text", "p_late_cutoff_minutes" integer) TO "authenticated";



REVOKE ALL ON FUNCTION "public"."store_facial_descriptor"("p_face_descriptor" "jsonb") FROM PUBLIC;
GRANT ALL ON FUNCTION "public"."store_facial_descriptor"("p_face_descriptor" "jsonb") TO "authenticated";



REVOKE ALL ON FUNCTION "public"."store_student_face_embedding"("p_pose" "text", "p_embedding" "jsonb", "p_model_name" "text", "p_detector_backend" "text") FROM PUBLIC;
GRANT ALL ON FUNCTION "public"."store_student_face_embedding"("p_pose" "text", "p_embedding" "jsonb", "p_model_name" "text", "p_detector_backend" "text") TO "authenticated";



REVOKE ALL ON FUNCTION "public"."submit_event_late_reason"("p_event_session_id" "uuid", "p_late_reason_option_id" "uuid", "p_late_reason" "text") FROM PUBLIC;
GRANT ALL ON FUNCTION "public"."submit_event_late_reason"("p_event_session_id" "uuid", "p_late_reason_option_id" "uuid", "p_late_reason" "text") TO "authenticated";



REVOKE ALL ON FUNCTION "public"."submit_feedback_task"("p_task_id" "uuid", "p_comment" "text", "p_ratings" "jsonb", "p_sentiment_label" "text", "p_sentiment_score" numeric) FROM PUBLIC;
GRANT ALL ON FUNCTION "public"."submit_feedback_task"("p_task_id" "uuid", "p_comment" "text", "p_ratings" "jsonb", "p_sentiment_label" "text", "p_sentiment_score" numeric) TO "authenticated";



REVOKE ALL ON FUNCTION "public"."submit_late_reason"("p_attendance_record_id" "uuid", "p_late_reason_category" "text", "p_late_reason" "text") FROM PUBLIC;
GRANT ALL ON FUNCTION "public"."submit_late_reason"("p_attendance_record_id" "uuid", "p_late_reason_category" "text", "p_late_reason" "text") TO "authenticated";



REVOKE ALL ON FUNCTION "public"."submit_late_reason"("p_attendance_record_id" "uuid", "p_late_reason_option_id" "uuid", "p_late_reason" "text") FROM PUBLIC;
GRANT ALL ON FUNCTION "public"."submit_late_reason"("p_attendance_record_id" "uuid", "p_late_reason_option_id" "uuid", "p_late_reason" "text") TO "authenticated";



REVOKE ALL ON FUNCTION "public"."sync_offline_event_attendance"("p_local_attendance_uuid" "uuid", "p_session_id" "uuid", "p_student_id" "uuid", "p_identification_method" "text", "p_attendance_status" "text", "p_time_in" timestamp with time zone, "p_time_out" timestamp with time zone, "p_checkout_identification_method" "text", "p_remarks" "text", "p_late_reason" "text") FROM PUBLIC;
GRANT ALL ON FUNCTION "public"."sync_offline_event_attendance"("p_local_attendance_uuid" "uuid", "p_session_id" "uuid", "p_student_id" "uuid", "p_identification_method" "text", "p_attendance_status" "text", "p_time_in" timestamp with time zone, "p_time_out" timestamp with time zone, "p_checkout_identification_method" "text", "p_remarks" "text", "p_late_reason" "text") TO "authenticated";



REVOKE ALL ON FUNCTION "public"."update_organizer_event_metadata"("p_event_id" "uuid", "p_requested_by" "text", "p_college_office" "text", "p_number_of_pax" integer, "p_institutional_category" "text", "p_participation_status" "text", "p_target_group" "text", "p_urgency_points" integer, "p_priority_score" integer, "p_priority_tier" "text", "p_fixed_priority" boolean) FROM PUBLIC;
GRANT ALL ON FUNCTION "public"."update_organizer_event_metadata"("p_event_id" "uuid", "p_requested_by" "text", "p_college_office" "text", "p_number_of_pax" integer, "p_institutional_category" "text", "p_participation_status" "text", "p_target_group" "text", "p_urgency_points" integer, "p_priority_score" integer, "p_priority_tier" "text", "p_fixed_priority" boolean) TO "authenticated";



GRANT SELECT,MAINTAIN,UPDATE ON TABLE "public"."admin_profiles" TO "authenticated";
GRANT ALL ON TABLE "public"."admin_profiles" TO "service_role";



GRANT REFERENCES,TRIGGER,TRUNCATE,MAINTAIN ON TABLE "public"."attendance_late_reason_option_translations" TO "anon";
GRANT ALL ON TABLE "public"."attendance_late_reason_option_translations" TO "authenticated";
GRANT REFERENCES,TRIGGER,TRUNCATE,MAINTAIN ON TABLE "public"."attendance_late_reason_option_translations" TO "service_role";



GRANT REFERENCES,TRIGGER,TRUNCATE,MAINTAIN ON TABLE "public"."attendance_late_reason_options" TO "anon";
GRANT ALL ON TABLE "public"."attendance_late_reason_options" TO "authenticated";
GRANT REFERENCES,TRIGGER,TRUNCATE,MAINTAIN ON TABLE "public"."attendance_late_reason_options" TO "service_role";



GRANT ALL ON TABLE "public"."attendance_request_attachments" TO "service_role";
GRANT SELECT,INSERT,DELETE ON TABLE "public"."attendance_request_attachments" TO "authenticated";



GRANT ALL ON TABLE "public"."audit_logs" TO "service_role";
GRANT SELECT ON TABLE "public"."audit_logs" TO "authenticated";



GRANT REFERENCES,TRIGGER,TRUNCATE,MAINTAIN ON TABLE "public"."credential_request_attachments" TO "anon";
GRANT SELECT,INSERT,REFERENCES,DELETE,TRIGGER,TRUNCATE,MAINTAIN ON TABLE "public"."credential_request_attachments" TO "authenticated";
GRANT REFERENCES,TRIGGER,TRUNCATE,MAINTAIN ON TABLE "public"."credential_request_attachments" TO "service_role";



GRANT ALL ON TABLE "public"."departments" TO "service_role";
GRANT SELECT,INSERT,UPDATE ON TABLE "public"."departments" TO "authenticated";



GRANT UPDATE("updated_at") ON TABLE "public"."departments" TO "authenticated";



GRANT UPDATE("brand_name_override") ON TABLE "public"."departments" TO "authenticated";



GRANT UPDATE("logo_path") ON TABLE "public"."departments" TO "authenticated";



GRANT UPDATE("primary_color") ON TABLE "public"."departments" TO "authenticated";



GRANT UPDATE("secondary_color") ON TABLE "public"."departments" TO "authenticated";



GRANT ALL ON TABLE "public"."event_categories" TO "service_role";
GRANT SELECT,INSERT,UPDATE ON TABLE "public"."event_categories" TO "authenticated";



GRANT ALL ON TABLE "public"."event_email_outbox" TO "service_role";



GRANT SELECT("id") ON TABLE "public"."event_email_outbox" TO "authenticated";



GRANT SELECT("recipient_email") ON TABLE "public"."event_email_outbox" TO "authenticated";



GRANT SELECT("event_id") ON TABLE "public"."event_email_outbox" TO "authenticated";



GRANT SELECT("event_code") ON TABLE "public"."event_email_outbox" TO "authenticated";



GRANT SELECT("event_title") ON TABLE "public"."event_email_outbox" TO "authenticated";



GRANT SELECT("subject") ON TABLE "public"."event_email_outbox" TO "authenticated";



GRANT SELECT("delivery_status") ON TABLE "public"."event_email_outbox" TO "authenticated";



GRANT SELECT("error_message") ON TABLE "public"."event_email_outbox" TO "authenticated";



GRANT SELECT("created_at") ON TABLE "public"."event_email_outbox" TO "authenticated";



GRANT SELECT("sent_at") ON TABLE "public"."event_email_outbox" TO "authenticated";



GRANT SELECT("notification_type") ON TABLE "public"."event_email_outbox" TO "authenticated";



GRANT SELECT("last_attempt_at") ON TABLE "public"."event_email_outbox" TO "authenticated";



GRANT REFERENCES,TRIGGER,TRUNCATE,MAINTAIN ON TABLE "public"."event_feedback" TO "anon";
GRANT SELECT,INSERT,REFERENCES,TRIGGER,TRUNCATE,MAINTAIN,UPDATE ON TABLE "public"."event_feedback" TO "authenticated";
GRANT ALL ON TABLE "public"."event_feedback" TO "service_role";



GRANT REFERENCES,TRIGGER,TRUNCATE,MAINTAIN ON TABLE "public"."event_feedback_ratings" TO "anon";
GRANT SELECT,INSERT,REFERENCES,TRIGGER,TRUNCATE,MAINTAIN,UPDATE ON TABLE "public"."event_feedback_ratings" TO "authenticated";
GRANT ALL ON TABLE "public"."event_feedback_ratings" TO "service_role";



GRANT REFERENCES,TRIGGER,TRUNCATE,MAINTAIN ON TABLE "public"."event_feedback_task_objectives" TO "service_role";
GRANT SELECT ON TABLE "public"."event_feedback_task_objectives" TO "authenticated";



GRANT REFERENCES,TRIGGER,TRUNCATE,MAINTAIN ON TABLE "public"."event_feedback_tasks" TO "service_role";
GRANT SELECT ON TABLE "public"."event_feedback_tasks" TO "authenticated";



GRANT REFERENCES,TRIGGER,TRUNCATE,MAINTAIN ON TABLE "public"."event_objectives" TO "anon";
GRANT ALL ON TABLE "public"."event_objectives" TO "authenticated";
GRANT ALL ON TABLE "public"."event_objectives" TO "service_role";



GRANT REFERENCES,TRIGGER,TRUNCATE,MAINTAIN ON TABLE "public"."event_resources" TO "anon";
GRANT ALL ON TABLE "public"."event_resources" TO "authenticated";
GRANT REFERENCES,TRIGGER,TRUNCATE,MAINTAIN ON TABLE "public"."event_resources" TO "service_role";



GRANT REFERENCES,TRIGGER,TRUNCATE,MAINTAIN ON TABLE "public"."event_summary_snapshots" TO "anon";
GRANT SELECT,INSERT,REFERENCES,TRIGGER,TRUNCATE,MAINTAIN,UPDATE ON TABLE "public"."event_summary_snapshots" TO "authenticated";
GRANT ALL ON TABLE "public"."event_summary_snapshots" TO "service_role";



GRANT REFERENCES,TRIGGER,TRUNCATE,MAINTAIN ON TABLE "public"."facial_enrollment_history" TO "anon";
GRANT SELECT,REFERENCES,TRIGGER,TRUNCATE,MAINTAIN ON TABLE "public"."facial_enrollment_history" TO "authenticated";
GRANT REFERENCES,TRIGGER,TRUNCATE,MAINTAIN ON TABLE "public"."facial_enrollment_history" TO "service_role";



GRANT ALL ON TABLE "public"."generated_reports" TO "service_role";
GRANT SELECT,INSERT ON TABLE "public"."generated_reports" TO "authenticated";



GRANT REFERENCES,TRIGGER,TRUNCATE,MAINTAIN ON TABLE "public"."legal_acceptances" TO "anon";
GRANT SELECT,INSERT,REFERENCES,TRIGGER,TRUNCATE,MAINTAIN ON TABLE "public"."legal_acceptances" TO "authenticated";
GRANT REFERENCES,TRIGGER,TRUNCATE,MAINTAIN ON TABLE "public"."legal_acceptances" TO "service_role";



GRANT REFERENCES,TRIGGER,TRUNCATE,MAINTAIN ON TABLE "public"."legal_documents" TO "service_role";



GRANT ALL ON TABLE "public"."ml_predictions" TO "service_role";
GRANT SELECT ON TABLE "public"."ml_predictions" TO "authenticated";



GRANT REFERENCES,TRIGGER,TRUNCATE,MAINTAIN ON TABLE "public"."notification_preferences" TO "service_role";
GRANT SELECT,INSERT,UPDATE ON TABLE "public"."notification_preferences" TO "authenticated";



GRANT ALL ON TABLE "public"."notifications" TO "service_role";
GRANT SELECT ON TABLE "public"."notifications" TO "authenticated";



GRANT UPDATE("notification_status") ON TABLE "public"."notifications" TO "authenticated";



GRANT UPDATE("read_at") ON TABLE "public"."notifications" TO "authenticated";



GRANT ALL ON TABLE "public"."organizers" TO "service_role";
GRANT SELECT ON TABLE "public"."organizers" TO "authenticated";



GRANT UPDATE("organization_name") ON TABLE "public"."organizers" TO "authenticated";



GRANT UPDATE("updated_at") ON TABLE "public"."organizers" TO "authenticated";



GRANT UPDATE("college_logo_path") ON TABLE "public"."organizers" TO "authenticated";



GRANT ALL ON TABLE "public"."profiles" TO "service_role";
GRANT SELECT ON TABLE "public"."profiles" TO "authenticated";



GRANT UPDATE("first_name") ON TABLE "public"."profiles" TO "authenticated";



GRANT UPDATE("middle_name") ON TABLE "public"."profiles" TO "authenticated";



GRANT UPDATE("last_name") ON TABLE "public"."profiles" TO "authenticated";



GRANT UPDATE("profile_picture") ON TABLE "public"."profiles" TO "authenticated";



GRANT UPDATE("updated_at") ON TABLE "public"."profiles" TO "authenticated";



GRANT ALL ON TABLE "public"."programs" TO "service_role";
GRANT SELECT,INSERT,UPDATE ON TABLE "public"."programs" TO "authenticated";



GRANT REFERENCES,TRIGGER,TRUNCATE,MAINTAIN ON TABLE "public"."request_email_outbox" TO "anon";
GRANT SELECT,REFERENCES,TRIGGER,TRUNCATE,MAINTAIN ON TABLE "public"."request_email_outbox" TO "authenticated";
GRANT ALL ON TABLE "public"."request_email_outbox" TO "service_role";



GRANT SELECT("id") ON TABLE "public"."request_email_outbox" TO "authenticated";



GRANT SELECT("recipient_profile_id") ON TABLE "public"."request_email_outbox" TO "authenticated";



GRANT SELECT("recipient_email") ON TABLE "public"."request_email_outbox" TO "authenticated";



GRANT SELECT("subject") ON TABLE "public"."request_email_outbox" TO "authenticated";



GRANT SELECT("delivery_status") ON TABLE "public"."request_email_outbox" TO "authenticated";



GRANT SELECT("error_message") ON TABLE "public"."request_email_outbox" TO "authenticated";



GRANT SELECT("created_at") ON TABLE "public"."request_email_outbox" TO "authenticated";



GRANT SELECT("sent_at") ON TABLE "public"."request_email_outbox" TO "authenticated";



GRANT ALL ON TABLE "public"."sections" TO "service_role";
GRANT SELECT,INSERT,UPDATE ON TABLE "public"."sections" TO "authenticated";



GRANT ALL ON TABLE "public"."semesters" TO "service_role";
GRANT SELECT ON TABLE "public"."semesters" TO "authenticated";



GRANT SELECT,REFERENCES,TRIGGER,TRUNCATE,MAINTAIN ON TABLE "public"."student_face_embeddings" TO "service_role";



GRANT ALL ON TABLE "public"."students" TO "service_role";
GRANT SELECT ON TABLE "public"."students" TO "authenticated";



GRANT REFERENCES,TRIGGER,TRUNCATE,MAINTAIN ON TABLE "public"."system_settings" TO "anon";
GRANT SELECT,REFERENCES,TRIGGER,TRUNCATE,MAINTAIN,UPDATE ON TABLE "public"."system_settings" TO "authenticated";
GRANT ALL ON TABLE "public"."system_settings" TO "service_role";



GRANT ALL ON TABLE "public"."verification_attempts" TO "service_role";
GRANT SELECT,INSERT ON TABLE "public"."verification_attempts" TO "authenticated";



ALTER DEFAULT PRIVILEGES FOR ROLE "postgres" IN SCHEMA "public" GRANT ALL ON SEQUENCES TO "postgres";






ALTER DEFAULT PRIVILEGES FOR ROLE "postgres" IN SCHEMA "public" GRANT ALL ON FUNCTIONS TO "postgres";






ALTER DEFAULT PRIVILEGES FOR ROLE "postgres" IN SCHEMA "public" GRANT ALL ON TABLES TO "postgres";
ALTER DEFAULT PRIVILEGES FOR ROLE "postgres" IN SCHEMA "public" GRANT REFERENCES,TRIGGER,TRUNCATE,MAINTAIN ON TABLES TO "anon";
ALTER DEFAULT PRIVILEGES FOR ROLE "postgres" IN SCHEMA "public" GRANT REFERENCES,TRIGGER,TRUNCATE,MAINTAIN ON TABLES TO "authenticated";
ALTER DEFAULT PRIVILEGES FOR ROLE "postgres" IN SCHEMA "public" GRANT REFERENCES,TRIGGER,TRUNCATE,MAINTAIN ON TABLES TO "service_role";







