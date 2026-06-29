import type { ReactNode } from "react";
import { NavLink } from "react-router-dom";
import { Activity, MoreHorizontal, UserCircle } from "lucide-react";
import { ROLE_NAVIGATION } from "@/lib/constants/navigation";
import { APP_ROUTES } from "@/lib/constants/routes";
import { cn } from "@/lib/utils/cn";
import type { NavigationItem } from "@/types/navigation";
import type { UserRole } from "@/types/roles";

type RoleBasedSidebarProps = {
  role: UserRole;
  userLabel?: string;
  className?: string;
  collapsed?: boolean;
  headerAction?: ReactNode;
  onNavigate?: () => void;
};

function groupedItems(items: NavigationItem[]) {
  return items.reduce<Record<string, NavigationItem[]>>((groups, item) => {
    const group = item.group ?? "Workspace";
    return { ...groups, [group]: [...(groups[group] ?? []), item] };
  }, {});
}

function initialsFromName(name: string) {
  return name
    .split(" ")
    .filter(Boolean)
    .slice(0, 2)
    .map((part) => part[0])
    .join("")
    .toUpperCase();
}

export function RoleBasedSidebar({
  role,
  userLabel = "Development User",
  className,
  collapsed = false,
  headerAction,
  onNavigate
}: RoleBasedSidebarProps) {
  const groups = groupedItems(ROLE_NAVIGATION[role]);
  const userInitials = initialsFromName(userLabel) || "PL";

  return (
    <aside
      className={cn(
        "plpass-sidebar",
        "flex h-dvh min-h-0 flex-col transition-[width] duration-200 motion-reduce:transition-none",
        collapsed ? "w-[76px]" : "w-[260px]",
        className
      )}
      aria-label={`${role} workspace sidebar`}
    >
      <div className={cn("shrink-0 border-b border-border p-4", collapsed && "px-3")}>
        <div className={cn("flex items-center gap-3", collapsed && "justify-center")}>
          <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-2xl bg-primary text-primary-foreground shadow-sm ring-1 ring-primary/20">
            <Activity className="h-5 w-5" aria-hidden="true" />
          </div>
          {!collapsed ? (
            <div className="min-w-0 flex-1">
              <p className="truncate text-base font-semibold leading-5 text-sidebar-foreground">PLPass</p>
              <p className="mt-0.5 truncate text-xs capitalize text-muted-foreground">{role} workspace</p>
            </div>
          ) : null}
          {headerAction ? <div className="shrink-0">{headerAction}</div> : null}
        </div>
      </div>

      <nav aria-label={`${role} navigation`} className="min-h-0 flex-1 overscroll-contain overflow-y-auto px-3 py-4">
        {Object.entries(groups).map(([group, items]) => (
          <div key={group} className={cn("mb-5 last:mb-0", collapsed && "mb-3")}>
            {!collapsed ? <p className="mb-2 px-3 text-[11px] font-semibold uppercase tracking-wide text-muted-foreground">{group}</p> : null}
            <div className="space-y-1">
              {items.map((item) => {
                const Icon = item.icon;

                return (
                  <NavLink
                    key={item.path}
                    to={item.path}
                    title={collapsed ? item.label : undefined}
                    aria-label={item.label}
                    onClick={onNavigate}
                    className={({ isActive }) =>
                      cn(
                        "group relative flex min-h-10 items-center gap-3 rounded-xl border border-transparent px-3 py-2 text-sm font-medium text-sidebar-foreground/80 transition-colors duration-150 hover:border-primary/10 hover:bg-sidebar-active/60 hover:text-sidebar-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 focus-visible:ring-offset-sidebar motion-reduce:transition-none",
                        collapsed && "justify-center px-0",
                        isActive && "plpass-sidebar-active"
                      )
                    }
                  >
                    <Icon className="h-[18px] w-[18px] shrink-0" aria-hidden="true" />
                    {!collapsed ? <span className="truncate">{item.label}</span> : null}
                    {collapsed ? (
                      <span className="pointer-events-none absolute left-[calc(100%+10px)] top-1/2 z-50 hidden -translate-y-1/2 whitespace-nowrap rounded-lg border border-border bg-popover px-2.5 py-1.5 text-xs font-medium text-popover-foreground shadow-lg group-hover:block group-focus-visible:block">
                        {item.label}
                      </span>
                    ) : null}
                  </NavLink>
                );
              })}
            </div>
          </div>
        ))}
      </nav>

      <div className={cn("mt-auto shrink-0 border-t border-border p-3", collapsed && "px-2")}>
        <NavLink
          to={APP_ROUTES.profile}
          title={collapsed ? `${userLabel} profile` : undefined}
          aria-label={`${userLabel} profile`}
          onClick={onNavigate}
          className={({ isActive }) =>
            cn(
              "group flex items-center gap-3 rounded-2xl border border-border bg-surface p-2.5 text-left text-sm text-sidebar-foreground transition-colors hover:bg-sidebar-active/60 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 focus-visible:ring-offset-sidebar motion-reduce:transition-none",
              collapsed && "justify-center rounded-xl px-2",
              isActive && "plpass-sidebar-active"
            )
          }
        >
          <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-sidebar-active text-xs font-semibold text-sidebar-active-foreground ring-1 ring-primary/10">
            {collapsed ? <UserCircle className="h-4 w-4" aria-hidden="true" /> : userInitials}
          </span>
          {!collapsed ? (
            <>
              <span className="min-w-0 flex-1">
                <span className="block truncate font-medium text-sidebar-foreground">{userLabel}</span>
                <span className="block truncate text-xs capitalize text-muted-foreground">{role}</span>
              </span>
              <MoreHorizontal className="h-4 w-4 shrink-0 text-muted-foreground" aria-hidden="true" />
            </>
          ) : null}
          {collapsed ? (
            <span className="pointer-events-none absolute left-[calc(100%+10px)] z-50 hidden whitespace-nowrap rounded-lg border border-border bg-popover px-2.5 py-1.5 text-xs font-medium text-popover-foreground shadow-lg group-hover:block group-focus-visible:block">
              Profile
            </span>
          ) : null}
        </NavLink>
      </div>
    </aside>
  );
}
