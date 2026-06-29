# AG Grid Migration Audit

Date: 2026-06-29

This audit covers `src/` after the system-wide migration to the shared `PLPassDataGrid` wrapper.

## Scan Results

- Raw HTML table markup: none found with `<table>`, `<thead>`, `<tbody>`, `<tr>`, `<th>`, or `<td>`.
- Page or feature `DataTable` usage: none. `src/components/tables/DataTable.tsx` remains only as a compatibility adapter and internally renders `PLPassDataGrid`.
- Page-specific table pagination: none found in table-bearing pages. Table pagination is handled by `PLPassDataGrid`.
- Rendered AG Grid DOM: verified with headless Chromium against a mock-mode Vite server.
- Empty tables: verified to mount `.ag-root-wrapper` and show the shared AG Grid no-rows overlay inside `PLPassDataGrid`.
- Populated tables: representative populated grids in Admin, Faculty, Organizer, and Student verified sorting, pagination, column resizing, grid-only horizontal scrolling, and no browser viewport horizontal scrolling.
- Manual table replacements: rendered checks found no `table`, `[role="table"]`, or non-AG `[role="rowgroup"]` outside AG Grid.

## Shared Grid Infrastructure

- `src/components/data-display/PLPassDataGrid.tsx`: shared AG Grid wrapper for all real tables, including empty states.
- `src/components/data-display/plpassDataGridTheme.ts`: shared AG Grid theme options.
- `src/components/data-display/plpassDataGridTypes.ts`: shared grid type aliases.
- `src/components/data-display/plpassDataGridRenderers.tsx`: shared render helpers.
- `src/components/tables/DataTable.tsx`: legacy adapter only. It should not be used by pages or new feature components.

## Rendered Verification Inventory

