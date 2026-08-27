import { lazy, Suspense } from "react";
import { Navigate, Route, Routes } from "react-router-dom";
import { AuthenticatedLayout, PublicLayout } from "@/app/layouts/AppLayout";
import { RoleShellLayout } from "@/app/layouts/RoleShellLayout";
import { AccessDeniedPage } from "@/pages/AccessDeniedPage";
import { ForgotPasswordPage } from "@/pages/ForgotPasswordPage";
import { LoginPage } from "@/pages/LoginPage";
import { NotFoundPage } from "@/pages/NotFoundPage";
import { NotificationsPage } from "@/pages/NotificationsPage";
import { ProfilePage } from "@/pages/ProfilePage";
import { ResetPasswordPage } from "@/pages/ResetPasswordPage";
import { ProtectedRoute } from "@/app/router/ProtectedRoute";
import { RoleRoute } from "@/app/router/RoleRoute";
import { LoadingState } from "@/components/feedback/LoadingState";
import { APP_ROUTES } from "@/lib/constants/routes";

const OrganizerRootPage = lazy(() => import("@/features/organizer/pages/OrganizerRootPage").then((module) => ({ default: module.OrganizerRootPage })));
const OrganizerDashboardPage = lazy(() => import("@/features/organizer/pages/OrganizerDashboardPage").then((module) => ({ default: module.OrganizerDashboardPage })));
const EventManagementPage = lazy(() => import("@/features/organizer/pages/EventManagementPage").then((module) => ({ default: module.EventManagementPage })));
const CreateEventPage = lazy(() => import("@/features/organizer/pages/CreateEventPage").then((module) => ({ default: module.CreateEventPage })));
const OrganizerUserManagementPage = lazy(() => import("@/features/organizer/pages/OrganizerUserManagement").then((module) => ({ default: module.OrganizerUserManagementPage })));
const EventDetailsPage = lazy(() => import("@/features/organizer/pages/EventDetailsPage").then((module) => ({ default: module.EventDetailsPage })));
const EventAttendancePage = lazy(() => import("@/features/organizer/pages/EventAttendancePage").then((module) => ({ default: module.EventAttendancePage })));
const EventRecordsPage = lazy(() => import("@/features/organizer/pages/EventRecordsPage").then((module) => ({ default: module.EventRecordsPage })));
const AuthenticationMethodsPage = lazy(() => import("@/features/organizer/pages/AuthenticationMethodsPage").then((module) => ({ default: module.AuthenticationMethodsPage })));
const OrganizerAnalyticsPage = lazy(() => import("@/features/organizer/pages/OrganizerAnalyticsPage").then((module) => ({ default: module.OrganizerAnalyticsPage })));
const OrganizerCorrectionRequestsPage = lazy(() => import("@/features/organizer/pages/OrganizerCorrectionRequestsPage").then((module) => ({ default: module.OrganizerCorrectionRequestsPage })));
const OrganizerAuditLogsPage = lazy(() => import("@/features/organizer/pages/OrganizerAuditLogsPage").then((module) => ({ default: module.OrganizerAuditLogsPage })));
const OrganizerProfilePage = lazy(() => import("@/features/organizer/pages/OrganizerProfilePage").then((module) => ({ default: module.OrganizerProfilePage })));
const StudentRootPage = lazy(() => import("@/features/student/pages/StudentRootPage").then((module) => ({ default: module.StudentRootPage })));
const StudentDashboardPage = lazy(() => import("@/features/student/pages/StudentDashboardPage").then((module) => ({ default: module.StudentDashboardPage })));
const StudentSchedulePage = lazy(() => import("@/features/student/pages/StudentSchedulePage").then((module) => ({ default: module.StudentSchedulePage })));
const StudentUpcomingEventsPage = lazy(() => import("@/features/student/pages/StudentUpcomingEventsPage").then((module) => ({ default: module.StudentUpcomingEventsPage })));
const StudentEventDetailsPage = lazy(() => import("@/features/student/pages/StudentEventDetailsPage").then((module) => ({ default: module.StudentEventDetailsPage })));
const MyAttendancePage = lazy(() => import("@/features/student/pages/MyAttendancePage").then((module) => ({ default: module.MyAttendancePage })));
const AttendanceMethodsPage = lazy(() => import("@/features/student/pages/AttendanceMethodsPage").then((module) => ({ default: module.AttendanceMethodsPage })));
const RequestHistoryPage = lazy(() => import("@/features/student/pages/RequestHistoryPage").then((module) => ({ default: module.RequestHistoryPage })));
const StudentCorrectionRequestsPage = lazy(() => import("@/features/student/pages/CorrectionRequestsPage").then((module) => ({ default: module.CorrectionRequestsPage })));
const StudentProfilePage = lazy(() => import("@/features/student/pages/StudentProfilePage").then((module) => ({ default: module.StudentProfilePage })));

