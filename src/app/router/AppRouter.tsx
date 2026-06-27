import { lazy, Suspense } from "react";
import { Navigate, Route, Routes } from "react-router-dom";
import { AuthenticatedLayout, PublicLayout } from "@/app/layouts/AppLayout";
import { RoleShellLayout } from "@/app/layouts/RoleShellLayout";
import { AccessDeniedPage } from "@/pages/AccessDeniedPage";
import { DevelopmentHomePage } from "@/pages/DevelopmentHomePage";
import { ForgotPasswordPage } from "@/pages/ForgotPasswordPage";
import { LoginPage } from "@/pages/LoginPage";
import { NotFoundPage } from "@/pages/NotFoundPage";
import { NotificationsPage } from "@/pages/NotificationsPage";
import { PlaceholderPage } from "@/pages/PlaceholderPage";
import { ProfilePage } from "@/pages/ProfilePage";
import { ResetPasswordPage } from "@/pages/ResetPasswordPage";
import { ProtectedRoute } from "@/app/router/ProtectedRoute";
import { RoleRoute } from "@/app/router/RoleRoute";
import {
  AdminAcademicPage,
  AdminAnalyticsPage,
  AdminAttendancePage,
  AdminAuditLogsPage,
  AdminDashboardPage,
  AdminNfcCredentialsPage,
  AdminNfcReadersPage,
  AdminReportsPage,
  AdminRootPage,
  AdminSettingsPage,
  AdminUsersPage
} from "@/features/admin/AdminPages";
import {
  FacultyActiveSessionPage,
  FacultyAnalyticsPage,
  FacultyAttendancePage,
  FacultyClassDetailsPage,
  FacultyClassesPage,
  FacultyCorrectionsPage,
  FacultyDashboardPage,
  FacultyReportsPage,
  FacultyRootPage,
  FacultyStartSessionPage
} from "@/features/faculty/FacultyPages";
import {
  OrganizerActiveSessionPage,
  OrganizerAnalyticsPage,
  OrganizerCreateEventPage,
  OrganizerDashboardPage,
  OrganizerEventDetailsPage,
  OrganizerEventsPage,
  OrganizerRecordsPage,
  OrganizerReportsPage,
  OrganizerRootPage
} from "@/features/organizer/OrganizerPages";
import {
  StudentAttendancePage,
  StudentCorrectionsPage,
  StudentDashboardPage,
  StudentNfcCredentialPage,
  StudentReportsPage,
  StudentRootPage,
  StudentSchedulePage
} from "@/features/student/StudentPages";
import { APP_ROUTES } from "@/lib/constants/routes";

const ComponentPreviewPage = lazy(() =>
  import("@/pages/ComponentPreviewPage").then((module) => ({ default: module.ComponentPreviewPage }))
);