| Route or Feature | PLPassDataGrid File | Empty Grid Verified | Populated Grid Verified | DOM AG Grid Class Verified |
| --- | --- | --- | --- | --- |
| `/admin/users` - Student users, faculty users, organizer users | `src/features/admin/pages/UserManagementPage.tsx` | Yes, filtered no-match users | Yes | Yes, `.ag-root-wrapper` |
| `/admin/academic` - Academic classes and events | `src/features/admin/pages/AcademicManagementPage.tsx` | Not applicable in fixture | Yes | Yes, `.ag-root-wrapper` |
| `/admin/attendance` - Attendance sessions and records | `src/features/admin/pages/AttendanceMonitoringPage.tsx` | Not applicable in fixture | Yes | Yes, `.ag-root-wrapper` |
| `/admin/nfc-credentials` - NFC credentials | `src/features/admin/pages/NfcCredentialsPage.tsx` | Not applicable in fixture | Yes | Yes, `.ag-root-wrapper` |
| `/admin/nfc-readers` - NFC readers | `src/features/admin/pages/NfcReadersPage.tsx` | Not applicable in fixture | Yes | Yes, `.ag-root-wrapper` |
| `/admin/reports` - Admin report history | `src/features/admin/pages/ReportsPage.tsx` | Not applicable in fixture | Yes | Yes, `.ag-root-wrapper` |
| `/admin/analytics` - Admin analytics signals | `src/features/admin/pages/AnalyticsPage.tsx` | Not applicable in fixture | Yes | Yes, `.ag-root-wrapper` |
| `/admin/audit-logs` - Audit logs | `src/features/admin/pages/AuditLogsPage.tsx` | Not applicable in fixture | Yes | Yes, `.ag-root-wrapper` |
| `/faculty/classes` - Assigned classes | `src/features/faculty/pages/MyClassesPage.tsx` | Not applicable in fixture | Yes | Yes, `.ag-root-wrapper` |
| `/faculty/classes/:classId` - Class roster and class sessions | `src/features/faculty/pages/ClassDetailsPage.tsx` | Not applicable in fixture | Yes | Yes, `.ag-root-wrapper` |
| `/faculty/attendance` - Faculty attendance sessions and records | `src/features/faculty/pages/ClassAttendancePage.tsx` | Yes, Faculty Two attendance | Yes | Yes, `.ag-root-wrapper` |
| `/faculty/corrections` - Faculty correction requests | `src/features/faculty/pages/CorrectionRequestsPage.tsx` | Not applicable in fixture | Yes | Yes, `.ag-root-wrapper` |
| `/faculty/reports` - Faculty report history | `src/features/reports/ReportHistoryTable.tsx` | Not applicable in fixture | Yes | Yes, `.ag-root-wrapper` |
| `/faculty/analytics` - Faculty analytics insights | `src/features/faculty/pages/FacultyAnalyticsPage.tsx` | Not applicable in fixture | Yes | Yes, `.ag-root-wrapper` |
| `/faculty/sessions/:sessionId` - Live class attendance records | `src/features/attendance/LiveAttendanceList.tsx` | Not applicable in fixture | Yes | Yes, `.ag-root-wrapper` |
| `/organizer/events` - Organizer events | `src/features/organizer/pages/EventManagementPage.tsx` | Not applicable in fixture | Yes | Yes, `.ag-root-wrapper` |
| `/organizer/events/:eventId` - Event participants and sessions | `src/features/organizer/pages/EventDetailsPage.tsx` | Not applicable in fixture | Yes | Yes, `.ag-root-wrapper` |
| `/organizer/records` - Event sessions, attendance records, correction requests | `src/features/organizer/pages/EventRecordsPage.tsx` | Yes, Organizer Two records | Yes | Yes, `.ag-root-wrapper` |
| `/organizer/reports` - Organizer report history | `src/features/reports/ReportHistoryTable.tsx` | Not applicable in fixture | Yes | Yes, `.ag-root-wrapper` |
| `/organizer/analytics` - Organizer analytics insights | `src/features/organizer/pages/OrganizerAnalyticsPage.tsx` | Not applicable in fixture | Yes | Yes, `.ag-root-wrapper` |
| `/organizer/sessions/:sessionId` - Live event attendance records | `src/features/attendance/LiveAttendanceList.tsx` | Not applicable in fixture | Yes | Yes, `.ag-root-wrapper` |
| `/student/schedule` - Student schedule | `src/features/student/pages/StudentSchedulePage.tsx` | Not applicable in Student 01 fixture | Yes | Yes, `.ag-root-wrapper` |
| `/student/attendance` - Previous sessions and attendance log modal | `src/features/student/pages/MyAttendancePage.tsx` | Not applicable in Student 01 modal fixture | Yes | Yes, `.ag-root-wrapper` |
| `/student/nfc-credential` - NFC tap history | `src/features/student/pages/AttendanceMethodsPage.tsx` | Not applicable in Student 01 fixture | Yes | Yes, `.ag-root-wrapper` |
| `/student/corrections` - Correction request history | `src/features/student/pages/CorrectionRequestsPage.tsx` | Yes, Student 01 corrections | Not applicable in Student 01 fixture | Yes, `.ag-root-wrapper` |
| `/student/reports` - Student report history | `src/features/student/pages/StudentReportsPage.tsx` | Yes, Student 02 reports | Yes, Student 01 reports | Yes, `.ag-root-wrapper` |
| `/components` - Component preview student table | `src/pages/ComponentPreviewPage.tsx` | Not part of authenticated portal verification | Source migrated | Source uses `PLPassDataGrid` |

## Audited Exclusions

These surfaces were intentionally not converted because they are not real tables:

- Dashboard metric cards and KPI summaries in admin, faculty, organizer, and student dashboards.
- Chart components and chart legends, including risk, trend, pie, and participation visualizations.
- Calendar layouts in student attendance views.
- Profile detail panels and settings summaries that render key-value `dl` content.
- Notification feed cards in `src/pages/NotificationsPage.tsx`.
- Login account picker groups and public development links.
- Filter bars, segmented tabs, select options, and form option lists.
- Compact confirmation or selection summaries, including selected event participants in `src/features/organizer/pages/CreateEventPage.tsx`.
- Schedule and session cards such as `ClassScheduleCard`, `EventScheduleCard`, `SessionCard`, and dashboard risk cards.
- Report preview cards and export-type selection cards.
- Manual lookup and NFC reader control panels, which are live input/control widgets rather than record tables.

## Maintenance Rule

Any future feature that renders rows and columns as a record list should import `PLPassDataGrid` directly from `src/components/data-display/PLPassDataGrid.tsx`. Do not add new raw HTML table markup, page-local table wrappers, page-local table pagination, or new page usage of the legacy `DataTable` adapter.
