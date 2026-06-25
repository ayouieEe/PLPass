import { lazy, Suspense } from "react";
import { Navigate, Route, Routes } from "react-router-dom";
import { AppLayout } from "@/app/layouts/AppLayout";
import { AccessDeniedPage } from "@/pages/AccessDeniedPage";
import { DevelopmentHomePage } from "@/pages/DevelopmentHomePage";
import { NotFoundPage } from "@/pages/NotFoundPage";
import { PlaceholderPage } from "@/pages/PlaceholderPage";
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
          <Route path={APP_ROUTES.dashboard} element={<PlaceholderPage title="Dashboard" />} />
          <Route element={<RoleRoute allowedRoles={["admin"]} />}>
            <Route path={APP_ROUTES.admin} element={<PlaceholderPage title="Admin" />} />
          </Route>
          <Route element={<RoleRoute allowedRoles={["faculty"]} />}>
            <Route path={APP_ROUTES.faculty} element={<PlaceholderPage title="Faculty" />} />
          </Route>
          <Route element={<RoleRoute allowedRoles={["organizer"]} />}>
            <Route path={APP_ROUTES.organizer} element={<PlaceholderPage title="Organizer" />} />
          </Route>
          <Route element={<RoleRoute allowedRoles={["student"]} />}>
            <Route path={APP_ROUTES.student} element={<PlaceholderPage title="Student" />} />
          </Route>
        </Route>
        <Route path="/home" element={<Navigate to="/" replace />} />
        <Route path="*" element={<NotFoundPage />} />
      </Route>
    </Routes>
  );
}
