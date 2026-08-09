import { RefreshCw, RotateCcw } from "lucide-react";
import { useState } from "react";
import { EmptyState } from "@/components/feedback/EmptyState";
import { ErrorState } from "@/components/feedback/ErrorState";
import { LoadingState } from "@/components/feedback/LoadingState";
import { StatusBadge } from "@/components/feedback/StatusBadge";
import { PageHeader } from "@/components/shared/PageHeader";
import { Button } from "@/components/ui/button";
import { useDevelopmentSession } from "@/hooks/useDevelopmentSession";
import { useNotifications } from "@/hooks/useRepositoryQueries";
import type { NotificationType } from "@/types/enums";

type StatusFilter = "all" | "unread";
type TypeFilter = "all" | NotificationType;

const notificationTypeOptions: Array<{ value: TypeFilter; label: string }> = [
  { value: "all", label: "All types" },
  { value: "attendance", label: "Attendance" },
  { value: "correction", label: "Requests" },
  { value: "report", label: "Reports" },
  { value: "system", label: "System" }
];

function hasRepositoryCode(error: Error | null, code: string) {
  return typeof error === "object" && error !== null && "code" in error && error.code === code;
}

export function NotificationsPage() {
  const { session } = useDevelopmentSession();
  const [statusFilter, setStatusFilter] = useState<StatusFilter>("all");
  const [typeFilter, setTypeFilter] = useState<TypeFilter>("all");
  const context = session ? { actorUserId: session.userId, actorRole: session.role } : undefined;
  const notifications = useNotifications(
    {
      pageSize: 50,
      notificationStatus: statusFilter === "unread" ? "unread" : undefined,
      notificationType: typeFilter === "all" ? undefined : typeFilter
    },
    context
  );

  const items = notifications.data?.items ?? [];
  const unreadCount = items.filter((notification) => notification.status === "unread").length;
  const isEmptyResult = notifications.isError && hasRepositoryCode(notifications.error, "EMPTY_RESULT");
  const hasActiveFilters = statusFilter !== "all" || typeFilter !== "all";

  function resetFilters() {
    setStatusFilter("all");
    setTypeFilter("all");
  }

  return (
    <div className="space-y-6">
      <PageHeader
        eyebrow="Account"
        title="Notifications"
        description="Review updates about your attendance, requests, reports, and account."
        actions={
          <>
            <Button type="button" variant="outline" onClick={() => notifications.refetch()}>
              <RefreshCw className="h-4 w-4" aria-hidden="true" />
              Refresh
            </Button>
            <Button type="button" onClick={() => notifications.markAllReadMutation.mutate()} disabled={unreadCount === 0}>
              Mark all as read
            </Button>
          </>
        }
      />

      <section className="flex flex-wrap items-center justify-between gap-3 rounded-2xl border bg-surface px-4 py-3 shadow-sm">
        <div className="flex flex-wrap items-center gap-2">
          <StatusBadge label={`${unreadCount} unread`} tone={unreadCount > 0 ? "info" : "muted"} />
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
            value={typeFilter}
            onChange={(event) => setTypeFilter(event.target.value as TypeFilter)}
            className="h-10 rounded-full border bg-background px-4 text-sm font-semibold text-foreground shadow-sm outline-none transition focus:border-primary focus:ring-2 focus:ring-primary/20"
            aria-label="Filter notification type"
          >
            {notificationTypeOptions.map((option) => (
              <option key={option.value} value={option.value}>
                {option.label}
              </option>
            ))}
          </select>
        </div>

        {hasActiveFilters ? (
          <Button type="button" variant="ghost" size="sm" onClick={resetFilters}>
            <RotateCcw className="h-4 w-4" aria-hidden="true" />
            Clear
          </Button>
        ) : null}
      </section>

      {notifications.isLoading ? <LoadingState label="Loading notifications" /> : null}
      {isEmptyResult || (!notifications.isLoading && items.length === 0) ? (
        <EmptyState title="No notifications" description="This account has no notifications for the selected filters." />
      ) : null}
      {notifications.isError && !isEmptyResult ? (
        <ErrorState title="Unable to load notifications" message="The notification repository returned an error." />
      ) : null}
      <section className="space-y-3">
        {items.map((notification) => (
          <article key={notification.id} className="rounded-lg border bg-surface p-4">
            <div className="flex flex-col gap-3 md:flex-row md:items-start md:justify-between">
              <div>
                <div className="flex flex-wrap items-center gap-2">
                  <h2 className="font-semibold">{notification.title}</h2>
                  <StatusBadge label={notification.status} tone={notification.status === "unread" ? "info" : "muted"} />
                  <StatusBadge label={notification.type} tone="muted" />
                </div>
                <p className="mt-2 text-sm leading-6 text-muted-foreground">{notification.body}</p>
                <p className="mt-2 text-xs text-muted-foreground">{notification.createdAt}</p>
              </div>
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
          </article>
        ))}
      </section>
    </div>
  );
}
