import { lazy, Suspense } from "react";
import { Navigate, Route, Routes } from "react-router-dom";
import { AppLayout } from "@/app/layouts/AppLayout";
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
import { APP_ROUTES } from "@/lib/constants/routes";

const ComponentPreviewPage = lazy(() =>
  import("@/pages/ComponentPreviewPage").then((module) => ({ default: module.ComponentPreviewPage }))
);

export function AppRouter() {
  return (
    <Routes>
      <Route element={<AppLayout />}>
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
        <Route element={<ProtectedRoute />}>
          <Route path={APP_ROUTES.profile} element={<ProfilePage />} />
          <Route path={APP_ROUTES.notifications} element={<NotificationsPage />} />
          <Route path={APP_ROUTES.dashboard} element={<PlaceholderPage title="Dashboard" />} />
          <Route element={<RoleRoute allowedRoles={["admin"]} />}>
            <Route path={APP_ROUTES.admin} element={<PlaceholderPage title="Admin" />} />
            <Route path={APP_ROUTES.adminDashboard} element={<PlaceholderPage title="Admin dashboard" />} />
          </Route>
          <Route element={<RoleRoute allowedRoles={["faculty"]} />}>
            <Route path={APP_ROUTES.faculty} element={<PlaceholderPage title="Faculty" />} />
            <Route path={APP_ROUTES.facultyDashboard} element={<PlaceholderPage title="Faculty dashboard" />} />
          </Route>
          <Route element={<RoleRoute allowedRoles={["organizer"]} />}>
            <Route path={APP_ROUTES.organizer} element={<PlaceholderPage title="Organizer" />} />
            <Route path={APP_ROUTES.organizerDashboard} element={<PlaceholderPage title="Organizer dashboard" />} />
          </Route>
          <Route element={<RoleRoute allowedRoles={["student"]} />}>
            <Route path={APP_ROUTES.student} element={<PlaceholderPage title="Student" />} />
            <Route path={APP_ROUTES.studentDashboard} element={<PlaceholderPage title="Student dashboard" />} />
          </Route>
        </Route>
        <Route path="/home" element={<Navigate to="/" replace />} />
        <Route path="*" element={<NotFoundPage />} />
      </Route>
    </Routes>
  );
}
