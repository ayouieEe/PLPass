import { CalendarClock, RefreshCw, RotateCcw, Settings, X } from "lucide-react";
import { useState } from "react";
import { createPortal } from "react-dom";
import { useNavigate } from "react-router-dom";
import { EmptyState } from "@/components/feedback/EmptyState";
import { ErrorState } from "@/components/feedback/ErrorState";
import { LoadingState } from "@/components/feedback/LoadingState";
import { StatusBadge } from "@/components/feedback/StatusBadge";
import { PageHeader } from "@/components/shared/PageHeader";
import { PreferenceToggle } from "@/components/shared/PreferenceToggle";
import { Button } from "@/components/ui/button";
import { useDevelopmentSession } from "@/hooks/useDevelopmentSession";
import { useNotifications, useNotificationPreferences } from "@/hooks/useRepositoryQueries";
import { APP_ROUTES } from "@/lib/constants/routes";
import { categoriesForRole, notificationCategory, notificationCategoryLabels, isNotificationVisibleForRole, type NotificationCategory } from "@/lib/notifications/policy";
import { formatDateTime } from "@/lib/utils/date";
import type { Notification } from "@/types/domain";

type StatusFilter = "all" | "unread";
type CategoryFilter = "all" | NotificationCategory;
type NotificationAction = { label: string; to: string; variant?: "default" | "destructive" };

function hasRepositoryCode(error: Error | null, code: string) {
  return typeof error === "object" && error !== null && "code" in error && error.code === code;
}

function cleanNotificationText(value: string) {
  return value
    .replace(/\\r\\n/g, "\n")
    .replace(/\\n/g, "\n")
    .replace(/\\r/g, "\n")
    .replace(/[ \t]+\n/g, "\n")
    .trim();
}

function notificationPreview(value: string) {
  const singleLine = cleanNotificationText(value).replace(/\s+/g, " ");
  return singleLine.length > 150 ? `${singleLine.slice(0, 147).trimEnd()}…` : singleLine;
}

function trustedActionUrl(notification: Notification) {
  // Action URLs are written by trusted server-side notification producers. Only
  // accept an application-relative route so a notification cannot become an
  // external redirect.
  if (notification.actionUrl?.startsWith("/") && !notification.actionUrl.startsWith("//") && !notification.actionUrl.includes("\\")) {
    return notification.actionUrl;
  }
  return undefined;
}

function notificationHasUserAction(notification: Notification, role?: string) {
  if (!notification.requiresAction) return false;
  if (notification.code === "account.status_changed") return false;
  if (role === "student") {
    const code = `${notification.code ?? ""} ${notification.title}`.toLowerCase();
    return code.includes("feedback") || code.includes("late");
  }
  return role === "organizer" && (notification.code === "correction.review_requested" || notification.code === "event.lifecycle.unstarted");
}

function notificationActions(notification: Notification, role?: string): NotificationAction[] {
  const code = `${notification.code ?? ""} ${notification.title}`.toLowerCase();
  if (role === "student" && code.includes("feedback")) return [{ label: "Answer feedback", to: `${APP_ROUTES.studentAttendance}?pendingTasks=1` }];
  if (role === "student" && code.includes("late")) return [{ label: "Submit late reason", to: `${APP_ROUTES.studentAttendance}?pendingTasks=1` }];
  if (role === "student") return [];

  const actionUrl = trustedActionUrl(notification);
  if (role === "organizer" && notification.code === "event.lifecycle.unstarted" && actionUrl) {
    const separator = actionUrl.includes("?") ? "&" : "?";
    return [
      { label: "Reschedule", to: `${actionUrl}${separator}lifecycleAction=reschedule` },
      { label: "Cancel event", to: `${actionUrl}${separator}lifecycleAction=cancel`, variant: "destructive" }
    ];
  }
  if (role === "organizer" && notification.type === "correction") return [{ label: "Review correction", to: APP_ROUTES.organizerCorrections }];
  return [];
}

