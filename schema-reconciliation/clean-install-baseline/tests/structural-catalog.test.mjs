import { execFileSync } from "node:child_process";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

const root = new URL("..", import.meta.url).pathname.replace(/^\/(.:)/, "$1");
const supabaseCli = new URL("../../../node_modules/supabase/dist/supabase.js", import.meta.url).pathname.replace(/^\/(.:)/, "$1");
const manifest = JSON.parse(readFileSync(new URL("../../canonical-catalog.manifest.json", import.meta.url), "utf8"));
const requiredTables = [...manifest.catalogInclusionRequirements.tables.requiredInventory].sort();
const tableList = requiredTables.map((table) => `'${table}'`).join(",");
const query = (sql) => {
  const output = execFileSync(process.execPath, [supabaseCli, "db", "query", sql, "--local", "--output-format", "json"], { cwd: root, encoding: "utf8" });
  return JSON.parse(output.slice(output.indexOf("{"))).rows;
};
const assertSameFingerprintSet = (actual, expected) =>
  assert.deepEqual([...actual].sort((left, right) => left.localeCompare(right)), [...expected].sort((left, right) => left.localeCompare(right)));

const rows = query(`select jsonb_build_object(
  'relations',(select jsonb_agg(c.relname order by c.relname) from pg_class c join pg_namespace n on n.oid=c.relnamespace where n.nspname='public' and c.relkind='r' and c.relname in (${tableList})),
  'forbidden',(select jsonb_agg(c.relname order by c.relname) from pg_class c join pg_namespace n on n.oid=c.relnamespace where n.nspname='public' and c.relname='attendance_sessions'),
  'forbidden_columns',(select jsonb_agg(table_name||'.'||column_name order by table_name,column_name) from information_schema.columns where table_schema='public' and ((table_name='attendance_records' and column_name='session_id') or (table_name='verification_attempts' and column_name='session_id'))),
  'critical_columns',(select jsonb_agg(table_name||'.'||column_name order by table_name,column_name) from information_schema.columns where table_schema='public' and ((table_name='attendance_records' and column_name='event_session_id') or (table_name='verification_attempts' and column_name='event_session_id') or (table_name='classes' and column_name in ('faculty_id','program_id','department_id','semester_id','section_id','subject_code','subject_title','room','schedule_label','year_level','status')) or (table_name='class_rosters' and column_name in ('class_id','student_id','enrolled_at')) or (table_name='faculty_profiles' and column_name in ('profile_id','department_id','employee_number','employment_status','title')) or (table_name='admin_profiles' and column_name in ('profile_id','department_id','employee_number','office_name')))),
  'constraints',(select jsonb_agg(conname order by conname) from pg_constraint where conname in ('attendance_records_event_session_id_fkey','verification_attempts_event_session_id_fkey','classes_faculty_id_fkey','classes_program_id_fkey','classes_department_id_fkey','classes_semester_id_fkey','classes_section_id_fkey','class_rosters_class_id_fkey','class_rosters_student_id_fkey','class_rosters_class_id_student_id_key','faculty_profiles_profile_id_fkey','faculty_profiles_department_id_fkey','faculty_profiles_employee_number_key','admin_profiles_profile_id_fkey','admin_profiles_department_id_fkey','admin_profiles_employee_number_key')),
  'fk_actions',(select jsonb_agg(conname||':'||confdeltype::text order by conname) from pg_constraint where conname in ('classes_faculty_id_fkey','classes_program_id_fkey','classes_department_id_fkey','classes_semester_id_fkey','classes_section_id_fkey','class_rosters_class_id_fkey','class_rosters_student_id_fkey','faculty_profiles_profile_id_fkey','faculty_profiles_department_id_fkey','admin_profiles_profile_id_fkey','admin_profiles_department_id_fkey')),
  'indexes',(select jsonb_agg(indexname order by indexname) from pg_indexes where schemaname='public' and indexname in ('attendance_records_event_session_id_idx','attendance_records_event_student_unique_idx','attendance_records_local_uuid_unique_idx','verification_attempts_event_session_id_idx','classes_faculty_id_idx','classes_program_id_idx','classes_department_id_idx','classes_semester_id_idx','classes_section_id_idx','classes_status_idx','classes_offering_identity_unique_idx','class_rosters_class_id_idx','class_rosters_student_id_idx','faculty_profiles_department_id_idx','admin_profiles_department_id_idx')),
  'rls',(select jsonb_agg(relname order by relname) from pg_class c join pg_namespace n on n.oid=c.relnamespace where n.nspname='public' and c.relname in (${tableList}) and c.relrowsecurity),
  'policy_tables',(select jsonb_agg(distinct tablename order by tablename) from pg_policies where schemaname='public' and tablename in ('event_sessions','attendance_records','verification_attempts','class_rosters','faculty_profiles','admin_profiles')),
  'new_policies',(select jsonb_agg(tablename||'.'||policyname order by tablename,policyname) from pg_policies where schemaname='public' and policyname in ('classes_read_active_user','class_rosters_read_scoped','class_rosters_insert_manager','class_rosters_delete_manager','faculty_profiles_read_scoped','admin_profiles_read_scoped')),
  'authenticated_grants',(select jsonb_agg(c.relname||'.'||a.privilege_type order by c.relname,a.privilege_type) from pg_class c join pg_namespace n on n.oid=c.relnamespace cross join lateral aclexplode(c.relacl) a where n.nspname='public' and c.relname in ('classes','class_rosters','faculty_profiles','admin_profiles') and pg_get_userbyid(a.grantee)='authenticated'),
  'unsafe_table_grants',(select jsonb_agg(c.relname||'.'||coalesce(nullif(pg_get_userbyid(a.grantee),''),'PUBLIC') order by c.relname) from pg_class c join pg_namespace n on n.oid=c.relnamespace cross join lateral aclexplode(coalesce(c.relacl,acldefault('r',c.relowner))) a where n.nspname='public' and c.relname in (${tableList}) and coalesce(nullif(pg_get_userbyid(a.grantee),''),'PUBLIC') in ('anon','PUBLIC')),
  'rpcs',(select jsonb_agg(proname||'('||pg_get_function_identity_arguments(p.oid)||')' order by proname) from pg_proc p join pg_namespace n on n.oid=p.pronamespace where n.nspname='public' and proname in ('sync_offline_event_attendance','prepare_offline_event_package','start_event_attendance_session','record_live_facial_attendance','get_live_facial_candidate_ids','get_live_facial_candidates','list_student_finalized_event_years','get_student_dashboard_summary')),
  'unsafe_rpc_search_paths',(select jsonb_agg(proname order by proname) from pg_proc p join pg_namespace n on n.oid=p.pronamespace where n.nspname='public' and p.prosecdef and proname in ('sync_offline_event_attendance','prepare_offline_event_package','start_event_attendance_session','record_live_facial_attendance') and not ('search_path=""' = any(coalesce(p.proconfig,array[]::text[])))),
  'triggers',(select jsonb_agg(tgname order by tgname) from pg_trigger t join pg_class c on c.oid=t.tgrelid join pg_namespace n on n.oid=c.relnamespace where n.nspname='public' and not t.tgisinternal and tgname in ('attendance_records_sync_late_reason_option','create_feedback_tasks_after_session_completion','event_resources_limit_five','queue_event_email_after_participant_reactivated'))
) as catalog;`);

