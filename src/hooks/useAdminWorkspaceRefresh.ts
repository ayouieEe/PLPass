import { useCallback, useState } from "react";
import { useQueryClient } from "@tanstack/react-query";

// These are the query families displayed in the administrator workspace.  The
// helper deliberately leaves auth, offline packages, and unrelated storage
// alone; React Query refetches only currently mounted consumers.
const ADMIN_WORKSPACE_QUERY_ROOTS = [
  "users",
  "students",
  "organizerProfiles",
  "adminProfiles",
  "events",
  "attendanceSessions",
  "attendanceRecords",
  "analytics",
  "auditLogs",
  "systemSettings",
  "systemHealth",
  "academicCatalog",
  "studentCredentialStatuses"
] as const;

export function useAdminWorkspaceRefresh() {
  const queryClient = useQueryClient();
  const [isRefreshing, setIsRefreshing] = useState(false);

  const refresh = useCallback(async () => {
    setIsRefreshing(true);
    try {
      await Promise.all(
        ADMIN_WORKSPACE_QUERY_ROOTS.map((queryKey) =>
          queryClient.invalidateQueries({ queryKey: [queryKey] })
        )
      );
    } finally {
      setIsRefreshing(false);
    }
  }, [queryClient]);

  return { refresh, isRefreshing };
}
