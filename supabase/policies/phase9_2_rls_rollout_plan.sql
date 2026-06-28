-- Phase 9.2 RLS rollout plan and review-only policy draft.
-- This file is intentionally outside supabase/migrations.
-- Do not apply until real role-account testing confirms every policy.
-- No global Admin policy is proposed. Dean/Admin access is department-scoped
-- through public.dean_assignments(profile_id, department_id).
-- Do not create browser SELECT policies on public.nfc_credentials while
-- hash_token remains in that table.

-- Rollout sequence:
-- 1. Apply schema migrations and seed dean_assignments for approved Dean/Admin profiles.
-- 2. Create helper predicates or security-definer RPCs after review, especially for department scope.
-- 3. Enable RLS table-by-table in staging, starting with profiles and low-risk lookup tables.
-- 4. Verify Admin/Dean, Faculty, Organizer, and Student accounts through the actual browser app.
-- 5. Add write policies only for approved workflows. Keep attendance_logs, audit_logs,
--    session_audit_logs, ML result tables, and NFC hash data server-only.

-- Browser-exposed lookup/join tables and required read scope:
-- colleges: Dean/Admin read assigned colleges through assigned departments; Faculty/Organizer/Student read only rows needed by their visible records.
-- departments: Dean/Admin read assigned departments; users read their own department as needed.
-- programs: Dean/Admin read assigned department programs; students/faculty read programs joined to their own classes/records.
-- sections: Dean/Admin read sections in assigned department programs; faculty read sections for assigned classes; students read own section.
-- subjects, rooms, class_schedules: readable only when joined to visible classes/sessions.
-- event_categories: readable for visible events.

-- Portal ownership/read table plan:
-- profiles: each user reads own profile; Dean/Admin reads profiles in assigned departments.
-- students: student reads own row; Dean/Admin reads students in assigned departments.
-- faculty: faculty reads own row; Dean/Admin reads faculty in assigned departments.
-- organizers: organizer reads own row; Dean/Admin reads organizers in assigned departments.
-- classes/class_enrollments/class_sessions: faculty reads assigned classes; Dean/Admin reads assigned department class data; students read enrolled classes.
-- events/event_approvals/event_target_groups/event_participants/event_session_participants/event_sessions:
--   organizer reads own events; Dean/Admin reads assigned department events; students read events they are targeted to or participating in.
-- attendance_records: students read own records; faculty reads records for assigned class sessions; organizer reads records for own event sessions; Dean/Admin reads assigned department records.
-- attendance_requests and attendance_request_attachments: students read/create own requests; faculty/organizer review only requests for owned class/event sessions; Dean/Admin read assigned department requests.
-- notifications: users read/update only their own notifications.
-- generated_reports: users read reports they generated; Dean/Admin reads assigned department report metadata.
-- analytics read views/tables: read-only, review-only; Dean/Admin by department, faculty by assigned classes, organizer by owned events, student own metrics only.

-- Write-policy plan:
-- Student: create attendance_requests, credential_requests, update own notification read status.
-- Faculty: create/update class_sessions through approved frontend workflows; review class attendance_requests; no direct attendance_logs writes.
-- Organizer: create/update event_sessions through approved workflows; review event attendance_requests; no direct attendance_logs writes.
-- Dean/Admin: approve/reject department-scoped events, manage department users/classes metadata after Phase-specific approval.
-- Server-only: nfc_credentials.hash_token, attendance_logs inserts, audit_logs inserts, session_audit_logs inserts, ML result writes.

-- Review-only policy templates:
-- alter table public.<table_name> enable row level security;
-- create policy "<policy name>" on public.<table_name> for select using (<department or ownership predicate>);
-- create policy "<policy name>" on public.<table_name> for insert with check (<ownership predicate>);
-- create policy "<policy name>" on public.<table_name> for update using (<ownership predicate>) with check (<ownership predicate>);

-- Department-scoped Dean/Admin predicate pattern:
-- exists (
--   select 1
--   from public.dean_assignments da
--   where da.profile_id = auth.uid()
--     and da.department_id = <record_department_id>
-- )

-- No nfc_credentials SELECT policy should be created until Phase 10 separates hash_token
-- or provides metadata through a server-side endpoint/view that excludes hash_token.
