type SchedulableEvent = {
  endsAt?: string;
  startsAt?: string;
  date?: string;
};

function timestamp(value?: string): number {
  if (!value) return Number.NEGATIVE_INFINITY;
  const parsed = Date.parse(value);
  return Number.isFinite(parsed) ? parsed : Number.NEGATIVE_INFINITY;
}

/** Sort completed-event history by scheduled finish, newest first. */
export function sortCompletedEventsNewestFirst<T extends SchedulableEvent>(events: readonly T[]): T[] {
  return [...events].sort((a, b) => {
    const finishOrder = timestamp(b.endsAt ?? b.startsAt ?? b.date) - timestamp(a.endsAt ?? a.startsAt ?? a.date);
    if (Number.isFinite(finishOrder) && finishOrder !== 0) return finishOrder;
    return timestamp(b.startsAt ?? b.date) - timestamp(a.startsAt ?? a.date);
  });
}
