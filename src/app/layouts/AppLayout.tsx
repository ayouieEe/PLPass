import { Outlet } from "react-router-dom";

export function AppLayout() {
  return <PublicLayout />;
}

export function PublicLayout() {
  return (
    <div className="min-h-screen bg-background">
      <Outlet />
    </div>
  );
}

export function AuthenticatedLayout() {
  return <Outlet />;
}
