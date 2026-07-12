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
import {
  CreateEventPage,
  EventAttendancePage,
  EventDetailsPage,
  EventManagementPage,
  EventRecordsPage,
  AuthenticationMethodsPage,
  OrganizerAnalyticsPage,
  OrganizerCorrectionRequestsPage,
  OrganizerDashboardPage,
  OrganizerProfilePage,
  OrganizerUserManagementPage,
  OrganizerRootPage
} from "@/features/organizer/pages";
import {
  CorrectionRequestsPage as StudentCorrectionRequestsPage,
  MyAttendancePage,
  AttendanceMethodsPage,
  StudentEventDetailsPage,
  StudentDashboardPage,
  StudentSchedulePage,
  StudentUpcomingEventsPage,
  RequestHistoryPage,
  StudentProfilePage,
  StudentRootPage
} from "@/features/student/pages";
import { APP_ROUTES } from "@/lib/constants/routes";

export function AppRouter() {
  return (
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
  );
}
