import { lazy, Suspense } from "react";
import { Navigate, Outlet, Route, Routes, useLocation } from "react-router-dom";
import { AuthenticatedLayout, PublicLayout } from "@/app/layouts/AppLayout";
import { RoleShellLayout } from "@/app/layouts/RoleShellLayout";
import { AccessDeniedPage } from "@/pages/AccessDeniedPage";
import { ForgotPasswordPage } from "@/pages/ForgotPasswordPage";
import { LoginPage } from "@/pages/LoginPage";
import { NotFoundPage } from "@/pages/NotFoundPage";
import { NotificationsPage } from "@/pages/NotificationsPage";
import { ProfilePage } from "@/pages/ProfilePage";
import { ResetPasswordPage } from "@/pages/ResetPasswordPage";
import { LegalPolicyPage } from "@/pages/LegalPolicyPage";
import { ProtectedRoute } from "@/app/router/ProtectedRoute";
import { RoleRoute } from "@/app/router/RoleRoute";
import { LoadingState } from "@/components/feedback/LoadingState";
import { APP_ROUTES } from "@/lib/constants/routes";
import { useDevelopmentSession } from "@/hooks/useDevelopmentSession";
import { useQuery } from "@tanstack/react-query";
import { allCurrentLegalDocumentsAccepted, getLegalAcceptanceStatus } from "@/lib/legal/acceptance";
import { getPasswordLinkType, getPasswordSetupPath, hasPasswordSetupPayload } from "@/lib/auth/recovery";
import { AdminCatalogsPage, AdminSettingsPage } from "@/features/admin/pages/AdminSettingsPage";

