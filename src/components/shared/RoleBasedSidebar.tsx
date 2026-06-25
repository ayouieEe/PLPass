import { NavLink } from "react-router-dom";
import { Activity } from "lucide-react";
import { ROLE_NAVIGATION } from "@/lib/constants/navigation";
import { cn } from "@/lib/utils/cn";
import type { UserRole } from "@/types/roles";

type RoleBasedSidebarProps = {
  role: UserRole;
  userLabel?: string;
};

export function RoleBasedSidebar({ role, userLabel = "Development User" }: RoleBasedSidebarProps) {
  const items = ROLE_NAVIGATION[role];

  return (
    <aside className="plpass-sidebar flex min-h-screen w-64 flex-col">
      <div className="border-b border-white/15 p-5">
        <div className="flex items-center gap-2 text-lg font-semibold">
          <Activity className="h-5 w-5" aria-hidden="true" />
          <span>PLPass</span>
        </div>
        <p className="mt-2 text-xs capitalize text-white/75">{role} workspace</p>
      </div>
      <nav aria-label={`${role} navigation`} className="flex-1 space-y-1 p-3">
        {items.map((item) => {
          const Icon = item.icon;

          return (
            <NavLink
              key={item.path}
              to={item.path}
              className={({ isActive }) =>
                cn(
                  "flex items-center gap-3 rounded-md px-3 py-2 text-sm font-medium text-white/80 transition-colors hover:bg-white/10 hover:text-white",
                  isActive && "plpass-sidebar-active"
                )
              }
            >
              <Icon className="h-4 w-4 shrink-0" aria-hidden="true" />
              <span>{item.label}</span>
            </NavLink>
          );
        })}
      </nav>
      <div className="border-t border-white/15 p-4 text-sm">
        <p className="font-medium text-white">{userLabel}</p>
        <p className="text-xs capitalize text-white/70">{role}</p>
      </div>
    </aside>
  );
}
