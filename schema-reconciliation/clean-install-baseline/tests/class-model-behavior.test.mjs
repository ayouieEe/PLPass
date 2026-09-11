import { execFileSync, spawnSync } from "node:child_process";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

const sql = `
begin;

insert into auth.users (id, instance_id, aud, role, email, encrypted_password, email_confirmed_at, raw_app_meta_data, raw_user_meta_data, created_at, updated_at)
values
  ('00000000-0000-0000-0000-000000000101', '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated', 'faculty@local.test', '', now(), '{}'::jsonb, '{}'::jsonb, now(), now()),
  ('00000000-0000-0000-0000-000000000102', '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated', 'student@local.test', '', now(), '{}'::jsonb, '{}'::jsonb, now(), now()),
  ('00000000-0000-0000-0000-000000000103', '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated', 'outside@local.test', '', now(), '{}'::jsonb, '{}'::jsonb, now(), now());

insert into public.departments (id, department_code, department_name)
values ('00000000-0000-0000-0000-000000000201', 'LOCAL', 'Local Department');
insert into public.programs (id, department_id, program_code, program_name)
values ('00000000-0000-0000-0000-000000000202', '00000000-0000-0000-0000-000000000201', 'LOCAL-BS', 'Local Program');
insert into public.sections (id, program_id, section_name, year_level, academic_year, semester)
values ('00000000-0000-0000-0000-000000000203', '00000000-0000-0000-0000-000000000202', 'A', 1, '2099-2100', 'First');
insert into public.semesters (id, semester_name, academic_year, start_date, end_date, status)
values ('00000000-0000-0000-0000-000000000204', 'First', '2099-2100', '2099-06-01', '2099-10-01', 'active');

insert into public.profiles (id, email, first_name, last_name, role, account_status, department_id, employee_id, student_id)
values
  ('00000000-0000-0000-0000-000000000101', 'faculty@local.test', 'Local', 'Faculty', 'faculty', 'active', '00000000-0000-0000-0000-000000000201', 'F-LOCAL', null),
  ('00000000-0000-0000-0000-000000000102', 'student@local.test', 'Local', 'Student', 'student', 'active', '00000000-0000-0000-0000-000000000201', null, 'S-LOCAL'),
  ('00000000-0000-0000-0000-000000000103', 'outside@local.test', 'Outside', 'Student', 'student', 'active', '00000000-0000-0000-0000-000000000201', null, 'S-OUTSIDE');
insert into public.faculty_profiles (profile_id, department_id, employee_number, employment_status, title)
values ('00000000-0000-0000-0000-000000000101', '00000000-0000-0000-0000-000000000201', 'F-LOCAL', 'active', 'Instructor');
insert into public.students (id, profile_id, student_id, program_id, department_id, section_id, year_level)
values
  ('00000000-0000-0000-0000-000000000301', '00000000-0000-0000-0000-000000000102', 'S-LOCAL', '00000000-0000-0000-0000-000000000202', '00000000-0000-0000-0000-000000000201', '00000000-0000-0000-0000-000000000203', 1),
  ('00000000-0000-0000-0000-000000000302', '00000000-0000-0000-0000-000000000103', 'S-OUTSIDE', '00000000-0000-0000-0000-000000000202', '00000000-0000-0000-0000-000000000201', '00000000-0000-0000-0000-000000000203', 1);
insert into public.classes (id, faculty_id, program_id, department_id, semester_id, subject_code, subject_title, room, section_id, year_level, schedule_label)
values ('00000000-0000-0000-0000-000000000401', '00000000-0000-0000-0000-000000000101', '00000000-0000-0000-0000-000000000202', '00000000-0000-0000-0000-000000000201', '00000000-0000-0000-0000-000000000204', 'LOCAL101', 'Local Subject', 'Local Room', '00000000-0000-0000-0000-000000000203', 1, 'Mon 09:00');
insert into public.class_rosters (class_id, student_id)
values ('00000000-0000-0000-0000-000000000401', '00000000-0000-0000-0000-000000000301');

do $$
begin
  begin
    insert into public.class_rosters (class_id, student_id)
    values ('00000000-0000-0000-0000-000000000401', '00000000-0000-0000-0000-000000000301');
    raise exception 'duplicate roster membership was accepted';
  exception when unique_violation then null;
  end;

  if to_regclass('public.event_sessions') is null
    or to_regclass('public.attendance_records') is null
    or to_regclass('public.verification_attempts') is null then
    raise exception 'canonical event attendance relations are missing';
  end if;
end;
$$;

select set_config('request.jwt.claim.sub', '00000000-0000-0000-0000-000000000101', true);
set local role authenticated;
do $$ declare visible_count integer; begin
  select count(*) into visible_count from public.class_rosters;
  if visible_count <> 1 then raise exception 'assigned faculty cannot read its roster'; end if;
end $$;
reset role;

select set_config('request.jwt.claim.sub', '00000000-0000-0000-0000-000000000103', true);
set local role authenticated;
do $$ declare visible_count integer; begin
  select count(*) into visible_count from public.class_rosters;
  if visible_count <> 0 then raise exception 'unassigned student can read another class roster'; end if;
end $$;
reset role;
rollback;
`;

const config = readFileSync(new URL("../supabase/config.toml", import.meta.url), "utf8");
const projectId = config.match(/^project_id\s*=\s*"([^"]+)"/m)?.[1];
assert.ok(projectId, "The isolated Supabase project ID is required for this local-only test");
const result = spawnSync("docker", ["exec", "-i", `supabase_db_${projectId}`, "psql", "-v", "ON_ERROR_STOP=1", "-U", "postgres", "-d", "postgres"], {
  input: sql,
  encoding: "utf8",
});
assert.equal(result.status, 0, result.stderr || result.stdout);
console.log("canonical class model behavior: passed");