const OrganizerRootPage = lazy(() => import("@/features/organizer/pages/OrganizerRootPage").then((module) => ({ default: module.OrganizerRootPage })));
const OrganizerDashboardPage = lazy(() => import("@/features/organizer/pages/OrganizerDashboardPage").then((module) => ({ default: module.OrganizerDashboardPage })));
const EventManagementPage = lazy(() => import("@/features/organizer/pages/EventManagementPage").then((module) => ({ default: module.EventManagementPage })));
const CreateEventPage = lazy(() => import("@/features/organizer/pages/CreateEventPage").then((module) => ({ default: module.CreateEventPage })));
const EventDetailsPage = lazy(() => import("@/features/organizer/pages/EventDetailsPage").then((module) => ({ default: module.EventDetailsPage })));
const OfflineOrganizerEventsPage = lazy(() => import("@/features/offline/OfflineOrganizerPages").then((module) => ({ default: module.OfflineOrganizerEventsPage })));
const OfflineOrganizerEventDetailsPage = lazy(() => import("@/features/offline/OfflineOrganizerPages").then((module) => ({ default: module.OfflineOrganizerEventDetailsPage })));
const OfflineOrganizerLiveAttendancePage = lazy(() => import("@/features/offline/OfflineOrganizerPages").then((module) => ({ default: module.OfflineOrganizerLiveAttendancePage })));
const EventRecordsPage = lazy(() => import("@/features/organizer/pages/EventRecordsPage").then((module) => ({ default: module.EventRecordsPage })));
const AuthenticationMethodsPage = lazy(() => import("@/features/organizer/pages/AuthenticationMethodsPage").then((module) => ({ default: module.AuthenticationMethodsPage })));
const OrganizerAnalyticsPage = lazy(() => import("@/features/organizer/pages/OrganizerAnalyticsPage").then((module) => ({ default: module.OrganizerAnalyticsPage })));
const OrganizerCorrectionRequestsPage = lazy(() => import("@/features/organizer/pages/OrganizerCorrectionRequestsPage").then((module) => ({ default: module.OrganizerCorrectionRequestsPage })));
const OrganizerAuditLogsPage = lazy(() => import("@/features/organizer/pages/OrganizerAuditLogsPage").then((module) => ({ default: module.OrganizerAuditLogsPage })));
const OrganizerPersonalSettingsPage = lazy(() => import("@/features/organizer/pages/OrganizerPersonalSettingsPage").then((module) => ({ default: module.OrganizerPersonalSettingsPage })));
const OrganizerUserManagementPage = lazy(() => import("@/features/organizer/pages/OrganizerUserManagement").then((module) => ({ default: module.OrganizerUserManagementPage })));
const AdminSystemHealthPage = lazy(() => import("@/features/admin/pages/AdminSystemHealthPage").then((module) => ({ default: module.AdminSystemHealthPage })));
const DepartmentBrandingPage = lazy(() => import("@/features/department/pages/DepartmentWorkspacePages").then((module) => ({ default: module.DepartmentBrandingPage })));
const DepartmentAuthenticationMethodsPage = lazy(() => import("@/features/department/pages/DepartmentWorkspacePages").then((module) => ({ default: module.DepartmentAuthenticationMethodsPage })));
const DepartmentSystemHealthPage = lazy(() => import("@/features/department/pages/DepartmentWorkspacePages").then((module) => ({ default: module.DepartmentSystemHealthPage })));
const DepartmentSettingsPage = lazy(() => import("@/features/department/pages/DepartmentWorkspacePages").then((module) => ({ default: module.DepartmentSettingsPage })));
const StudentRootPage = lazy(() => import("@/features/student/pages/StudentRootPage").then((module) => ({ default: module.StudentRootPage })));
const StudentDashboardPage = lazy(() => import("@/features/student/pages/StudentDashboardPage").then((module) => ({ default: module.StudentDashboardPage })));
const StudentSchedulePage = lazy(() => import("@/features/student/pages/StudentSchedulePage").then((module) => ({ default: module.StudentSchedulePage })));
const StudentUpcomingEventsPage = lazy(() => import("@/features/student/pages/StudentUpcomingEventsPage").then((module) => ({ default: module.StudentUpcomingEventsPage })));
const StudentEventDetailsPage = lazy(() => import("@/features/student/pages/StudentEventDetailsPage").then((module) => ({ default: module.StudentEventDetailsPage })));
const MyAttendancePage = lazy(() => import("@/features/student/pages/MyAttendancePage").then((module) => ({ default: module.MyAttendancePage })));
const AttendanceMethodsPage = lazy(() => import("@/features/student/pages/AttendanceMethodsPage").then((module) => ({ default: module.AttendanceMethodsPage })));
const RequestHistoryPage = lazy(() => import("@/features/student/pages/RequestHistoryPage").then((module) => ({ default: module.RequestHistoryPage })));
const StudentCorrectionRequestsPage = lazy(() => import("@/features/student/pages/CorrectionRequestsPage").then((module) => ({ default: module.CorrectionRequestsPage })));
const StudentFaqPage = lazy(() => import("@/features/student/pages/StudentFaqPage").then((module) => ({ default: module.StudentFaqPage })));
const StudentProfilePage = lazy(() => import("@/features/student/pages/StudentProfilePage").then((module) => ({ default: module.StudentProfilePage })));
const StudentLegalReviewPage = lazy(() => import("@/features/student/pages/StudentLegalReviewPage").then((module) => ({ default: module.StudentLegalReviewPage })));

function AdminOrOrganizerSettingsPage() {
  const { session } = useDevelopmentSession();
  return session?.role === "admin" ? <AdminSettingsPage /> : <OrganizerPersonalSettingsPage />;
}

function AdminOrOrganizerProfilePage() {
  return <ProfilePage />;
}

function PublicEntryRoute() {
  const location = useLocation();
  if (hasPasswordSetupPayload(location)) {
    return <Navigate to={getPasswordSetupPath(location, APP_ROUTES.resetPassword)} replace state={{ invitation: getPasswordLinkType(location) === "invite" }} />;
  }
  return <Navigate to={APP_ROUTES.login} replace />;
}

