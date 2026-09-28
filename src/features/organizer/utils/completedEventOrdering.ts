type SchedulableEvent = {
  completedAt?: string;
  endsAt?: string;
  startsAt?: string;
  date?: string;
};

function timestamp(value?: string): number {
  if (!value) return Number.NEGATIVE_INFINITY;
  const parsed = Date.parse(value);
  return Number.isFinite(parsed) ? parsed : Number.NEGATIVE_INFINITY;
}

/** Sort completed-event history by actual completion, then scheduled finish, newest first. */
export function sortCompletedEventsNewestFirst<T extends SchedulableEvent>(events: readonly T[]): T[] {
  return [...events].sort((a, b) => {
    const completionOrder = timestamp(b.completedAt) - timestamp(a.completedAt);
    if (Number.isFinite(completionOrder) && completionOrder !== 0) return completionOrder;
    const finishOrder = timestamp(b.endsAt ?? b.startsAt ?? b.date) - timestamp(a.endsAt ?? a.startsAt ?? a.date);
    if (Number.isFinite(finishOrder) && finishOrder !== 0) return finishOrder;
    return timestamp(b.startsAt ?? b.date) - timestamp(a.startsAt ?? a.date);
  });
}