export function AppRouter() {
  return (
    <Suspense fallback={<LoadingState label="Loading workspace" />}>
    <Routes>
      <Route element={<PublicLayout />}>
        <Route index element={<Navigate to={APP_ROUTES.login} replace />} />
        <Route path={APP_ROUTES.login} element={<LoginPage />} />
        <Route path={APP_ROUTES.forgotPassword} element={<ForgotPasswordPage />} />
        <Route path={APP_ROUTES.resetPassword} element={<ResetPasswordPage />} />
        <Route path={APP_ROUTES.accessDenied} element={<AccessDeniedPage />} />
        <Route path="/home" element={<Navigate to="/" replace />} />
      </Route>
      <Route element={<ProtectedRoute />}>
        <Route element={<AuthenticatedLayout />}>
          <Route element={<RoleShellLayout />}>
            <Route path={APP_ROUTES.profile} element={<ProfilePage />} />
            <Route path={APP_ROUTES.notifications} element={<NotificationsPage />} />
            <Route element={<RoleRoute allowedRoles={["organizer"]} />}>
              <Route path={APP_ROUTES.organizer} element={<OrganizerRootPage />} />
              <Route path={APP_ROUTES.organizerDashboard} element={<OrganizerDashboardPage />} />
              <Route path={APP_ROUTES.organizerEvents} element={<EventManagementPage />} />
              <Route path={APP_ROUTES.organizerCreateEvent} element={<CreateEventPage />} />
              <Route path={APP_ROUTES.organizerUsers} element={<OrganizerUserManagementPage />} />
              <Route path="/organizer/events/:eventId" element={<EventDetailsPage />} />
              <Route path="/organizer/sessions/:sessionId" element={<EventAttendancePage />} />
              <Route path={APP_ROUTES.organizerRecords} element={<EventRecordsPage />} />
              <Route path={APP_ROUTES.organizerReports} element={<AuthenticationMethodsPage />} />
              <Route path={APP_ROUTES.organizerCorrections} element={<OrganizerCorrectionRequestsPage />} />
              <Route path={APP_ROUTES.organizerAnalytics} element={<OrganizerAnalyticsPage />} />
              <Route path={APP_ROUTES.organizerAuditLogs} element={<OrganizerAuditLogsPage />} />
              <Route path={APP_ROUTES.organizerProfile} element={<OrganizerProfilePage />} />
            </Route>
            <Route element={<RoleRoute allowedRoles={["student"]} />}>
              <Route path={APP_ROUTES.student} element={<StudentRootPage />} />
              <Route path={APP_ROUTES.studentDashboard} element={<StudentDashboardPage />} />
              <Route path={APP_ROUTES.studentSchedule} element={<StudentSchedulePage />} />
              <Route path={APP_ROUTES.studentUpcomingEvents} element={<StudentUpcomingEventsPage />} />
              <Route path="/student/events/:eventId" element={<StudentEventDetailsPage />} />
              <Route path={APP_ROUTES.studentAttendance} element={<MyAttendancePage />} />
              <Route path={APP_ROUTES.studentMethods} element={<AttendanceMethodsPage />} />
              <Route path={APP_ROUTES.studentRequestHistory} element={<RequestHistoryPage />} />
              <Route path={APP_ROUTES.studentCorrections} element={<StudentCorrectionRequestsPage />} />
              <Route path={APP_ROUTES.studentProfile} element={<StudentProfilePage />} />
            </Route>
          </Route>
        </Route>
      </Route>
      <Route element={<PublicLayout />}>
        <Route path="*" element={<NotFoundPage />} />
      </Route>
    </Routes>
    </Suspense>
  );
}