function OrganizerEventsRoute() {
  const { isOfflineMode } = useDevelopmentSession();
  return isOfflineMode ? <OfflineOrganizerEventsPage /> : <EventManagementPage />;
}
function OrganizerEventDetailsRoute() {
  const { isOfflineMode } = useDevelopmentSession();
  return isOfflineMode ? <OfflineOrganizerEventDetailsPage /> : <EventDetailsPage />;
}
function OrganizerLiveAttendanceRoute() {
  const { isOfflineMode } = useDevelopmentSession();
  return isOfflineMode ? <OfflineOrganizerLiveAttendancePage /> : <EventManagementPage />;
}

function StudentLegalGate() {
  const { session } = useDevelopmentSession();
  const location = useLocation();
  const userId = session?.userId;
  const acceptance = useQuery({
    queryKey: ["legal-acceptance", userId],
    queryFn: async () => {
      if (!userId) throw new Error("No active student session.");
      return getLegalAcceptanceStatus(userId);
    },
    enabled: Boolean(userId),
    staleTime: 60_000
  });
  if (acceptance.isLoading) return <LoadingState label="Checking account agreements" />;
  if (acceptance.isError) return <AccessDeniedPage />;
  if (!allCurrentLegalDocumentsAccepted(acceptance.data)) {
    return <Navigate to={APP_ROUTES.studentLegalReview} replace state={{ from: location }} />;
  }
  return <Outlet />;
}

