# Phase 10 — Release and Defense Readiness

## Delivered

- Added a project README with setup, test, security, and release commands.
- Replaced project-specific environment examples with safe placeholders.
- Added an executable repository/production release preflight.
- Added deployment, staging verification, smoke-test, and rollback instructions.
- Added organizer and student UAT acceptance checklists.
- Added a biometric privacy and governance checklist.

## Release preflight scope

- Node.js version
- Required release artifacts and documentation
- Required biometric security migration
- Accidental frontend service-role/secret-key references
- Completed production build artifact
- Optional production URL, publishable key, and non-mock data-source validation

## UI impact

None. This phase adds operational safeguards and capstone defense evidence.

## Final external gates

1. Apply and test migrations in isolated local/staging Supabase.
2. Complete real multi-account database authorization testing.
3. Complete organizer/student UAT and manual assistive-technology checks.
4. Configure hosting, Auth redirects, monitoring, backups, email delivery, and incident ownership.
5. Obtain privacy/adviser approval for biometric processing.
