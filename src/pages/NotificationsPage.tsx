import { RefreshCw } from "lucide-react";
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

  return (
    <div className="space-y-6">
      <PageHeader
        eyebrow="Account"
        title="Notifications"
        description="User-scoped development notifications from the mock repository."
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
      <section className="flex flex-wrap items-center gap-2 rounded-lg border bg-surface p-3">
        <StatusBadge label={`${unreadCount} unread`} tone={unreadCount > 0 ? "info" : "muted"} />
        <Button type="button" variant={statusFilter === "all" ? "default" : "outline"} size="sm" onClick={() => setStatusFilter("all")}>
          All
        </Button>
        <Button type="button" variant={statusFilter === "unread" ? "default" : "outline"} size="sm" onClick={() => setStatusFilter("unread")}>
          Unread
        </Button>
        {(["attendance", "correction", "system", "report"] as const).map((type) => (
          <Button key={type} type="button" variant={typeFilter === type ? "default" : "outline"} size="sm" onClick={() => setTypeFilter(type)}>
            {type}
          </Button>
        ))}
        <Button type="button" variant={typeFilter === "all" ? "secondary" : "outline"} size="sm" onClick={() => setTypeFilter("all")}>
          All types
        </Button>
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
