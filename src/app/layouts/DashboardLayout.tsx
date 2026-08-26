import { useEffect, useMemo, useRef, useState, type ReactNode } from "react";
import { NavLink, useLocation, useNavigate } from "react-router-dom";
import { Bell, LogOut, Menu, Moon, PanelLeftClose, PanelLeftOpen, Sun, UserCircle, X } from "lucide-react";
import { useQueryClient } from "@tanstack/react-query";
import { useHeader } from "@/app/providers/HeaderContext";
import { PageContainer } from "@/components/layout/PageContainer";
import { RoleBasedSidebar } from "@/components/shared/RoleBasedSidebar";
import { Button } from "@/components/ui/button";
import { useDevelopmentSession } from "@/hooks/useDevelopmentSession";
import { useNotificationUnreadCount } from "@/hooks/useRepositoryQueries";
import { useTheme } from "@/hooks/useTheme";
import { getRouteHeaderMeta } from "@/lib/constants/routeMetadata";
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
  primaryAction,
  filters,
  topRightActions,
  secondaryContent,
  children
}: DashboardLayoutProps) {
  const { theme, setTheme } = useTheme();
  const { session, logout } = useDevelopmentSession();
  const { headerOverride } = useHeader();
  const queryClient = useQueryClient();
  const navigate = useNavigate();
  const location = useLocation();
  const closeDrawerRef = useRef<HTMLButtonElement>(null);
  const openDrawerRef = useRef<HTMLButtonElement>(null);
  const drawerPanelRef = useRef<HTMLDivElement>(null);
  const accountDetailsRef = useRef<HTMLDetailsElement>(null);
  const accountSummaryRef = useRef<HTMLElement>(null);
  const [collapsed, setCollapsed] = useState(readCollapsedState);
  const [drawerOpen, setDrawerOpen] = useState(false);
  const [accountMenuOpen, setAccountMenuOpen] = useState(false);
  const isDark = theme === "dark";
  const notificationContext = session ? { actorUserId: session.userId, actorRole: session.role } : undefined;
  const unreadCount = useNotificationUnreadCount(notificationContext);
  
  const routeMeta = useMemo(() => getRouteHeaderMeta(location.pathname, role), [location.pathname, role]);
  const currentTitle = title ?? headerOverride.title ?? routeMeta.title;
  const currentDescription = description ?? headerOverride.description ?? routeMeta.description ?? "PLPass authenticated workspace";
  const currentPrimaryAction = primaryAction ?? headerOverride.primaryAction;
  const routeAnnouncement = typeof location.state === "object" && location.state && "announcement" in location.state
    ? String((location.state as { announcement?: unknown }).announcement ?? "")
    : "";


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
        closeDrawer();
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

  useEffect(() => {
    if (!accountMenuOpen) return undefined;
    function closeAccountMenu(event: MouseEvent | globalThis.KeyboardEvent) {
      if (event instanceof globalThis.KeyboardEvent) {
        if (event.key !== "Escape") return;
        event.preventDefault();
        setAccountMenuOpen(false);
        accountSummaryRef.current?.focus();
        return;
      }
      if (!accountDetailsRef.current?.contains(event.target as Node)) setAccountMenuOpen(false);
    }
    document.addEventListener("mousedown", closeAccountMenu);
    document.addEventListener("keydown", closeAccountMenu);
    return () => {
      document.removeEventListener("mousedown", closeAccountMenu);
      document.removeEventListener("keydown", closeAccountMenu);
    };
  }, [accountMenuOpen]);

  function handleLogout() {
    logout();
    queryClient.clear();
    navigate(APP_ROUTES.login, { replace: true });
  }

  function closeDrawer({ restoreFocus = true } = {}) {
    setDrawerOpen(false);
    if (restoreFocus) window.requestAnimationFrame(() => openDrawerRef.current?.focus());
  }

  return (
    <div className={cn(
      "fixed inset-0 overflow-hidden bg-background",
      role === "student" && "student-bg-gradient font-sans text-[#4F5654] antialiased"
    )}>
      <a
        href="#main-content"
        className="fixed left-4 top-4 z-[10000] -translate-y-24 rounded-md bg-primary px-4 py-2 font-semibold text-primary-foreground shadow-lg transition-transform focus:translate-y-0 motion-reduce:transition-none"
      >
        Skip to main content
      </a>
      {routeAnnouncement ? <p className="sr-only" role="status" aria-live="polite">{routeAnnouncement}</p> : null}
      <RoleBasedSidebar
        role={role}
        userLabel={userLabel}
        collapsed={collapsed}
        className="fixed inset-y-0 left-0 z-30 hidden md:flex"
      />

      {drawerOpen ? (
        <div className="fixed inset-0 z-40 md:hidden" role="dialog" aria-modal="true" aria-label="Mobile navigation">
          <button
            type="button"
            aria-label="Close navigation overlay"
            className="absolute inset-0 bg-foreground/40 motion-reduce:transition-none"
            onClick={() => closeDrawer()}
          />
          <div
            ref={drawerPanelRef}
            className="absolute inset-y-0 left-0 max-w-[85vw] shadow-2xl transition-transform duration-200 motion-reduce:transition-none"
          >
            <RoleBasedSidebar
              role={role}
              userLabel={userLabel}
              onNavigate={() => closeDrawer({ restoreFocus: false })}
              className={cn(
                role === "student" && "student-glass-sidebar"
              )}
              headerAction={
                <Button
                  ref={closeDrawerRef}
                  type="button"
                  variant="ghost"
                  size="icon"
                  className="text-sidebar-foreground hover:bg-sidebar-active hover:text-sidebar-foreground"
                  aria-label="Close navigation menu"
                  onClick={() => closeDrawer()}
                >
                  <X className="h-4 w-4" aria-hidden="true" />
                </Button>
              }
            />
          </div>
        </div>
      ) : null}

      <div className={cn("flex h-full min-w-0 flex-1 flex-col overflow-hidden transition-[padding] duration-200 motion-reduce:transition-none", collapsed ? "md:pl-[60px]" : "md:pl-[280px]")}>
        <header className="z-30 shrink-0 border-b bg-surface/95 shadow-sm backdrop-blur">
          <PageContainer className="flex h-[72px] min-w-0 items-center justify-between gap-3 py-0">
            <div className="flex min-w-0 items-center gap-3">
              <Button ref={openDrawerRef} type="button" variant="outline" size="icon" className="h-9 w-9 rounded-full md:hidden" aria-label="Open navigation menu" onClick={() => setDrawerOpen(true)}>
                <Menu className="h-4 w-4" aria-hidden="true" />
              </Button>
              <Button
                type="button"
                variant="ghost"
                size="icon"
                className="hidden h-9 w-9 rounded-full text-muted-foreground hover:bg-surface-muted hover:text-foreground md:inline-flex"
                aria-label={collapsed ? "Expand sidebar" : "Collapse sidebar"}
                onClick={() => setCollapsed((current) => !current)}
              >
                {collapsed ? <PanelLeftOpen className="h-4 w-4" aria-hidden="true" /> : <PanelLeftClose className="h-4 w-4" aria-hidden="true" />}
              </Button>
              <span className="hidden h-8 w-px bg-border md:block" aria-hidden="true" />
              <div className="min-w-0">
                <div className="flex min-w-0 items-center gap-2">
                  <div>
                    <p className="truncate text-base font-semibold text-foreground sm:text-lg">{currentTitle}</p>
                    {role !== "student" ? <p className="sr-only">{currentDescription}</p> : null}
                  </div>
                  {currentPrimaryAction ? <div className="hidden md:block">{currentPrimaryAction}</div> : null}
                </div>
              </div>
            </div>
            <div className="flex min-w-0 shrink-0 items-center gap-2">
              {topRightActions}
              <Button
                type="button"
                variant="outline"
                size="sm"
                className={cn(
                  "h-9 rounded-full px-3",
                  role === "student" && "border-brand-green-primary/30 text-brand-green-primary hover:bg-brand-green-light/20 hover:text-brand-green-deep"
                )}
                asChild
              >
                <NavLink to={APP_ROUTES.notifications} aria-label={unreadCount.data ? `Notifications, ${unreadCount.data} unread` : "Notifications"}>
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
                className="h-9 w-9 rounded-full"
                aria-label="Toggle theme"
                onClick={() => setTheme(isDark ? "light" : "dark")}
              >
                {isDark ? <Sun className="h-4 w-4" aria-hidden="true" /> : <Moon className="h-4 w-4" aria-hidden="true" />}
              </Button>
              <details ref={accountDetailsRef} open={accountMenuOpen} onToggle={(event) => setAccountMenuOpen(event.currentTarget.open)} className="relative">
                <summary
                  ref={accountSummaryRef}
                  role="button"
                  className="flex h-9 max-w-[12rem] cursor-pointer list-none items-center gap-2 rounded-full border border-input bg-surface px-3 text-sm font-semibold shadow-sm transition hover:bg-surface-muted sm:max-w-[17rem]"
                  aria-label={`Open account menu for ${userLabel}`}
                  aria-haspopup="menu"
                  aria-expanded={accountMenuOpen}
                  onKeyDown={(event) => {
                    if (event.key !== "ArrowDown") return;
                    event.preventDefault();
                    setAccountMenuOpen(true);
                    window.requestAnimationFrame(() => accountDetailsRef.current?.querySelector<HTMLElement>('[role="menuitem"]')?.focus());
                  }}
                >
                  <UserCircle className="h-4 w-4 text-brand-green-primary" aria-hidden="true" />
                  <span className="hidden min-w-0 truncate sm:inline">{userLabel}</span>
                </summary>
                <div role="menu" aria-label="Account actions" className="absolute right-0 z-30 mt-2 w-64 rounded-lg border bg-popover p-2 text-popover-foreground shadow-lg">
                  <div className="border-b px-3 py-2">
                    <p className="font-medium">{userLabel}</p>
                    <p className="text-xs capitalize text-muted-foreground">{role}</p>
                  </div>
                    <NavLink
                      role="menuitem"
                      onClick={() => setAccountMenuOpen(false)}
                      className="flex items-center gap-2 rounded-md px-3 py-2 text-sm hover:bg-surface-muted"
                      to={
                        session?.role === "organizer"
                          ? APP_ROUTES.organizerProfile
                          : session?.role === "student"
                          ? APP_ROUTES.studentProfile
                          : APP_ROUTES.profile
                      }
                    >
                      <UserCircle className="h-4 w-4" aria-hidden="true" />
                      Profile
                    </NavLink>
                  <button
                    type="button"
                    role="menuitem"
                    className="flex w-full items-center gap-2 rounded-md px-3 py-2 text-left text-sm hover:bg-surface-muted"
                    onClick={() => {
                      setAccountMenuOpen(false);
                      handleLogout();
                    }}
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

        <main id="main-content" tabIndex={-1} className="plpass-modern-scrollbar w-full min-w-0 flex-1 overflow-y-auto overflow-x-hidden py-4 md:py-6 lg:py-8">
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
