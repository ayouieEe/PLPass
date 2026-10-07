import { AppProviders } from "@/app/providers/AppProviders";
import { AppErrorBoundary } from "@/app/providers/AppErrorBoundary";
import { AppRouter } from "@/app/router/AppRouter";

export function App() {
  return (
    <AppErrorBoundary>
      <AppProviders>
        <AppRouter />
      </AppProviders>
    </AppErrorBoundary>
  );
}
