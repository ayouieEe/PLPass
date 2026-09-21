import { QueryClient } from "@tanstack/react-query";

// Student data stays in memory only. Query keys include the signed-in actor
// context, and the session provider clears this client on logout or auth
// failure, so one account's cached records are not reused by another.
export const studentCachePolicy = {
  referenceStaleTime: 60_000,
  operationalStaleTime: 15_000,
  privateGcTime: 5 * 60_000
} as const;

export const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      retry: 1,
      staleTime: 30_000,
      gcTime: studentCachePolicy.privateGcTime,
      refetchOnWindowFocus: false
    }
  }
});
