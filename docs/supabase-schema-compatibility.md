# PLPass Supabase Schema Compatibility

Phase 9 compares the frontend domain contracts against the existing Supabase table list. No destructive migrations were applied.

## Frontend Mapper Decisions

- Frontend pages continue to consume domain models from `src/types/domain.ts`.
- Supabase rows are mapped in `src/lib/supabase/mappers.ts`.
- `nfc_credentials.hash_token` is never mapped into frontend domain models.
- NFC credential identifiers are masked before reaching UI models.
- `attendance_logs.device_id` is treated as optional for manual and online records.
- `class_sessions` and `event_sessions` are merged into the frontend `AttendanceSession` model.
- `attendance_records.class_session_id` and `attendance_records.event_session_id` are mapped into the single frontend `sessionId`.

## Required Schema Checks

| Area | Expected Support | Status |
| --- | --- | --- |
| `attendance_records.verification_method` | `nfc`, `qr`, `manual`, `online` | Verify enum/check constraint in Supabase. |
| `nfc_credentials.nfc_status` | `activated`, `inactive`, `lost`, `damaged`, `replaced`, `blocked` | Verify enum/check constraint in Supabase. |
| `nfc_credentials` timestamps | `issued_at`, `updated_at`, `last_successful_check_in_at` | Verify columns. |
| `events` timing | `start_time`, `end_time`, `attendance_mode`, `created_at`, `updated_at` | Verify columns. |
| session windows | `late_cutoff_at`, `attendance_window_start`, `attendance_window_end`, `ended_reason`, `created_by`, `updated_at` | Verify on `class_sessions` and `event_sessions`. |
| `attendance_requests` review | `explanation`, `reviewed_by`, `reviewed_at`, `rejection_reason`, `created_at`, `updated_at` | Verify columns. |
| `notifications` read state | `created_at`, `read_at` | Verify columns. |
| `generated_reports` state | `generated_at`, `report_status` | Verify columns. |
| `attendance_logs.device_id` | nullable for manual/online | Verify nullable constraint. |

## Migration Candidates

Create migration files only after confirming the live schema. Suggested drafts are in `supabase/migrations/phase9_constraint_review.sql`.

## Optional Frontend Follow-Up

- Replace placeholder `database.types.ts` with generated types using `npm run generate:db-types`.
- Tighten mapper field names once generated types confirm exact column names.
- Add dedicated Supabase integration fixtures against a non-production Supabase project.
