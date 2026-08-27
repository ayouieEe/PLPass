# Phase 6 — Performance and Cross-Browser Readiness

## Delivered

- Deferred the organizer dashboard and its charting dependency until the organizer dashboard route is opened.
- Split stable React, Supabase, TanStack Query, and icon dependencies into cacheable vendor chunks.
- Added Firefox and WebKit projects alongside Chromium in Playwright.
- Ran the full organizer, student, mobile, accessibility-smoke, and role-isolation suite in all three browser engines.

## Performance result

- Original initial JavaScript: approximately 1,121.82 kB / 309.90 kB gzip in one application chunk.
- After deferring the organizer dashboard: approximately 685.57 kB / 191.96 kB gzip in the application chunk.
- Final application-owned initial chunk: approximately 233.11 kB / 61.49 kB gzip.
- Stable framework and service code is now split into browser-cacheable chunks.
- The meaningful first-load gzip reduction from route deferral is approximately 38%; vendor splitting primarily improves caching and update efficiency rather than reducing aggregate first-load bytes.

Large facial recognition and AG Grid chunks remain, but they are feature chunks rather than part of the initial page load. The build warning therefore remains informational. Further reductions would require replacing or more deeply customizing those libraries.

The shared grid now registers only the AG Grid Community modules used by PLPass instead of `AllCommunityModule`. This reduced its deferred JavaScript chunk from approximately 1,149.91 kB to 857.87 kB raw (about 25%) while preserving client-side rows, standard filters, pagination, selection, styling, rendering APIs, and accessibility behavior.

## Verification

- Production build: passed (2,723 modules transformed).
- Lint: passed with zero reported errors or warnings.
- Unit and integration suite: 80/80 passed across 9 files.
- Chromium browser journeys: 8/8 passed.
- Firefox browser journeys: 8/8 passed.
- WebKit browser journeys: 8/8 passed.
- Total browser journeys: 24/24 passed.

## UI impact

There is no intentional visual change. The organizer dashboard may briefly show the existing workspace loading state on first entry while its chart code loads. Subsequent visits benefit from browser caching.

## Remaining performance work

1. Measure real Core Web Vitals on a deployed staging build over mobile and constrained-network profiles.
2. **Resolved in Phase 8:** the initial-route bundle budget runs in CI.
3. **Resolved:** AG Grid now uses an explicit tree-shakable module set; grid module registration is checked through browser console assertions.
4. Confirm facial-recognition model download and inference performance on the minimum supported student/organizer devices.
5. **Resolved for stable CI:** Phase 4 added canonical Chromium desktop/mobile baselines in a dedicated Windows job; functional and accessibility behavior remains covered in Chromium, Firefox, and WebKit.

## Current Phase 6 status (2026-08-25)

All repository-side Phase 6 work is complete. The production build passes, initial JavaScript is 679.56 kB raw / 187.65 kB gzip against the 800/220 kB budget, and focused grid checks pass in all three browser engines. Remaining work requires a deployed staging URL and physical minimum-spec devices: collect real Core Web Vitals under constrained mobile networking and measure facial-model download, initialization, memory use, inference latency, thermal behavior, and fallback usability.
