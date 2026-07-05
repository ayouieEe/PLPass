# PLPass Admin Interface Specification

Admin means Dean-level access. Admin pages must operate through the existing Page -> React Query hook -> repository contract -> implementation -> Supabase path. Pages must not query Supabase directly, expose secrets, add fake downloads, or bypass assigned department scope.

## Admin Design Rules

- All Admin tables use `PLPassDataGrid`.
- Do not hardcode colors; use shared PLPass tokens and components.
- Do not bypass department scope. Show the current Dean scope on every page.
- Do not expose NFC secrets, QR token secrets, passwords, biometric templates, private media, or raw sensitive metadata.
- Do not add fake reports, fake exports, fake approvals, or unsupported state-changing actions.
- Keep page-specific content inside the matching Admin page file.
- Keep reusable Admin-only controls inside `src/features/admin/components/`.
- Use one visible page title per Admin route. The authenticated shell may identify the workspace, but page ownership belongs to the route heading.
- Keep page title, description, scope context, tabs, filters, and first content area close together with compact vertical spacing.
- Use full-width authenticated content. Cards, charts, grids, and details panels should align to the same content boundaries.
- Use compact badges for department scope, selected semester, and contextual filter state.
- Admin report actions belong on the relevant record tables as `XLSX` and `PDF` controls only. Do not use CSV controls and do not keep a separate Admin Reports route.
- Do not nest UI cards inside other cards. `PLPassDataGrid` is already a framed table surface, so section headers for grids should be unframed.
- Use white surfaces for primary work areas, mint-tinted secondary surfaces for unavailable or contextual panels, restrained borders, and subtle shadows.
- Disabled actions must state why they are unavailable through inline copy or a title/description.
- Settings/profile key-value information and simple forms are not tables and must not be forced into AG Grid.

## Shared Admin Component Usage

| Component | Purpose | Usage rule |
|---|---|---|
| `AdminFrame` | Route-level vertical rhythm. | Wrap every Admin page body once. |
| `AdminPageHeader` | Page title, short description, optional supported primary action. | Use once per route; avoid repeated Admin/Dean wording in the description. |
| `AdminContextBar` | Compact department, semester, and last-updated badges. | Use near the page header on every Admin route. |
| `AdminToolbar` | Shared search, filters, and lightweight actions. | Place immediately above the related grid or chart. |
| `AdminTabs` | Role/data-mode segmentation. | Use for major record groups such as user type, session type, or credential type. |
| `AdminSectionCard` | Non-table informational panels and chart cards. | Do not wrap `PLPassDataGrid` in this component. |
| `AdminStatGrid` | Balanced KPI card layout. | Use for compact summary cards. |
| `DetailPanel` | Concise secondary detail summaries. | Keep max width restrained; omit or mask sensitive fields. |
| `UnavailablePanel` | Honest unsupported capability notice. | Use for Phase-later capabilities instead of fake controls or fake data. |

## Responsive Behavior Rules

- Desktop, tablet, and mobile layouts must avoid browser-level horizontal scrolling.
- Data grids may scroll horizontally inside the grid shell only.
- Toolbars wrap search, filters, and actions without forcing page overflow.
- Tabs wrap onto multiple rows on narrow screens.
- The mobile Admin shell uses the shared navigation drawer and keeps route title, filters, and grids reachable without hidden controls.
- Empty tables keep column headers visible and use the shared grid empty overlay with a `0 records` summary.

## Route Inventory

