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

export const studentTwoTestContext: RepositoryContext = {
  actorUserId: "user-student-2",
  actorRole: "student"
};

export const facultyTestContext: RepositoryContext = {
  actorUserId: "user-faculty-1",
  actorRole: "faculty"
};

export const facultyTwoTestContext: RepositoryContext = {
  actorUserId: "user-faculty-2",
  actorRole: "faculty"
};

export const organizerTestContext: RepositoryContext = {
  actorUserId: "user-organizer-1",
  actorRole: "organizer"
};

export const organizerTwoTestContext: RepositoryContext = {
  actorUserId: "user-organizer-2",
  actorRole: "organizer"
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
