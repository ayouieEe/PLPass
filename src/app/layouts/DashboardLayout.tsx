import type { ReactNode } from "react";
import { RoleBasedSidebar } from "@/components/shared/RoleBasedSidebar";
import type { UserRole } from "@/types/roles";

type DashboardLayoutProps = {
  role: UserRole;
  userLabel?: string;
  children: ReactNode;
};

export function DashboardLayout({ role, userLabel, children }: DashboardLayoutProps) {
  return (
    <div className="min-h-screen bg-background lg:flex">
      <div className="hidden lg:block">
        <RoleBasedSidebar role={role} userLabel={userLabel} />
      </div>
      <main className="min-w-0 flex-1 p-4 lg:p-8">{children}</main>
    </div>
  );
}
