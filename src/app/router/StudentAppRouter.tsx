import { lazy, Suspense } from "react";
import { Navigate, Outlet, Route, Routes, useLocation } from "react-router-dom";
import { AuthenticatedLayout, PublicLayout } from "@/app/layouts/AppLayout";
import { RoleShellLayout } from "@/app/layouts/RoleShellLayout";
import { LoadingState } from "@/components/feedback/LoadingState";
import { AccessDeniedPage } from "@/pages/AccessDeniedPage";
import { ForgotPasswordPage } from "@/pages/ForgotPasswordPage";
import { LoginPage } from "@/pages/LoginPage";
import { NotFoundPage } from "@/pages/NotFoundPage";
import { NotificationsPage } from "@/pages/NotificationsPage";
import { AcceptInvitationPage, ResetPasswordPage } from "@/pages/ResetPasswordPage";
import { LegalPolicyPage } from "@/pages/LegalPolicyPage";
import { ProtectedRoute } from "@/app/router/ProtectedRoute";
import { useDevelopmentSession } from "@/hooks/useDevelopmentSession";
import { useQuery } from "@tanstack/react-query";
import { allCurrentLegalDocumentsAccepted, getLegalAcceptanceStatus } from "@/lib/legal/acceptance";
import { getPasswordLinkType, hasPasswordSetupPayload } from "@/lib/auth/recovery";
import { APP_ROUTES } from "@/lib/constants/routes";
import { desktopLaunchUrl } from "@/lib/desktop/launch";

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

function PublicEntryRoute() {
  const location = useLocation();
  if (hasPasswordSetupPayload(location)) {
    return getPasswordLinkType(location) === "invite" ? <AcceptInvitationPage /> : <ResetPasswordPage />;
  }
  return <Navigate to={APP_ROUTES.login} replace />;
}

function StudentOnlyRoute() {
  const { session } = useDevelopmentSession();

  if (session?.role !== "student") {
    return (
      <main className="grid min-h-screen place-items-center bg-background px-6 py-12 text-center">
        <div className="max-w-md space-y-4">
          <h1 className="text-2xl font-semibold tracking-tight">Use PLPass Desktop</h1>
          <p className="text-sm leading-6 text-muted-foreground">
            This site is for student accounts. Organizer, department, and administrator accounts must use the PLPass Desktop app.
          </p>
          <a className="inline-flex rounded-md bg-primary px-4 py-2 text-sm font-medium text-primary-foreground" href={desktopLaunchUrl}>
            Open PLPass Desktop
          </a>
        </div>
      </main>
    );
  }

  return <Outlet />;
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

export function StudentAppRouter() {
  return (
    <Suspense fallback={<LoadingState label="Loading student workspace" />}>
      <Routes>
        <Route element={<PublicLayout />}>
          <Route index element={<PublicEntryRoute />} />
          <Route path={APP_ROUTES.login} element={<LoginPage />} />
          <Route path={APP_ROUTES.forgotPassword} element={<ForgotPasswordPage />} />
          <Route path={APP_ROUTES.acceptInvitation} element={<AcceptInvitationPage />} />
          <Route path={APP_ROUTES.resetPassword} element={<ResetPasswordPage />} />
          <Route path={APP_ROUTES.terms} element={<LegalPolicyPage document="terms" />} />
          <Route path={APP_ROUTES.privacy} element={<LegalPolicyPage document="privacy" />} />
          <Route path={APP_ROUTES.accessDenied} element={<AccessDeniedPage />} />
        </Route>
        <Route element={<ProtectedRoute />}>
          <Route element={<StudentOnlyRoute />}>
            <Route element={<AuthenticatedLayout />}>
              <Route element={<RoleShellLayout />}>
                <Route path={APP_ROUTES.notifications} element={<NotificationsPage />} />
                <Route path={APP_ROUTES.studentLegalReview} element={<StudentLegalReviewPage />} />
                <Route path={APP_ROUTES.studentTerms} element={<LegalPolicyPage document="terms" backTo={APP_ROUTES.studentProfile} backLabel="Back to profile" workspace />} />
                <Route path={APP_ROUTES.studentPrivacy} element={<LegalPolicyPage document="privacy" backTo={APP_ROUTES.studentProfile} backLabel="Back to profile" workspace />} />
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
