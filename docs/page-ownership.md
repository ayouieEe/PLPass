# Page Ownership

This map keeps portal collaboration focused on one route-owned page file at a time. Each page file listed below is the real editing location for that route's screen composition, hooks, tables, forms, and actions. Existing URLs, guards, layouts, navigation, repository hooks, and Supabase integration should remain unchanged unless a page-specific task requires a routed import update.

## Route Ownership

| Role | Route | Page file | Suggested owner | Notes |
| --- | --- | --- | --- | --- |
| Admin | `/admin` | `src/features/admin/pages/AdminRootPage.tsx` | Admin team Member 1 | Redirect/root landing for the admin portal. |
| Admin | `/admin/dashboard` | `src/features/admin/pages/AdminDashboardPage.tsx` | Admin team Member 1 | Dashboard and attendance summary work. |
| Admin | `/admin/users` | `src/features/admin/pages/UserManagementPage.tsx` | Admin team Member 2 | User, faculty, organizer, and student directory work. |
| Admin | `/admin/academic` | `src/features/admin/pages/AcademicManagementPage.tsx` | Admin team Member 3 | Academic, roster, class, and event approval work. |
| Admin | `/admin/attendance` | `src/features/admin/pages/AttendanceMonitoringPage.tsx` | Admin team Member 1 | Attendance monitoring work. |
| Admin | `/admin/nfc-credentials` | `src/features/admin/pages/NfcCredentialsPage.tsx` | Admin team Member 2 | Credential administration work. |
| Admin | `/admin/nfc-readers` | `src/features/admin/pages/NfcReadersPage.tsx` | Admin team Member 2 | Reader inventory and status work. |
| Admin | `/admin/reports` | `src/features/admin/pages/ReportsPage.tsx` | Admin team Member 3 | Report history and filter work. |
| Admin | `/admin/analytics` | `src/features/admin/pages/AnalyticsPage.tsx` | Admin team Member 3 | Review-only analytics work. |
| Admin | `/admin/audit-logs` | `src/features/admin/pages/AuditLogsPage.tsx` | Admin team Member 2 | Audit trail work. |
| Admin | `/admin/settings` | `src/features/admin/pages/SettingsPage.tsx` | Admin team Member 3 | System setting form work. |
| Faculty | `/faculty` | `src/features/faculty/pages/FacultyRootPage.tsx` | Faculty team Member 1 | Redirect/root landing for the faculty portal. |
| Faculty | `/faculty/dashboard` | `src/features/faculty/pages/FacultyDashboardPage.tsx` | Faculty team Member 1 | Dashboard and classes. |
| Faculty | `/faculty/classes` | `src/features/faculty/pages/MyClassesPage.tsx` | Faculty team Member 1 | Assigned class list and schedule view. |
| Faculty | `/faculty/classes/:classId` | `src/features/faculty/pages/ClassDetailsPage.tsx` | Faculty team Member 1 | Class roster/details route. |
| Faculty | `/faculty/sessions/start` | `src/features/faculty/pages/StartSessionPage.tsx` | Faculty team Member 2 | Class session start workflow. |
| Faculty | `/faculty/sessions/:sessionId` | `src/features/faculty/pages/ActiveSessionPage.tsx` | Faculty team Member 2 | Live class attendance session. |
| Faculty | `/faculty/attendance` | `src/features/faculty/pages/ClassAttendancePage.tsx` | Faculty team Member 2 | Attendance records. |
| Faculty | `/faculty/corrections` | `src/features/faculty/pages/CorrectionRequestsPage.tsx` | Faculty team Member 2 | Student correction review. |
| Faculty | `/faculty/reports` | `src/features/faculty/pages/FacultyReportsPage.tsx` | Faculty team Member 3 | Reports. |
| Faculty | `/faculty/analytics` | `src/features/faculty/pages/FacultyAnalyticsPage.tsx` | Faculty team Member 3 | Review-only analytics. |
| Faculty | `/faculty/profile` | `src/features/faculty/pages/FacultyProfilePage.tsx` | Faculty team Member 3 | Uses the shared profile screen. |
| Organizer | `/organizer` | `src/features/organizer/pages/OrganizerRootPage.tsx` | Organizer team Member 1 | Redirect/root landing for the organizer portal. |
| Organizer | `/organizer/dashboard` | `src/features/organizer/pages/OrganizerDashboardPage.tsx` | Organizer team Member 1 | Dashboard and events. |
| Organizer | `/organizer/events` | `src/features/organizer/pages/EventManagementPage.tsx` | Organizer team Member 1 | Event list and calendar work. |
| Organizer | `/organizer/events/create` | `src/features/organizer/pages/CreateEventPage.tsx` | Organizer team Member 1 | Event creation workflow. |
| Organizer | `/organizer/events/:eventId` | `src/features/organizer/pages/EventDetailsPage.tsx` | Organizer team Member 2 | Event details and participant context. |
| Organizer | `/organizer/sessions/:sessionId` | `src/features/organizer/pages/EventAttendancePage.tsx` | Organizer team Member 2 | Live event attendance. |
| Organizer | `/organizer/records` | `src/features/organizer/pages/EventRecordsPage.tsx` | Organizer team Member 2 | Attendance records and participants. |
| Organizer | `/organizer/reports` | `src/features/organizer/pages/EventReportsPage.tsx` | Organizer team Member 3 | Reports. |
| Organizer | `/organizer/analytics` | `src/features/organizer/pages/OrganizerAnalyticsPage.tsx` | Organizer team Member 3 | Review-only analytics. |
| Organizer | `/organizer/profile` | `src/features/organizer/pages/OrganizerProfilePage.tsx` | Organizer team Member 3 | Uses the shared profile screen. |
| Student | `/student` | `src/features/student/pages/StudentRootPage.tsx` | Student team Member 1 | Redirect/root landing for the student portal. |
| Student | `/student/dashboard` | `src/features/student/pages/StudentDashboardPage.tsx` | Student team Member 1 | Dashboard and schedule. |
| Student | `/student/attendance` | `src/features/student/pages/MyAttendancePage.tsx` | Student team Member 2 | Attendance records. |
| Student | `/student/schedule` | `src/features/student/pages/MySchedulePage.tsx` | Student team Member 1 | Schedule. |
| Student | `/student/corrections` | `src/features/student/pages/CorrectionRequestsPage.tsx` | Student team Member 2 | Attendance correction requests. |
| Student | `/student/nfc-credential` | `src/features/student/pages/NFCProfilePage.tsx` | Student team Member 3 | NFC profile and issue requests. |
| Student | `/student/reports` | `src/features/student/pages/StudentReportsPage.tsx` | Student team Member 3 | Report history. |
| Student | `/student/profile` | `src/features/student/pages/StudentProfilePage.tsx` | Student team Member 3 | Uses the shared profile screen. |

