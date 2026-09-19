-- The linked advisor and pg_stat_user_indexes showed two identical partial
-- unique indexes on attendance_records.local_attendance_uuid. Neither index
-- backs a constraint; retain the migration-owned unique_idx and remove only
-- the redundant uidx to reduce write and maintenance work.
drop index if exists public.attendance_records_local_uuid_uidx;
