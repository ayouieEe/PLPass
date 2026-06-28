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

## Apply SQL Reviews

SQL files in `supabase/policies/` and `supabase/migrations/` are review drafts. Apply manually only after the project owner confirms the live schema and non-production target.

## Known Gaps

- Generated DB types were not available in this workspace.
- Live Supabase credentials were not provided.
- Phase 10 live NFC attendance processing remains deferred.
- Edge Functions, QR token generation, file storage, and ML service writes remain deferred.
