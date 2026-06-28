# PLPass RLS Policy Matrix

These policies are drafted for review in `supabase/policies/phase9_rls_policy_review.sql`. Do not apply them to production without validating the existing schema and admin assignment rules.

| Role | Read Scope | Write Scope |
| --- | --- | --- |
| Student | Own profile, own student row, own enrollments, events where participant, own attendance records, own attendance requests, own credential requests, own reports, own notifications, masked credential status | Create attendance requests for own records, create credential requests, mark own notifications read |
| Faculty | Assigned classes, schedules and enrolled students for assigned classes, class sessions, class attendance records, class correction requests, class reports and analytics | Create/update class sessions for assigned classes, review class correction requests |
| Organizer | Owned events, participants for owned events, event sessions, event attendance records, event correction requests, event reports and analytics | Create/update owned events, manage owned event participants, create/update event sessions, review event correction requests |
| Admin | Records allowed by `dean_assignments` | Management actions allowed by `dean_assignments` |

## System-Protected Tables

Browser clients must not directly write:

- `nfc_credentials.hash_token`
- `attendance_logs`
- `session_audit_logs`
- ML result tables

Those write paths remain server-side work for later phases.
