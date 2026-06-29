import { useEffect, useRef, useState, type ReactNode } from "react";
import { NavLink, useLocation, useNavigate } from "react-router-dom";
import { Bell, LogOut, Menu, Moon, PanelLeftClose, PanelLeftOpen, Sun, UserCircle, X } from "lucide-react";
import { useQueryClient } from "@tanstack/react-query";
import { PageContainer } from "@/components/layout/PageContainer";
import { RoleBasedSidebar } from "@/components/shared/RoleBasedSidebar";
import { Button } from "@/components/ui/button";
import { useDevelopmentSession } from "@/hooks/useDevelopmentSession";
import { useNotificationUnreadCount } from "@/hooks/useRepositoryQueries";
import { useTheme } from "@/hooks/useTheme";
import { APP_ROUTES } from "@/lib/constants/routes";
import { cn } from "@/lib/utils/cn";
import type { UserRole } from "@/types/roles";

const sidebarStorageKey = "plpass-sidebar-collapsed";

type DashboardLayoutProps = {
  role: UserRole;
  userLabel?: string;
  title?: string;
  description?: string;
  breadcrumbs?: string[];
  primaryAction?: ReactNode;
  filters?: ReactNode;
  topRightActions?: ReactNode;
  secondaryContent?: ReactNode;
  children: ReactNode;
};

function readCollapsedState() {
  if (typeof window === "undefined") {
    return false;
  }
  return window.localStorage.getItem(sidebarStorageKey) === "true";
}

