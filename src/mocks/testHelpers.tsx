import type { ReactNode } from "react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import type { RepositoryContext } from "@/services/mock/mockRepositoryUtils";

export const adminTestContext: RepositoryContext = {
  actorUserId: "user-admin-1",
  actorRole: "admin"
};

export const studentTestContext: RepositoryContext = {
  actorUserId: "user-student-1",
  actorRole: "student"
};

export function createTestQueryClient() {
  return new QueryClient({
    defaultOptions: {
      queries: {
        retry: false
      },
      mutations: {
        retry: false
      }
    }
  });
}

export function createQueryClientWrapper(queryClient = createTestQueryClient()) {
  return function QueryClientWrapper({ children }: { children: ReactNode }) {
    return <QueryClientProvider client={queryClient}>{children}</QueryClientProvider>;
  };
}