export function AppRouter() {
  return (
    <Routes>
      <Route element={<PublicLayout />}>
        <Route index element={<DevelopmentHomePage />} />
        <Route path={APP_ROUTES.login} element={<LoginPage />} />
        <Route path={APP_ROUTES.forgotPassword} element={<ForgotPasswordPage />} />
        <Route path={APP_ROUTES.resetPassword} element={<ResetPasswordPage />} />
        <Route
          path={APP_ROUTES.components}
          element={
            <Suspense fallback={<PlaceholderPage title="Component preview loading" />}>
              <ComponentPreviewPage />
            </Suspense>
          }
        />
        <Route path={APP_ROUTES.accessDenied} element={<AccessDeniedPage />} />
        <Route path="/home" element={<Navigate to="/" replace />} />
      </Route>
      <Route element={<ProtectedRoute />}>
        <Route element={<AuthenticatedLayout />}>
          <Route element={<RoleShellLayout />}>
            <Route path={APP_ROUTES.profile} element={<ProfilePage />} />
            <Route path={APP_ROUTES.notifications} element={<NotificationsPage />} />
            <Route path={APP_ROUTES.dashboard} element={<PlaceholderPage title="Dashboard" />} />
            <Route element={<RoleRoute allowedRoles={["admin"]} />}>
              <Route path={APP_ROUTES.admin} element={<AdminRootPage />} />
              <Route path={APP_ROUTES.adminDashboard} element={<AdminDashboardPage />} />
              <Route path={APP_ROUTES.adminUsers} element={<AdminUsersPage />} />
              <Route path={APP_ROUTES.adminAcademic} element={<AdminAcademicPage />} />
              <Route path={APP_ROUTES.adminAttendance} element={<AdminAttendancePage />} />
              <Route path={APP_ROUTES.adminNfcCredentials} element={<AdminNfcCredentialsPage />} />
              <Route path={APP_ROUTES.adminNfcReaders} element={<AdminNfcReadersPage />} />
              <Route path={APP_ROUTES.adminReports} element={<AdminReportsPage />} />
              <Route path={APP_ROUTES.adminAnalytics} element={<AdminAnalyticsPage />} />
              <Route path={APP_ROUTES.adminAuditLogs} element={<AdminAuditLogsPage />} />
              <Route path={APP_ROUTES.adminSettings} element={<AdminSettingsPage />} />
            </Route>
            <Route element={<RoleRoute allowedRoles={["faculty"]} />}>
              <Route path={APP_ROUTES.faculty} element={<FacultyRootPage />} />
              <Route path={APP_ROUTES.facultyDashboard} element={<FacultyDashboardPage />} />
              <Route path={APP_ROUTES.facultyClasses} element={<FacultyClassesPage />} />
              <Route path="/faculty/classes/:classId" element={<FacultyClassDetailsPage />} />
              <Route path={APP_ROUTES.facultyStartSession} element={<FacultyStartSessionPage />} />
              <Route path="/faculty/sessions/:sessionId" element={<FacultyActiveSessionPage />} />
              <Route path={APP_ROUTES.facultyAttendance} element={<FacultyAttendancePage />} />
              <Route path={APP_ROUTES.facultyCorrections} element={<FacultyCorrectionsPage />} />
              <Route path={APP_ROUTES.facultyReports} element={<FacultyReportsPage />} />
              <Route path={APP_ROUTES.facultyAnalytics} element={<FacultyAnalyticsPage />} />
              <Route path={APP_ROUTES.facultyProfile} element={<ProfilePage />} />
            </Route>
            <Route element={<RoleRoute allowedRoles={["organizer"]} />}>
              <Route path={APP_ROUTES.organizer} element={<OrganizerRootPage />} />
              <Route path={APP_ROUTES.organizerDashboard} element={<OrganizerDashboardPage />} />
              <Route path={APP_ROUTES.organizerEvents} element={<OrganizerEventsPage />} />
              <Route path={APP_ROUTES.organizerCreateEvent} element={<OrganizerCreateEventPage />} />
              <Route path="/organizer/events/:eventId" element={<OrganizerEventDetailsPage />} />
              <Route path="/organizer/sessions/:sessionId" element={<OrganizerActiveSessionPage />} />
              <Route path={APP_ROUTES.organizerRecords} element={<OrganizerRecordsPage />} />
              <Route path={APP_ROUTES.organizerReports} element={<OrganizerReportsPage />} />
              <Route path={APP_ROUTES.organizerAnalytics} element={<OrganizerAnalyticsPage />} />
              <Route path={APP_ROUTES.organizerProfile} element={<ProfilePage />} />
            </Route>
            <Route element={<RoleRoute allowedRoles={["student"]} />}>
              <Route path={APP_ROUTES.student} element={<StudentRootPage />} />
              <Route path={APP_ROUTES.studentDashboard} element={<StudentDashboardPage />} />
              <Route path={APP_ROUTES.studentAttendance} element={<StudentAttendancePage />} />
              <Route path={APP_ROUTES.studentSchedule} element={<StudentSchedulePage />} />
              <Route path={APP_ROUTES.studentCorrections} element={<StudentCorrectionsPage />} />
              <Route path={APP_ROUTES.studentNfcCredential} element={<StudentNfcCredentialPage />} />
              <Route path={APP_ROUTES.studentReports} element={<StudentReportsPage />} />
              <Route path={APP_ROUTES.studentProfile} element={<ProfilePage />} />
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
