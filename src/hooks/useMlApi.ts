import { useQuery } from "@tanstack/react-query";
import { fetchModelInsights, fetchBatchPrediction } from "@/services/api/mlClient";

export function useModelInsights() {
  return useQuery({
    queryKey: ["modelInsights"],
    queryFn: fetchModelInsights,
    staleTime: 1000 * 60 * 60, // 1 hour (insights don't change until model retrains)
  });
}

export function useBatchPrediction(eventId: string, studentIds: string[]) {
  return useQuery({
    queryKey: ["batchPrediction", eventId, studentIds],
    queryFn: () => fetchBatchPrediction({ event_id: eventId, student_ids: studentIds }),
    enabled: Boolean(eventId && studentIds.length > 0),
    staleTime: 1000 * 60 * 5, // 5 minutes
  });
}