## Suggested Team Assignments

Admin team:

- Member 1: Dashboard and attendance pages
- Member 2: User, department-adjacent, NFC, and audit pages
- Member 3: Academic, class, reports, analytics, and settings pages

Faculty team:

- Member 1: Dashboard and classes
- Member 2: Attendance, live sessions, and student records/corrections
- Member 3: Reports, analytics, schedule-adjacent work, and profile pages

Organizer team:

- Member 1: Dashboard and events
- Member 2: Attendance, participants, details, and records
- Member 3: Reports, analytics, and profile pages

Student team:

- Member 1: Dashboard and schedule
- Member 2: Attendance and classes/corrections
- Member 3: Events, NFC profile, reports, and student profile pages

## Shared Files With One Owner

Assign one owner at a time for these files and folders because edits commonly create merge conflicts:

- Router configuration: `src/app/router/AppRouter.tsx`, `src/app/router/ProtectedRoute.tsx`, `src/app/router/RoleRoute.tsx`
- Navigation configuration: `src/lib/constants/navigation.ts`, `src/lib/constants/routes.ts`, `src/types/navigation.ts`
- Shared layout files: `src/app/layouts/AppLayout.tsx`, `src/app/layouts/DashboardLayout.tsx`, `src/app/layouts/RoleShellLayout.tsx`, `src/app/layouts/AuthLayout.tsx`
- Shared component library: `src/components/`
- Authentication and session providers: `src/app/providers/AppProviders.tsx`, `src/app/providers/DevelopmentSessionProvider.tsx`, `src/app/providers/developmentSessionContext.ts`, `src/app/providers/supabaseSessionResolver.ts`, `src/hooks/useDevelopmentSession.ts`
- Repository and Supabase integration: `src/hooks/useRepositoryQueries.ts`, `src/services/`, `src/lib/supabase/`