export function AppRouter() {
  return (
    <Suspense fallback={<LoadingState label="Loading workspace" />}>
    <Routes>
      <Route element={<PublicLayout />}>
        <Route index element={<PublicEntryRoute />} />
        <Route path={APP_ROUTES.login} element={<LoginPage />} />
        <Route path={APP_ROUTES.forgotPassword} element={<ForgotPasswordPage />} />
        <Route path={APP_ROUTES.resetPassword} element={<ResetPasswordPage />} />
        <Route path={APP_ROUTES.terms} element={<LegalPolicyPage document="terms" />} />
        <Route path={APP_ROUTES.privacy} element={<LegalPolicyPage document="privacy" />} />
        <Route path={APP_ROUTES.accessDenied} element={<AccessDeniedPage />} />
        <Route path="/home" element={<Navigate to="/" replace />} />
      </Route>
      <Route element={<ProtectedRoute />}>
        <Route element={<AuthenticatedLayout />}>
          <Route element={<RoleShellLayout />}>
            <Route path={APP_ROUTES.profile} element={<ProfilePage />} />
            <Route path={APP_ROUTES.notifications} element={<NotificationsPage />} />
            <Route element={<RoleRoute allowedRoles={["organizer"]} permission="events.read.owned" />}>
              <Route path={APP_ROUTES.organizer} element={<OrganizerRootPage />} />
              <Route path={APP_ROUTES.organizerDashboard} element={<OrganizerDashboardPage />} />
              <Route path={APP_ROUTES.organizerEvents} element={<OrganizerEventsRoute />} />
              <Route path="/organizer/events/:eventId" element={<OrganizerEventDetailsRoute />} />
              <Route path="/organizer/live-attendance/:sessionId" element={<OrganizerLiveAttendanceRoute />} />
            </Route>
            <Route element={<RoleRoute allowedRoles={["organizer"]} permission="events.create" />}>
              <Route path={APP_ROUTES.organizerCreateEvent} element={<CreateEventPage />} />
            </Route>
            <Route element={<RoleRoute allowedRoles={["organizer"]} permission="attendance.read.owned" />}>
              <Route path={APP_ROUTES.organizerRecords} element={<EventRecordsPage />} />
            </Route>
            <Route element={<RoleRoute allowedRoles={["organizer"]} permission="credentials.use.owned_event" />}>
              <Route path={APP_ROUTES.organizerCredentials} element={<AuthenticationMethodsPage />} />
            </Route>
            <Route element={<RoleRoute allowedRoles={["organizer"]} permission="corrections.review.owned" />}>
              <Route path={APP_ROUTES.organizerCorrections} element={<OrganizerCorrectionRequestsPage />} />
            </Route>
            <Route element={<RoleRoute allowedRoles={["organizer"]} permission="analytics.read.owned" />}>
              <Route path={APP_ROUTES.organizerAnalytics} element={<OrganizerAnalyticsPage />} />
            </Route>
            <Route element={<RoleRoute allowedRoles={["organizer"]} permission="audit.read.own" />}>
              <Route path={APP_ROUTES.organizerAuditLogs} element={<OrganizerAuditLogsPage />} />
            </Route>
            <Route element={<RoleRoute allowedRoles={["organizer"]} permission="profile.manage.own" />}>
              <Route path={APP_ROUTES.organizerProfile} element={<AdminOrOrganizerProfilePage />} />
            </Route>
            <Route element={<RoleRoute allowedRoles={["organizer"]} permission="settings.manage.own" />}>
              <Route path={APP_ROUTES.organizerSettings} element={<AdminOrOrganizerSettingsPage />} />
            </Route>
            <Route element={<RoleRoute allowedRoles={["admin"]} />}>
              <Route path={APP_ROUTES.admin} element={<Navigate to={APP_ROUTES.adminDashboard} replace />} />
              <Route element={<RoleRoute allowedRoles={["admin"]} permission="system.health.read" />}>
                <Route path={APP_ROUTES.adminDashboard} element={<OrganizerDashboardPage workspace="admin" />} />
              </Route>
              <Route element={<RoleRoute allowedRoles={["admin"]} permission="users.read.all" />}>
                <Route path={APP_ROUTES.adminUsers} element={<OrganizerUserManagementPage />} />
              </Route>
              <Route element={<RoleRoute allowedRoles={["admin"]} permission="events.read.all" />}>
                <Route path={APP_ROUTES.adminEvents} element={<EventManagementPage />} />
                <Route path={APP_ROUTES.adminEvents + "/:eventId"} element={<EventDetailsPage />} />
              </Route>
              <Route path={APP_ROUTES.adminCreateEvent} element={<AccessDeniedPage />} />
              <Route element={<RoleRoute allowedRoles={["admin"]} permission="attendance.read.all" />}>
                <Route path={APP_ROUTES.adminAttendance} element={<EventRecordsPage />} />
              </Route>
              <Route element={<RoleRoute allowedRoles={["admin"]} permission={["credentials.reset", "credentials.revoke"]} />}>
                <Route path={APP_ROUTES.adminCredentials} element={<AuthenticationMethodsPage />} />
              </Route>
              <Route element={<RoleRoute allowedRoles={["admin"]} permission="analytics.read.all" />}>
                <Route path={APP_ROUTES.adminAnalytics} element={<OrganizerAnalyticsPage />} />
              </Route>
              <Route element={<RoleRoute allowedRoles={["admin"]} permission="audit.read.all" />}>
                <Route path={APP_ROUTES.adminAuditLogs} element={<OrganizerAuditLogsPage />} />
              </Route>
              <Route element={<RoleRoute allowedRoles={["admin"]} permission="system.catalog.manage" />}>
                <Route path={APP_ROUTES.adminCatalogs} element={<AdminCatalogsPage />} />
              </Route>
              <Route element={<RoleRoute allowedRoles={["admin"]} permission="system.settings.manage" />}>
                <Route path={APP_ROUTES.adminSettings} element={<AdminSettingsPage />} />
              </Route>
              <Route element={<RoleRoute allowedRoles={["admin"]} permission="system.health.read" />}>
                <Route path={APP_ROUTES.adminSystemHealth} element={<AdminSystemHealthPage />} />
              </Route>
              <Route element={<RoleRoute allowedRoles={["admin"]} permission="profile.manage.own" />}>
                <Route path={APP_ROUTES.adminProfile} element={<AdminOrOrganizerProfilePage />} />
              </Route>
            <Route path={APP_ROUTES.organizerUsers} element={<AccessDeniedPage />} />
            </Route>
            <Route element={<RoleRoute allowedRoles={["department_admin"]} />}>
              <Route path={APP_ROUTES.department} element={<Navigate to={APP_ROUTES.departmentDashboard} replace />} />
              <Route element={<RoleRoute allowedRoles={["department_admin"]} permission="departments.read.owned" />}>
                <Route path={APP_ROUTES.departmentDashboard} element={<OrganizerDashboardPage workspace="department" />} />
              </Route>
              <Route element={<RoleRoute allowedRoles={["department_admin"]} permission="events.read.department" />}>
                <Route path={APP_ROUTES.departmentEvents} element={<EventManagementPage />} />
              </Route>
              <Route element={<RoleRoute allowedRoles={["department_admin"]} permission="credentials.read.department" />}>
                <Route path={APP_ROUTES.departmentCredentials} element={<DepartmentAuthenticationMethodsPage />} />
              </Route>
              <Route element={<RoleRoute allowedRoles={["department_admin"]} permission="attendance.read.department" />}>
                <Route path={APP_ROUTES.departmentRecords} element={<EventRecordsPage />} />
              </Route>
                <Route element={<RoleRoute allowedRoles={["department_admin"]} permission="users.read.department" />}>
                <Route path={APP_ROUTES.departmentStudents} element={<Navigate to={APP_ROUTES.departmentUsers} replace />} />
                </Route>
                <Route element={<RoleRoute allowedRoles={["department_admin"]} permission="attendance.read.department" />}>
                <Route path={APP_ROUTES.departmentAttendance} element={<Navigate to={APP_ROUTES.departmentRecords} replace />} />
              </Route>
              <Route element={<RoleRoute allowedRoles={["department_admin"]} permission="analytics.read.department" />}>
                <Route path={APP_ROUTES.departmentAnalytics} element={<OrganizerAnalyticsPage />} />
              </Route>
              <Route element={<RoleRoute allowedRoles={["department_admin"]} permission="audit.read.department" />}>
                <Route path={APP_ROUTES.departmentAuditLogs} element={<OrganizerAuditLogsPage />} />
              </Route>
              <Route element={<RoleRoute allowedRoles={["department_admin"]} permission="departments.branding.manage.owned" />}>
                <Route path={APP_ROUTES.departmentBranding} element={<DepartmentBrandingPage />} />
                <Route path={APP_ROUTES.departmentSettings} element={<DepartmentSettingsPage />} />
              </Route>
              <Route element={<RoleRoute allowedRoles={["department_admin"]} permission="system.health.read.department" />}>
                <Route path={APP_ROUTES.departmentSystemHealth} element={<DepartmentSystemHealthPage />} />
              </Route>
              <Route element={<RoleRoute allowedRoles={["department_admin"]} permission="profile.manage.own" />}>
                <Route path={APP_ROUTES.departmentProfile} element={<AdminOrOrganizerProfilePage />} />
              </Route>
              <Route element={<RoleRoute allowedRoles={["department_admin"]} permission="users.read.department" />}>
                <Route path={APP_ROUTES.departmentUsers} element={<OrganizerUserManagementPage />} />
              </Route>
            </Route>
            <Route element={<RoleRoute allowedRoles={["student"]} />}>
              <Route path={APP_ROUTES.studentLegalReview} element={<StudentLegalReviewPage />} />
              <Route element={<StudentLegalGate />}>
              <Route path={APP_ROUTES.student} element={<StudentRootPage />} />
              <Route path={APP_ROUTES.studentDashboard} element={<StudentDashboardPage />} />
              <Route path={APP_ROUTES.studentSchedule} element={<StudentSchedulePage />} />
              <Route path={APP_ROUTES.studentUpcomingEvents} element={<StudentUpcomingEventsPage />} />
              <Route path="/student/events/:eventId" element={<StudentEventDetailsPage />} />
              <Route path={APP_ROUTES.studentAttendance} element={<MyAttendancePage />} />
              <Route path={APP_ROUTES.studentMethods} element={<AttendanceMethodsPage />} />
              <Route path={APP_ROUTES.studentRequestHistory} element={<RequestHistoryPage />} />
              <Route path={APP_ROUTES.studentCorrections} element={<StudentCorrectionRequestsPage />} />
              <Route path={APP_ROUTES.studentFaqs} element={<StudentFaqPage />} />
              <Route path={APP_ROUTES.studentProfile} element={<StudentProfilePage />} />
              </Route>
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
