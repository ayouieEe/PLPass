import { NavLink, Outlet, useNavigate } from "react-router-dom";
import { Activity, Bell, LogOut, Moon, Sun, UserCircle } from "lucide-react";
import { useQueryClient } from "@tanstack/react-query";
import { Button } from "@/components/ui/button";
import { useDevelopmentSession } from "@/hooks/useDevelopmentSession";
import { useNotificationUnreadCount } from "@/hooks/useRepositoryQueries";
import { useTheme } from "@/hooks/useTheme";
import { APP_ROUTES } from "@/lib/constants/routes";
import { getAuthorizedHomePath } from "@/lib/utils/auth";
import { cn } from "@/lib/utils/cn";

const navItems = [
  { href: "/", label: "Home" },
  { href: APP_ROUTES.components, label: "Components" },
  { href: APP_ROUTES.dashboard, label: "Dashboard" }
];

export function AppLayout() {
  const { theme, setTheme } = useTheme();
  const { session, logout } = useDevelopmentSession();
  const queryClient = useQueryClient();
  const navigate = useNavigate();
  const isDark = theme === "dark";
  const notificationContext = session ? { actorUserId: session.userId, actorRole: session.role } : undefined;
  const unreadCount = useNotificationUnreadCount(notificationContext);

  function handleLogout() {
    logout();
    queryClient.clear();
    navigate(APP_ROUTES.login, { replace: true });
  }

  return (
    <div className="min-h-screen bg-background">
      <header className="plpass-top-nav">
        <div className="container flex min-h-16 items-center justify-between gap-4">
          <NavLink to="/" className="flex items-center gap-2 font-semibold">
            <Activity className="h-5 w-5 text-brand-green-primary" aria-hidden="true" />
            <span>PLPass</span>
          </NavLink>
          <nav aria-label="Main navigation" className="hidden items-center gap-1 md:flex">
            {navItems.map((item) => (
              <NavLink
                key={item.href}
                to={item.href}
                className={({ isActive }) =>
                  cn(
                    "rounded-md px-3 py-2 text-sm font-medium text-muted-foreground transition-colors hover:bg-primary-hover hover:text-primary-foreground",
                    isActive && "plpass-nav-active"
                  )
                }
              >
                {item.label}
              </NavLink>
            ))}
            {session ? (
              <NavLink
                to={getAuthorizedHomePath(session.role)}
                className={({ isActive }) =>
                  cn(
                    "rounded-md px-3 py-2 text-sm font-medium text-muted-foreground transition-colors hover:bg-primary-hover hover:text-primary-foreground",
                    isActive && "plpass-nav-active"
                  )
                }
              >
                My area
              </NavLink>
            ) : null}
          </nav>
          <div className="flex items-center gap-2">
            <Button
              type="button"
              variant="outline"
              size="icon"
              aria-label="Toggle theme"
              onClick={() => setTheme(isDark ? "light" : "dark")}
            >
              {isDark ? <Sun className="h-4 w-4" aria-hidden="true" /> : <Moon className="h-4 w-4" aria-hidden="true" />}
            </Button>
            {session ? (
              <details className="relative">
                <summary className="flex cursor-pointer list-none items-center gap-2 rounded-md border border-input bg-surface px-3 py-2 text-sm font-medium">
                  <UserCircle className="h-4 w-4 text-brand-green-primary" aria-hidden="true" />
                  <span className="hidden sm:inline">{session.displayName}</span>
                  {unreadCount.data ? (
                    <span className="rounded-full bg-primary px-2 py-0.5 text-xs text-primary-foreground">{unreadCount.data}</span>
                  ) : null}
                </summary>
                <div className="absolute right-0 z-20 mt-2 w-64 rounded-lg border bg-popover p-2 text-popover-foreground shadow-lg">
                  <div className="border-b px-3 py-2">
                    <p className="font-medium">{session.displayName}</p>
                    <p className="text-xs capitalize text-muted-foreground">{session.role}</p>
                  </div>
                  <NavLink className="flex items-center gap-2 rounded-md px-3 py-2 text-sm hover:bg-surface-muted" to={APP_ROUTES.profile}>
                    <UserCircle className="h-4 w-4" aria-hidden="true" />
                    Profile
                  </NavLink>
                  <NavLink className="flex items-center gap-2 rounded-md px-3 py-2 text-sm hover:bg-surface-muted" to={APP_ROUTES.notifications}>
                    <Bell className="h-4 w-4" aria-hidden="true" />
                    Notifications
                    {unreadCount.data ? <span className="ml-auto text-xs text-muted-foreground">{unreadCount.data}</span> : null}
                  </NavLink>
                  <button
                    type="button"
                    className="flex w-full items-center gap-2 rounded-md px-3 py-2 text-left text-sm hover:bg-surface-muted"
                    onClick={handleLogout}
                  >
                    <LogOut className="h-4 w-4" aria-hidden="true" />
                    Logout
                  </button>
                </div>
              </details>
            ) : (
              <Button type="button" asChild>
                <NavLink to={APP_ROUTES.login}>Login</NavLink>
              </Button>
            )}
          </div>
        </div>
      </header>
      <main className="container py-8">
        <Outlet />
      </main>
    </div>
  );
}
