# Admin and Organizer Permissions

This report summarizes the current frontend capability map, navigation, and route behavior.

Primary sources:

- `src/lib/auth/permissions.ts`
- `src/lib/constants/navigation.ts`
- `src/app/router/AppRouter.tsx`
- `src/features/admin/pages/AdminSystemHealthPage.tsx`
- `src/features/organizer/pages/OrganizerUserManagement.tsx`
- `src/features/organizer/pages/AuthenticationMethodsPage.tsx`

## Administrator permissions

### Administrators can

- Open the administrator dashboard.
- View all users.
- Create organizer accounts.
- Create administrator accounts.
- Create student accounts through user management.
- Change user account status.
- Revoke other users’ sessions after the approved backend deployment is applied.
- View all events.
- Open event details in the administrator read-only workflow.
- View institution-wide attendance records.
- View institution-wide reports.
- View institution-wide analytics.
- Manage QR and facial credential status institution-wide.
- Reset or revoke credentials.
- View all audit logs.
- Export audit logs.
- Manage system catalog data, including departments, programs, sections, and event categories.
- Manage system settings.
- View recent system errors.
- Retry permitted email jobs.
- Run data-consistency checks.
- Refresh administrator workspace query data manually.
- Recover an individual stuck attendance session.
- Finish an entire stuck event.
- Manage their own profile.
- View their own notifications.

### Administrators cannot

- Create events through the administrator workspace; the administrator create-event route is intentionally denied.
- Use organizer event-creation workflows.
- Manage events through the organizer-owned-event capability.
- Use the organizer live-attendance workflow as an event owner.
- Review organizer correction requests through the organizer correction-request page.
- Use organizer-owned reports or analytics routes.
- Use organizer-owned credential controls.
- Access the organizer user-management route.
- Revoke their own sessions through the session-revocation control.
- Read or expose raw facial descriptors.
- Access service-role or Brevo secrets from the frontend.
- Use student-only workflows such as submitting feedback, late reasons, or attendance correction requests as a student.
- Access another role’s workspace by navigating directly to its URL.

Administrator event pages are intended to be read-only for normal event operations. Recovery actions in System Health are separate administrative operations:

- **Recover session** affects one active attendance session.
- **Finish event** finalizes the whole event.

Both require the recovery capability and confirmation/reason handling.

## Organizer permissions

### Organizers can

- Open the organizer dashboard.
- View their own events.
- Create events.
- Manage events they own.
- Reschedule or cancel owned events where the event state permits it.
- Start and end attendance sessions for owned events.
- View owned event records.
- Use QR attendance.
- Use facial-recognition attendance.
- Use manual attendance.
- Use checkout/time-out attendance.
- Use offline attendance in the desktop app for prepared owned events.
- Synchronize offline attendance after reconnecting.
- Review correction requests for their own events.
- View owned-event reports.
- View owned-event analytics.
- Manage QR and facial credentials for students participating in their owned events.
- Activate or deactivate supported owned-event credentials.
- View their own audit logs.
- Export their own scoped audit logs.
- Manage their own profile.
- Manage their own personal settings.
- View their own notifications.

### Organizers cannot

- Access the administrator dashboard.
- View or manage all users institution-wide.
- Create administrator accounts.
- Create organizer accounts.
- Change arbitrary users’ account status.
- Revoke other users’ sessions.
- Revoke their own sessions through the administrator session-revocation control.
- View all institution-wide events.
- Manage another organizer’s event.
- Start or operate another organizer’s attendance session.
- View another organizer’s attendance records.
- View institution-wide reports or analytics.
- View institution-wide audit logs.
- Manage credentials for students outside their owned-event participant scope.
- Reset or revoke credentials institution-wide.
- Manage system settings.
- Manage catalog data.
- View system health or system errors.
- Retry administrative email jobs.
- Run system consistency checks.
- Recover or finish arbitrary attendance sessions through administrator System Health controls.
- Access administrator user-management routes.
- Access raw facial descriptors.
- Access service-role or Brevo secrets.
- Use offline attendance from a normal browser.
- Start an event that is not eligible under ownership, session, or scheduled-date rules.

## Organizer data scope

Organizer access is intended to be limited to:

- Events owned by the organizer.
- Participants attached to those owned events.
- Attendance, reports, analytics, corrections, credentials, and audit entries related to those owned events.

The frontend credential page now loads participant student IDs from owned events before loading credential data. The prepared backend enforcement is in:

`supabase/migrations/20260920065546_restrict_organizer_credential_scope.sql`

## Security and verification status

Local verification currently passes:

- Full test suite: 258 tests passed.
- Production build: passed.
- TypeScript compilation: passed.
- Realtime regression tests: passed.

The following still require role-based verification against PLPass Current before claiming complete backend enforcement:

- Foreign-event reads and writes by organizers.
- Foreign-participant credential access.
- Organizer audit-log isolation.
- Direct API attempts to read institution-wide student data.
- Organizer attempts to call administrator-only RPCs.
- Deployment parity for the session-revocation Edge Function and migration.

The report describes the intended and locally implemented permission behavior. It does not claim that unapplied remote migrations or undeployed Edge Functions are already active.