| Admin route | Page file | Page purpose | Required sections | Required filters | Required grid columns | Available actions | Scope restrictions | Empty-state wording | Live repository dependency |
|---|---|---|---|---|---|---|---|---|---|
| `/admin` | `src/features/admin/pages/AdminRootPage.tsx` | Root Admin entry, renders the dedicated dashboard page. | Dashboard sections inherited from `AdminDashboardPage`. | Inherited dashboard filters. | Inherited dashboard grids. | None beyond dashboard actions. | Uses signed-in Admin repository context. | Inherited dashboard empty states. | Depends on dashboard repositories. |
| `/admin/dashboard` | `src/features/admin/pages/AdminDashboardPage.tsx` | Semester-based Dean overview for attendance and academic operations. | Scope bar, summary cards, attendance trend, active sessions preview, risk overview, attention-needed queue. | Academic year/semester context, activity type filter. | Active sessions: Session Type, Code, Subject or Event Name, Faculty or Organizer, Started At, Current Attendance Count, Session Status, View Details. | View-only dashboard actions; report and decision actions are not faked. | Displays assigned Dean department and current semester context; repository context controls data access. | `No active sessions`, `No attendance trend data`, `No risk analysis available yet`, `No review queue items`. | Users, students, attendance sessions/records, events, ML predictions. |
| `/admin/users` | `src/features/admin/pages/UserManagementPage.tsx` | Dean-scoped user directory. | Students, Faculty, Organizers tabs; filter toolbar; detail summary panel. | Search, displayed department scope, student status. | Students: Full Name, Student ID, Email, Department, Program, Year Level, Section, Enrollment Status, View Details. Faculty: Full Name, Employee ID, Department, Employment Type, Work Status, Assigned Classes Count, View Details. Organizers: Full Name, Role, Employee ID, Department, Position, Status, View Details. | View details only; no public registration, Auth creation, password admin, or cross-department management. | Loads through signed-in Admin repository context and displays the Dean scope; row-level enforcement remains repository/RLS responsibility until `dean_assignments` is exposed. | `No students found`, `No faculty found`, `No organizers found`. | Users, students, faculty profiles, organizer profiles, classes, attendance records, NFC credentials. |
| `/admin/academic` | `src/features/admin/pages/AcademicManagementPage.tsx` | Academic classes and event review queues. | Classes tab, Events tab, Approved Events queue, Pending Events queue, details panel. | Search, displayed department scope, semester context, displayed program/year context. | Classes: Subject Code, Subject Name, Assigned Faculty, Room, Schedule, Enrolled Students, Class Status, View Details. Events: Event Code, Event Name, Category, Venue, Date, Time, Participant Count, Approval Status, Approval Action. | Event approve/decline uses existing repository mutation. Class creation and roster changes are unavailable unless supported in a detail workflow. | Loads through signed-in Admin repository context and displays the Dean scope; approval UI is shown only for listed events. | `No classes found`, `No approved events found`, `No pending events found`. | Classes, events, event status mutation, users, faculty, students. |
| `/admin/attendance` | `src/features/admin/pages/AttendanceMonitoringPage.tsx` | Records page for completed class and event sessions. | Class Sessions tab, Event Sessions tab, attendee roster grid after selecting a session. | Search, department scope, semester context, completed session status, date/status context. | Sessions: Subject/Event Code, Subject/Event Name, Faculty/Category, Year and Section/Venue, Room/Time, Session Date, Present Count, Late Count, Absent Count, View Details. Roster: Student Name, Student ID, Program and Section, Attendance Status, Time In, Time Out, Verification Method, Notes or Correction Status. | View details and roster only; report generation unavailable until backend support exists. | Session query is scoped by repository context and selected semester/status; supporting entities are department scoped where supported. | `No completed sessions found`, `No attendee records found`. | Attendance sessions/records, classes, events, students, users, faculty. |
| `/admin/nfc-credentials` | `src/features/admin/pages/NfcCredentialsPage.tsx` | Authentication-method management area. | Summary cards, NFC Credentials, QR Credentials, Facial Enrollment tabs. | Search, department scope, program/year/section context, credential status. | NFC: Student Name, Student ID, Program, Section, Credential Reference, Date Issued, Status, Replacement Request Status, View Details. QR/Facial empty grids use safe placeholder columns. | View-only credential details; no browser credential writes. Replacement review requires existing backend support. | Student context passes department scope; raw credential values are masked. | `No NFC credentials found`, `No QR credentials available`, `No facial enrollment records`. | NFC credentials, NFC credential requests, students, users. QR and facial repositories are unavailable. |
| `/admin/nfc-readers` | `src/features/admin/pages/NfcReadersPage.tsx` | Device inventory and reader health. | Scope bar, status filters, reader grid. | Search, device status, department scope. | Reader Name, Device Reference, Assigned Room or Venue, Department, Device Status, Last Seen, Last Session Used, View Details. | View details only; no direct provisioning or browser-to-reader programming. | Filters reader rows to assigned department when department ids are available. | `No NFC readers found`. | NFC readers and attendance sessions. |
| `/admin/analytics` | `src/features/admin/pages/AnalyticsPage.tsx` | Review-only analytics and ML insights. | Risk distribution, participation chart, Absenteeism Risk Prediction, Attendance Anomaly Detection, Participation Clustering. | Search, department scope, semester context, date range context. | Risk: Student Name, Student ID, Class/Event Context, Risk Level, Supporting Attendance Indicators, Last Updated, View Details. Anomaly: Class/Event, Anomaly Type, Detected Date, Severity, Supporting Metric, View Details. Clustering: Student Name, Student ID, Cluster Label, Attendance Pattern Summary, Last Updated, View Details. | View details only; never automatically changes status, grades, attendance, or permissions. | Supporting classes/events/students are queried with department scope where supported. | `No absenteeism risk signals`, `No attendance anomalies`, `No participation clusters`. | ML predictions, students, users, classes, events. |
| `/admin/audit-logs` | `src/features/admin/pages/AuditLogsPage.tsx` | Read-only traceability page. | Scope bar, safe filters, audit grid. | Search, entity type, department scope. | Timestamp, Actor, Role, Action, Entity Type, Entity Reference, Result, Details. | No edit/delete actions. | Audit data is loaded through Admin repository context; unsafe metadata keys are suppressed in display. | `No audit logs found`. | Audit logs and users. |
| `/admin/settings` | `src/features/admin/pages/SettingsPage.tsx` | Admin profile and supported settings. | Profile information, settings form, unavailable profile-action notice. | Department scope and current semester context. | No record grid; this is a profile/settings form, not a table. | Save supported system settings; profile picture, notification persistence, role changes, and password changes are unavailable or delegated to secure auth. | Department assignment is read-only and controlled by Dean assignment administration. | Not applicable. | Admin profile, users, system settings, academic catalog. |

## Planned or Unavailable Features

- `dean_assignments` is not exposed as a frontend domain type or repository hook yet. Current pages show the assigned Admin profile department and use repository context plus supported `departmentId` filters.
- QR credential records, facial enrollment records, biometric storage, report file generation, PDF/XLSX export, profile image storage, and Admin role-change flows are not implemented in the current backend.
- Device provisioning, raw reader programming, direct NFC credential writing, service-role access, and secret/token display remain intentionally unavailable.