export function NotificationsPage() {
  const { session } = useDevelopmentSession();
  const navigate = useNavigate();
  const [statusFilter, setStatusFilter] = useState<StatusFilter>("all");
  const [categoryFilter, setCategoryFilter] = useState<CategoryFilter>("all");
  const [isPreferencesOpen, setIsPreferencesOpen] = useState(false);
  const [selectedNotification, setSelectedNotification] = useState<Notification | null>(null);
  const context = session ? { actorUserId: session.userId, actorRole: session.role } : undefined;
  const notifications = useNotifications(
    {
      pageSize: 50,
      notificationStatus: statusFilter === "unread" ? "unread" : undefined
    },
    context
  );
  const preferences = useNotificationPreferences(context);

  const availableCategories = session ? categoriesForRole(session.role) : [];
  const items = (notifications.data?.items ?? []).filter((notification) =>
    session && isNotificationVisibleForRole(notification, session.role) &&
    (categoryFilter === "all" || notificationCategory(notification) === categoryFilter)
  );
  const unreadCount = items.filter((notification) => notification.status === "unread").length;
  const isEmptyResult = notifications.isError && hasRepositoryCode(notifications.error, "EMPTY_RESULT");
  const hasActiveFilters = statusFilter !== "all" || categoryFilter !== "all";

  function resetFilters() {
    setStatusFilter("all");
    setCategoryFilter("all");
  }

  function openNotificationAction(notification: Notification, action: NotificationAction) {
    if (notification.status === "unread") notifications.markReadMutation.mutate(notification.id);
    setSelectedNotification(null);
    navigate(action.to);
  }

  return (
    <div className="space-y-6">
      <PageHeader
        eyebrow="Account"
        title="Notifications"
        description={session ? `Review important updates for your ${session.role} account.` : "Review important account updates."}
        actions={
          <>
            <Button type="button" variant="outline" onClick={() => notifications.refetch()}>
              <RefreshCw className="h-4 w-4" aria-hidden="true" />
              Refresh
            </Button>
            <Button
              type="button"
              variant="outline"
              size="icon"
              onClick={() => setIsPreferencesOpen(true)}
              aria-label="Open notification settings"
              title="Notification settings"
            >
              <Settings className="h-4 w-4" aria-hidden="true" />
            </Button>
            <Button type="button" onClick={() => notifications.markAllReadMutation.mutate()} disabled={unreadCount === 0}>
              Mark all as read
            </Button>
          </>
        }
      />

      <section className="flex flex-wrap items-center justify-between gap-3 rounded-2xl border bg-surface px-4 py-3 shadow-sm">
        <div className="flex flex-wrap items-center gap-2">
          <div className="inline-flex rounded-full border bg-background p-1">
            <button
              type="button"
              onClick={() => setStatusFilter("all")}
              className={`rounded-full px-4 py-1.5 text-sm font-semibold transition ${
                statusFilter === "all" ? "bg-primary text-primary-foreground shadow-sm" : "text-muted-foreground hover:text-foreground"
              }`}
            >
              All
            </button>
            <button
              type="button"
              onClick={() => setStatusFilter("unread")}
              className={`rounded-full px-4 py-1.5 text-sm font-semibold transition ${
                statusFilter === "unread" ? "bg-primary text-primary-foreground shadow-sm" : "text-muted-foreground hover:text-foreground"
              }`}
            >
              Unread
            </button>
          </div>
          <select
            value={categoryFilter}
            onChange={(event) => setCategoryFilter(event.target.value as CategoryFilter)}
            className="h-10 rounded-full border bg-background px-4 text-sm font-semibold text-foreground shadow-sm outline-none transition focus:border-primary focus:ring-2 focus:ring-primary/20"
            aria-label="Filter notification type"
          >
            <option value="all">All Notifications</option>
            {availableCategories.map((category) => (
              <option key={category} value={category}>
                {notificationCategoryLabels[category]}
              </option>
            ))}
          </select>
        </div>

        <div className="ml-auto flex items-center gap-2">
          <StatusBadge label={`${unreadCount} unread`} tone={unreadCount > 0 ? "info" : "muted"} />
          {hasActiveFilters ? (
            <Button type="button" variant="ghost" size="sm" onClick={resetFilters}>
              <RotateCcw className="h-4 w-4" aria-hidden="true" />
              Clear
            </Button>
          ) : null}
        </div>
      </section>

      {isPreferencesOpen
        ? createPortal(
            <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4 backdrop-blur-sm" onClick={() => setIsPreferencesOpen(false)}>
              <section role="dialog" aria-modal="true" aria-labelledby="notification-settings-title" className="w-full max-w-lg rounded-2xl border bg-surface p-6 shadow-2xl" onClick={(event) => event.stopPropagation()}>
                <div className="flex items-start justify-between gap-4">
                  <div>
                    <p className="text-xs font-semibold uppercase tracking-wider text-primary">Notifications</p>
                    <h2 id="notification-settings-title" className="mt-1 text-xl font-semibold">Notification settings</h2>
                    <p className="mt-1 text-sm text-muted-foreground">Choose which optional updates appear in your account.</p>
                  </div>
                  <button type="button" onClick={() => setIsPreferencesOpen(false)} className="grid h-9 w-9 shrink-0 place-items-center rounded-lg border text-muted-foreground transition hover:bg-muted focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary/30" aria-label="Close notification settings">
                    <X className="h-4 w-4" aria-hidden="true" />
                  </button>
                </div>
                <div className="mt-5 rounded-xl border border-primary/15 bg-primary/5 p-3 text-sm text-muted-foreground">Critical, security, account, approval, and required-action alerts always remain enabled.</div>
                {preferences.data && session?.role !== "admin" ? (
                  <div className="mt-4 grid gap-3 sm:grid-cols-2">
                    {([
                      ["eventUpdates", "Event updates"],
                      ["attendanceExceptions", "Attendance exceptions"],
                      ["reports", "Report updates"],
                      ["reminders", "Reminders"]
                    ] as const).map(([key, label]) => (
                      <label key={key} className="flex min-h-14 items-center justify-between gap-3 rounded-xl border bg-background px-4 py-3 text-sm">
                        <span>{label}</span>
                        <PreferenceToggle label={`Enable ${label}`} checked={preferences.data[key]} disabled={preferences.updateMutation.isPending} onChange={(checked) => preferences.updateMutation.mutate({ [key]: checked })} />
                      </label>
                    ))}
                  </div>
                ) : <p className="mt-4 rounded-xl border bg-background p-4 text-sm text-muted-foreground">There are no optional notification categories available for this account.</p>}
                <div className="mt-6 flex justify-end">
                  <Button type="button" variant="outline" onClick={() => setIsPreferencesOpen(false)}>Done</Button>
                </div>
              </section>
            </div>,
            document.body
          )
        : null}

      {selectedNotification
        ? createPortal(
            <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4 backdrop-blur-sm" onClick={() => setSelectedNotification(null)}>
              <section role="dialog" aria-modal="true" aria-labelledby="notification-detail-title" aria-describedby="notification-detail-body" className="w-full max-w-2xl overflow-hidden rounded-2xl border border-border bg-surface shadow-2xl" onClick={(event) => event.stopPropagation()}>
                <div className="flex items-start justify-between gap-4 border-b border-border bg-surface-muted/60 px-5 py-5 sm:px-6">
                  <div className="min-w-0">
                    <p className="text-xs font-semibold uppercase tracking-wider text-primary">Notification details</p>
                    <h2 id="notification-detail-title" className="mt-1 text-xl font-semibold text-foreground">{cleanNotificationText(selectedNotification.title)}</h2>
                    <div className="mt-3 flex flex-wrap items-center gap-2">
                      <StatusBadge label={selectedNotification.status} tone={selectedNotification.status === "unread" ? "info" : "muted"} />
                      <StatusBadge label={selectedNotification.type} tone="muted" />
                      {notificationHasUserAction(selectedNotification, session?.role) ? <StatusBadge label="Action required" tone="warning" /> : null}
                      {selectedNotification.severity === "critical" ? <StatusBadge label="Critical" tone="danger" /> : null}
                    </div>
                  </div>
                  <button type="button" onClick={() => setSelectedNotification(null)} className="grid h-9 w-9 shrink-0 place-items-center rounded-lg border text-muted-foreground transition hover:bg-muted focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary/30" aria-label="Close notification details">
                    <X className="h-4 w-4" aria-hidden="true" />
                  </button>
                </div>
                <div className="px-5 py-5 sm:px-6">
                  <div id="notification-detail-body" className="max-h-[48vh] overflow-y-auto rounded-xl border border-border bg-background px-4 py-4 text-sm leading-7 text-foreground whitespace-pre-line">
                    {cleanNotificationText(selectedNotification.body)}
                  </div>
                </div>
                <div className="flex flex-col gap-3 border-t border-border bg-surface-muted/50 px-5 py-4 sm:flex-row sm:items-center sm:justify-between sm:px-6">
                  <p className="inline-flex items-center gap-2 text-xs text-muted-foreground"><CalendarClock className="h-3.5 w-3.5" aria-hidden="true" />{formatDateTime(selectedNotification.createdAt, "Date unavailable")}</p>
                  <div className="flex flex-wrap items-center gap-2 sm:justify-end">
                    {notificationHasUserAction(selectedNotification, session?.role) ? notificationActions(selectedNotification, session?.role).map((action) => (
                      <Button key={action.label} type="button" variant={action.variant} onClick={() => openNotificationAction(selectedNotification, action)}>
                        {action.label}
                      </Button>
                    )) : null}
                    {selectedNotification.status === "unread" ? (
                      <Button type="button" variant="outline" onClick={() => { notifications.markReadMutation.mutate(selectedNotification.id); setSelectedNotification(null); }}>Mark as read</Button>
                    ) : null}
                  </div>
                </div>
              </section>
            </div>,
            document.body
          )
        : null}

      {notifications.isLoading ? <LoadingState label="Loading notifications" /> : null}
      {isEmptyResult || (!notifications.isLoading && items.length === 0) ? (
        <EmptyState title="No notifications" description="This account has no notifications for the selected filters." />
      ) : null}
      {notifications.isError && !isEmptyResult ? (
        <ErrorState title="Unable to load notifications" message="The notification repository returned an error." />
      ) : null}
      <section className="space-y-3">
        {items.map((notification) => {
          return (
          <article key={notification.id} className="rounded-xl border bg-surface p-4 shadow-sm transition hover:border-primary/40 hover:shadow-md">
            <div className="flex flex-col gap-3 md:flex-row md:items-start md:justify-between">
              <div
                role="button"
                tabIndex={0}
                aria-label={`Open notification: ${cleanNotificationText(notification.title)}`}
                className="min-w-0 cursor-pointer rounded-lg outline-none focus-visible:ring-2 focus-visible:ring-primary/40"
                onClick={() => setSelectedNotification(notification)}
                onKeyDown={(event) => {
                  if (event.key === "Enter" || event.key === " ") {
                    event.preventDefault();
                    setSelectedNotification(notification);
                  }
                }}
              >
                <div className="flex flex-wrap items-center gap-2">
                  <h2 className="font-semibold">{cleanNotificationText(notification.title)}</h2>
                  <StatusBadge label={notification.status} tone={notification.status === "unread" ? "info" : "muted"} />
                  <StatusBadge label={notification.type} tone="muted" />
                  {notificationHasUserAction(notification, session?.role) ? <StatusBadge label="Action required" tone="warning" /> : null}
                  {notification.severity === "critical" ? <StatusBadge label="Critical" tone="danger" /> : null}
                </div>
                <p className="mt-2 line-clamp-2 text-sm leading-6 text-muted-foreground">{notificationPreview(notification.body)}</p>
                <p className="mt-2 text-xs text-muted-foreground">{formatDateTime(notification.createdAt, "Date unavailable")}</p>
              </div>
              <div className="flex flex-wrap justify-end gap-2">
                <Button
                  type="button"
                  variant="outline"
                  size="sm"
                  disabled={notification.status === "read"}
                  onClick={() => notifications.markReadMutation.mutate(notification.id)}
                >
                  Mark read
                </Button>
              </div>
            </div>
          </article>
          );
        })}
      </section>
    </div>
  );
}