const catalog = rows[0].catalog;
assertSameFingerprintSet(catalog.relations, requiredTables);
assert.equal(catalog.forbidden, null);
assert.equal(catalog.forbidden_columns, null);
assertSameFingerprintSet(catalog.critical_columns, [
  "admin_profiles.department_id", "admin_profiles.employee_number", "admin_profiles.office_name", "admin_profiles.profile_id",
  "attendance_records.event_session_id", "classes.department_id", "classes.faculty_id", "classes.program_id", "classes.room", "classes.schedule_label", "classes.section_id", "classes.semester_id", "classes.status", "classes.subject_code", "classes.subject_title", "classes.year_level", "class_rosters.class_id", "class_rosters.enrolled_at", "class_rosters.student_id",
  "faculty_profiles.department_id", "faculty_profiles.employee_number", "faculty_profiles.employment_status", "faculty_profiles.profile_id", "faculty_profiles.title",
  "verification_attempts.event_session_id"
]);
assertSameFingerprintSet(catalog.constraints, [
  "admin_profiles_department_id_fkey", "admin_profiles_employee_number_key", "admin_profiles_profile_id_fkey",
  "attendance_records_event_session_id_fkey", "classes_department_id_fkey", "classes_faculty_id_fkey", "classes_program_id_fkey", "classes_section_id_fkey", "classes_semester_id_fkey", "class_rosters_class_id_fkey", "class_rosters_class_id_student_id_key", "class_rosters_student_id_fkey",
  "faculty_profiles_department_id_fkey", "faculty_profiles_employee_number_key", "faculty_profiles_profile_id_fkey", "verification_attempts_event_session_id_fkey"
]);
assertSameFingerprintSet(catalog.fk_actions, [
  "admin_profiles_department_id_fkey:r", "admin_profiles_profile_id_fkey:c", "classes_department_id_fkey:r", "classes_faculty_id_fkey:r", "classes_program_id_fkey:r", "classes_section_id_fkey:r", "classes_semester_id_fkey:r", "class_rosters_class_id_fkey:c", "class_rosters_student_id_fkey:c", "faculty_profiles_department_id_fkey:r", "faculty_profiles_profile_id_fkey:c"
]);
assertSameFingerprintSet(catalog.indexes, [
  "admin_profiles_department_id_idx", "attendance_records_event_session_id_idx", "attendance_records_event_student_unique_idx", "attendance_records_local_uuid_unique_idx", "classes_department_id_idx", "classes_faculty_id_idx", "classes_offering_identity_unique_idx", "classes_program_id_idx", "classes_section_id_idx", "classes_semester_id_idx", "classes_status_idx", "class_rosters_class_id_idx", "class_rosters_student_id_idx", "faculty_profiles_department_id_idx", "verification_attempts_event_session_id_idx"
]);
assertSameFingerprintSet(catalog.rls, requiredTables);
assertSameFingerprintSet(catalog.policy_tables, ["admin_profiles", "attendance_records", "class_rosters", "event_sessions", "faculty_profiles", "verification_attempts"]);
assertSameFingerprintSet(catalog.new_policies, [
  "admin_profiles.admin_profiles_read_scoped", "classes.classes_read_active_user", "class_rosters.class_rosters_delete_manager", "class_rosters.class_rosters_insert_manager", "class_rosters.class_rosters_read_scoped", "faculty_profiles.faculty_profiles_read_scoped"
]);
assertSameFingerprintSet(catalog.authenticated_grants, [
  "admin_profiles.SELECT", "classes.SELECT", "class_rosters.DELETE", "class_rosters.INSERT", "class_rosters.SELECT", "faculty_profiles.SELECT"
]);
assert.equal(catalog.unsafe_table_grants, null);
assert.equal(catalog.unsafe_rpc_search_paths, null);
for (const name of ["sync_offline_event_attendance", "prepare_offline_event_package", "start_event_attendance_session", "record_live_facial_attendance", "get_live_facial_candidate_ids", "get_live_facial_candidates", "list_student_finalized_event_years", "get_student_dashboard_summary"]) assert.ok(catalog.rpcs.some((signature) => signature.startsWith(`${name}(`)), `Missing RPC ${name}`);
assertSameFingerprintSet(catalog.triggers, ["attendance_records_sync_late_reason_option", "create_feedback_tasks_after_session_completion", "event_resources_limit_five", "queue_event_email_after_participant_reactivated"]);
console.log("canonical structural catalog: passed");
