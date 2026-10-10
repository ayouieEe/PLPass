import { AppProviders } from "@/app/providers/AppProviders";
import { AppErrorBoundary } from "@/app/providers/AppErrorBoundary";
import { StudentAppRouter } from "@/app/router/StudentAppRouter";

export function StudentApp() {
  return (
    <AppErrorBoundary>
      <AppProviders>
        <StudentAppRouter />
      </AppProviders>
    </AppErrorBoundary>
  );
}
