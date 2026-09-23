import { useEffect, useMemo, useRef, useState } from "react";
import { useQueryClient } from "@tanstack/react-query";
import { fetchBatchPrediction } from "@/services/api/mlClient";
import { repositories } from "@/services/repositories";
import type { RepositoryContext } from "@/services/repositoryUtils";
import type { Event } from "@/types/domain";

type AutomaticForecastStatus = "idle" | "running" | "complete" | "unavailable";

/**
 * Generates an estimate only when the event has none. This makes the process
 * idempotent: a persisted forecast is never recalculated or overwritten by a
 * later page visit. Completed events are included so legacy records gain a
 * durable retrospective estimate from the same pre-event-history model.
 */
export function useAutomaticForecasts(events: Event[], context: RepositoryContext, enabled: boolean) {
  const queryClient = useQueryClient();
  // Only a persisted forecast is terminal. Failed attempts must remain
  // eligible so an online/focus retry can recover from a late-starting local
  // model service or a refreshed organizer token.
  const savedEventIds = useRef(new Set<string>());
  const inFlightEventIds = useRef(new Set<string>());
  const [status, setStatus] = useState<AutomaticForecastStatus>("idle");
  const [completedRun, setCompletedRun] = useState(0);
  const [retryEpoch, setRetryEpoch] = useState(0);

  const missingEvents = useMemo(() => events.filter((event) =>
    event.predictedTurnout == null && event.status !== "cancelled" && event.status !== "rejected"
  ), [events]);
  const missingEventIds = missingEvents.map((event) => event.id).join(",");

  useEffect(() => {
    const retry = () => setRetryEpoch((value) => value + 1);
    const retryWhenVisible = () => {
      if (document.visibilityState === "visible") retry();
    };
    window.addEventListener("online", retry);
    window.addEventListener("focus", retry);
    document.addEventListener("visibilitychange", retryWhenVisible);
    return () => {
      window.removeEventListener("online", retry);
      window.removeEventListener("focus", retry);
      document.removeEventListener("visibilitychange", retryWhenVisible);
    };
  }, []);

  useEffect(() => {
    if (!enabled || !missingEvents.length) {
      if (enabled) setStatus("complete");
      return;
    }

    const candidates = missingEvents.filter((event) =>
      !savedEventIds.current.has(event.id) && !inFlightEventIds.current.has(event.id)
    );
    if (!candidates.length) return;

    let disposed = false;
    for (const event of candidates) inFlightEventIds.current.add(event.id);
    setStatus("running");

    void (async () => {
      try {
        // The desktop process owns the local loopback ML service. Web builds
        // instead use their configured API endpoint.
        if (window.plpassDesktop) await window.plpassDesktop.ensureMlService();

        let savedCount = 0;
        let hasRetryableFailure = false;
        for (const event of candidates) {
          if (disposed) return;
          try {
            const participants = await repositories.eventManagement.listEventParticipants(
              event.id,
              { pageIndex: 0, pageSize: 1000 },
              context
            );
            const studentIds = [...new Set(participants.items.map((participant) => participant.studentId))];
            // An event without participants has no population to forecast.
            if (!studentIds.length) {
              savedEventIds.current.add(event.id);
              continue;
            }

            const result = await fetchBatchPrediction({ event_id: event.id, student_ids: studentIds });
            if (!result) {
              hasRetryableFailure = true;
              continue;
            }

            const percentage = Math.round(Math.min(100, Math.max(0, (result.aggregate_expected_turnout / studentIds.length) * 100)));
            await repositories.eventManagement.saveEventForecast(event.id, percentage, context);
            savedEventIds.current.add(event.id);
            savedCount += 1;
          } catch {
            hasRetryableFailure = true;
          } finally {
            inFlightEventIds.current.delete(event.id);
          }
        }

        if (disposed) return;
        if (savedCount) {
          await queryClient.invalidateQueries({ queryKey: ["events"] });
          setCompletedRun((value) => value + 1);
        }
        setStatus(hasRetryableFailure ? "unavailable" : "complete");
      } catch {
        // A missing local model runtime or an unavailable API must leave the
        // field null. The next app load safely retries without inventing data.
        if (!disposed) setStatus("unavailable");
      } finally {
        // ensureMlService can fail before the per-event loop begins.
        // Release every candidate so focus/online events can retry safely.
        for (const event of candidates) inFlightEventIds.current.delete(event.id);
      }
    })();

    return () => {
      disposed = true;
    };
  }, [context, enabled, missingEventIds, missingEvents, queryClient, retryEpoch]);

  return { status, completedRun };
}
