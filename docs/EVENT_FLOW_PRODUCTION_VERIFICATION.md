# Event Flow Production Verification

## Scope

This checklist covers organizer-controlled event preparation, session start and
end, QR/manual/face capture, Walk-ins, Time Out, feedback, summaries, offline
SQLite recovery, and Supabase reconciliation.

## Deterministic gates

| Gate | Evidence |
| --- | --- |
| Queue durability | Local SQLite tests cover idempotency, restart recovery, permanent conflicts, Time In/Out, owner scoping, and transient retries beyond four attempts. |
| Reconnect | Sync tests cover response loss after commit, timeout/network failure, throttling, conflicts, lifecycle start/end recovery, and Walk-in confirmation/discard. |
| Walk-ins | Unit and local Supabase integration cover invited reclassification, accepted enrolled Walk-ins, unknown-student discard, duplicate prevention, and separate checkout methods. |
| Summaries | Shared-summary and finalization tests cover total participants, Walk-ins, present, late, absent, and rate consistency. |
| Browser | Run Chromium, Firefox, and WebKit functional/accessibility suite from `npm run test:e2e`. |
| Database | Reset a disposable local Supabase database with `npx supabase db reset --local --no-seed --yes`, then run `npm run test:supabase:local`. |

## Required release commands

```powershell
npm run lint
npx tsc -b
npm test -- --retry=2
npm run build:desktop
npm run check:supabase
npm run check:bundle
npm run check:release
npm run test:e2e
```

For the local database gate, load values from `npx supabase status --output env`, set `LOCAL_SUPABASE_URL`, `LOCAL_SUPABASE_PUBLISHABLE_KEY`, and `LOCAL_SUPABASE_SECRET_KEY`, then run `npm run test:supabase:local` and `npm run test:e2e:supabase`.

## Acceptance rules

- A transient sync failure remains locally queued until an idempotent server confirmation; it is never exhausted after a fixed attempt count.
- A permanent conflict remains visible for review. A provisional Walk-in is deleted only after the server explicitly returns a permanent-discard disposition.
- The organizer remains on the live route while local lifecycle work is unresolved.
- Local and server summaries must agree after reconciliation, and cleanup remains blocked until all rows are confirmed.
- Run the complete command set twice consecutively. Any failure requires a root-cause fix, a regression test, and a new two-pass run.

## External deployment gates

Before production release, run the same suite against isolated staging fixtures and run linked production checks in read-only mode. Do not create production attendance fixtures. Record the deployed migration list, RPC signatures/grants, RLS/advisor results, and the final two green run identifiers with the release.