export function DashboardLayout({
  role,
  userLabel,
  title,
  description,
  breadcrumbs,
  primaryAction,
  filters,
  topRightActions,
  secondaryContent,
  children
}: DashboardLayoutProps) {
  const { theme, setTheme } = useTheme();
  const { session, logout } = useDevelopmentSession();
  const queryClient = useQueryClient();
  const navigate = useNavigate();
  const location = useLocation();
  const closeDrawerRef = useRef<HTMLButtonElement>(null);
  const drawerPanelRef = useRef<HTMLDivElement>(null);
  const [collapsed, setCollapsed] = useState(readCollapsedState);
  const [drawerOpen, setDrawerOpen] = useState(false);
  const isDark = theme === "dark";
  const notificationContext = session ? { actorUserId: session.userId, actorRole: session.role } : undefined;
  const unreadCount = useNotificationUnreadCount(notificationContext);
  const currentTitle = title ?? `${role[0].toUpperCase()}${role.slice(1)} portal`;
  const currentDescription = description ?? "PLPass authenticated workspace";
  const currentBreadcrumbs = breadcrumbs ?? ["PLPass", `${role} portal`];

  useEffect(() => {
    window.localStorage.setItem(sidebarStorageKey, String(collapsed));
  }, [collapsed]);

  useEffect(() => {
    setDrawerOpen(false);
  }, [location.pathname]);

  useEffect(() => {
    if (!drawerOpen) {
      return undefined;
    }
    closeDrawerRef.current?.focus();
    function handleKeyDown(event: KeyboardEvent) {
      if (event.key === "Escape") {
        setDrawerOpen(false);
        return;
      }

      if (event.key !== "Tab") {
        return;
      }

      const focusableElements = drawerPanelRef.current?.querySelectorAll<HTMLElement>(
        'a[href], button:not([disabled]), [tabindex]:not([tabindex="-1"])'
      );
      if (!focusableElements?.length) {
        return;
      }

      const firstElement = focusableElements[0];
      const lastElement = focusableElements[focusableElements.length - 1];

      if (event.shiftKey && document.activeElement === firstElement) {
        event.preventDefault();
        lastElement.focus();
      } else if (!event.shiftKey && document.activeElement === lastElement) {
        event.preventDefault();
        firstElement.focus();
      }
    }
    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [drawerOpen]);

  function handleLogout() {
    logout();
    queryClient.clear();
    navigate(APP_ROUTES.login, { replace: true });
  }

  return (
    <div className={cn(
      "min-h-screen overflow-x-hidden bg-background",
      role === "student" && "student-bg-gradient font-sans text-[#4F5654] antialiased"
    )}>
      <RoleBasedSidebar
        role={role}
        userLabel={userLabel}
        collapsed={collapsed}
        className="fixed inset-y-0 left-0 z-30 hidden lg:flex"
        headerAction={
          <Button
            type="button"
            variant="ghost"
            size="icon"
            className="h-9 w-9 rounded-xl text-white/75 hover:bg-white/10 hover:text-white focus-visible:ring-white/50"
            aria-label={collapsed ? "Expand sidebar" : "Collapse sidebar"}
            onClick={() => setCollapsed((current) => !current)}
          >
            {collapsed ? <PanelLeftOpen className="h-4 w-4" aria-hidden="true" /> : <PanelLeftClose className="h-4 w-4" aria-hidden="true" />}
          </Button>
        }
      />

      {drawerOpen ? (
        <div className="fixed inset-0 z-40 lg:hidden" role="dialog" aria-modal="true" aria-label="Mobile navigation">
          <button
            type="button"
            aria-label="Close navigation overlay"
            className="absolute inset-0 bg-foreground/40 motion-reduce:transition-none"
            onClick={() => setDrawerOpen(false)}
          />
          <div
            ref={drawerPanelRef}
            className="absolute inset-y-0 left-0 max-w-[85vw] shadow-2xl transition-transform duration-200 motion-reduce:transition-none"
          >
            <RoleBasedSidebar
              role={role}
              userLabel={userLabel}
              onNavigate={() => setDrawerOpen(false)}
              headerAction={
                <Button
                  ref={closeDrawerRef}
                  type="button"
                  variant="ghost"
                  size="icon"
                  className="text-white hover:bg-white/10 hover:text-white"
                  aria-label="Close navigation menu"
                  onClick={() => setDrawerOpen(false)}
                >
                  <X className="h-4 w-4" aria-hidden="true" />
                </Button>
              }
            />
          </div>
        </div>
      ) : null}

      <div className={cn("flex min-h-screen min-w-0 flex-1 flex-col transition-[padding] duration-200 motion-reduce:transition-none", collapsed ? "lg:pl-[76px]" : "lg:pl-[260px]")}>
        <header className="sticky top-0 z-20 border-b bg-surface/95 backdrop-blur">
          <PageContainer className="flex min-h-16 items-center justify-between gap-3">
            <div className="flex min-w-0 items-center gap-3">
              <Button type="button" variant="outline" size="icon" className="lg:hidden" aria-label="Open navigation menu" onClick={() => setDrawerOpen(true)}>
                <Menu className="h-4 w-4" aria-hidden="true" />
              </Button>
              <div className="min-w-0">
                {role !== "student" && (
                  <nav aria-label="Breadcrumb" className="hidden text-xs text-muted-foreground sm:block">
                    {currentBreadcrumbs.join(" / ")}
                  </nav>
                )}
                <div className="flex min-w-0 items-center gap-2">
                  <div>
                    <h1 className="truncate text-lg font-semibold text-foreground">{currentTitle}</h1>
                    {role !== "student" && (
                      <p className="hidden text-sm text-muted-foreground md:block">{currentDescription}</p>
                    )}
                  </div>
                  {primaryAction ? <div className="hidden md:block">{primaryAction}</div> : null}
                </div>
              </div>
            </div>
            <div className="flex items-center gap-2">
              {topRightActions}
              <Button
                type="button"
                variant="outline"
                size="sm"
                className={cn(
                  role === "student" && "border-brand-green-primary/30 text-brand-green-primary hover:bg-brand-green-light/20 hover:text-brand-green-deep"
                )}
                asChild
              >
                <NavLink to={APP_ROUTES.notifications}>
                  <Bell className="h-4 w-4" aria-hidden="true" />
                  <span className="hidden sm:inline">Notifications</span>
                  {unreadCount.data ? (
                    <span className={cn(
                      "rounded-full px-2 py-0.5 text-xs font-semibold",
                      role === "student" ? "bg-brand-green-primary text-white" : "bg-primary text-primary-foreground"
                    )}>
                      {unreadCount.data}
                    </span>
                  ) : null}
                </NavLink>
              </Button>
              <Button
                type="button"
                variant="outline"
                size="icon"
                aria-label="Toggle theme"
                onClick={() => setTheme(isDark ? "light" : "dark")}
              >
                {isDark ? <Sun className="h-4 w-4" aria-hidden="true" /> : <Moon className="h-4 w-4" aria-hidden="true" />}
              </Button>
              <details className="relative">
                <summary className="flex cursor-pointer list-none items-center gap-2 rounded-md border border-input bg-surface px-3 py-2 text-sm font-medium">
                  <UserCircle className="h-4 w-4 text-brand-green-primary" aria-hidden="true" />
                  <span className="hidden sm:inline">{userLabel}</span>
                </summary>
                <div className="absolute right-0 z-30 mt-2 w-64 rounded-lg border bg-popover p-2 text-popover-foreground shadow-lg">
                  <div className="border-b px-3 py-2">
                    <p className="font-medium">{userLabel}</p>
                    <p className="text-xs capitalize text-muted-foreground">{role}</p>
                  </div>
                  <NavLink className="flex items-center gap-2 rounded-md px-3 py-2 text-sm hover:bg-surface-muted" to={APP_ROUTES.profile}>
                    <UserCircle className="h-4 w-4" aria-hidden="true" />
                    Profile
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
            </div>
          </PageContainer>
          {filters ? <div className="border-t"><PageContainer className="py-3">{filters}</PageContainer></div> : null}
        </header>

        <main className="w-full min-w-0 flex-1 py-4 md:py-6 lg:py-8">
          <PageContainer className="grid gap-6">
            <div className={cn("grid gap-6", secondaryContent && "xl:grid-cols-[minmax(0,1fr)_320px]")}>
              <section className="min-w-0">{children}</section>
              {secondaryContent ? <aside className="min-w-0">{secondaryContent}</aside> : null}
            </div>
          </PageContainer>
        </main>
      </div>
    </div>
  );
}
