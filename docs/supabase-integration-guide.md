# PLPass Supabase Integration Guide

## Environment

Create `.env.local` locally:

```bash
VITE_DATA_SOURCE=supabase
VITE_SUPABASE_URL=https://your-project-ref.supabase.co
VITE_SUPABASE_ANON_KEY=your-anon-key
```

Use only the anon key in the browser. Never place `service_role` keys in frontend files, committed env files, browser storage, logs, or screenshots.

## Mock Fallback

Use mock mode for local demos or recovery:

```bash
VITE_DATA_SOURCE=mock
```

Mock repositories and Phase 8 simulation remain intact.

## Generate Database Types

After linking the Supabase CLI to the development project:

```bash
npm run generate:db-types
npm run check:db-types
```

Generated types belong in `src/lib/supabase/database.types.ts`.

## Run With Supabase

```bash
npm install
npm run dev
```

Then sign in with a real Supabase Auth email/password account. The app reads `profiles.role` and redirects by database role.

## Manual Real-Account Verification Checklist

Use the existing login page only. Do not place passwords in `.env.local`, scripts, test files, screenshots, terminal commands, browser console snippets, or issue reports.

Before testing:

- Confirm `.env.local` contains `VITE_DATA_SOURCE=supabase`, `VITE_SUPABASE_URL`, and `VITE_SUPABASE_ANON_KEY`.
- Start the app with `npm run dev`.
- Open `/login` in the browser.
- Use one real Supabase Auth account at a time and enter the password manually.

For each real account:

| Role | Expected redirect | Required role record | Result |
| --- | --- | --- | --- |
| Admin or Dean | `/admin/dashboard` | `dean_assignments.profile_id` for the signed-in profile | Pending manual verification |
| Faculty | `/faculty/dashboard` | `faculty.profile_id` for the signed-in profile | Pending manual verification |
| Organizer | `/organizer/dashboard` | `organizers.profile_id` for the signed-in profile | Pending manual verification |
| Student | `/student/dashboard` | `students.profile_id` for the signed-in profile | Pending manual verification |

Checks to complete for every role:

- Sign in succeeds without exposing the password.
- The redirect matches the role listed in `profiles.role`.
- The shell displays the correct profile name and role-specific portal.
- The role-specific database record loads for the signed-in `profiles.id`.
- Browser refresh restores the same signed-in session and route.
- Sign out clears the session, clears cached role data, and returns to `/login`.
- Opening a protected URL after sign-out redirects back to `/login`.

Negative checks:

- A signed-in account without a `profiles` row must show a clear profile-not-found error.
- A signed-in account without the required role record must show a clear role-record error.
- Inactive or suspended profiles must not enter protected routes.

## Apply SQL Reviews

SQL files in `supabase/policies/` and `supabase/migrations/` are review drafts. Apply manually only after the project owner confirms the live schema and non-production target.

## Known Gaps

- Phase 10 live NFC attendance processing remains deferred.
- Edge Functions, QR token generation, file storage, and ML service writes remain deferred.
- Phase 9.2 RLS policies are drafted separately and are not enabled yet.
- Real-account redirect verification requires manual password entry by the project owner.
