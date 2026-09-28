import { Component, type ErrorInfo, type ReactNode } from "react";
import { ErrorState } from "@/components/feedback/ErrorState";

type AppErrorBoundaryProps = {
  children: ReactNode;
};

type AppErrorBoundaryState = {
  error?: Error;
};

const staleChunkRecoveryKey = "plpass:stale-chunk-recovery";

export function isStaleLazyChunkError(error: Error) {
  return /failed to fetch dynamically imported module|importing a module script failed|loading chunk .* failed/i.test(error.message);
}

export class AppErrorBoundary extends Component<AppErrorBoundaryProps, AppErrorBoundaryState> {
  state: AppErrorBoundaryState = {};

  static getDerivedStateFromError(error: Error): AppErrorBoundaryState {
    return { error };
  }

  componentDidCatch(error: Error, errorInfo: ErrorInfo) {
    console.error("PLPass render error", error, errorInfo);
    // Vite replaces content-hashed lazy chunks during a desktop rebuild. A
    // still-running renderer can therefore hold an old index that points to
    // a file which no longer exists. Reload once for this exact failed asset
    // so Electron picks up the current index; retain the normal error screen
    // if the new build is also invalid instead of creating a reload loop.
    if (isStaleLazyChunkError(error) && typeof window !== "undefined") {
      const failedAsset = error.message;
      try {
        if (window.sessionStorage.getItem(staleChunkRecoveryKey) !== failedAsset) {
          window.sessionStorage.setItem(staleChunkRecoveryKey, failedAsset);
          window.location.reload();
        }
      } catch {
        // Storage can be unavailable in a restricted renderer. The error
        // screen remains a safe fallback in that case.
      }
    }
  }

  render() {
    if (this.state.error) {
      return (
        <div className="min-h-screen bg-background p-6">
          <ErrorState
            title="PLPass could not render this page"
            message={this.state.error.message || "A runtime error occurred while opening this workspace."}
          />
        </div>
      );
    }

    return this.props.children;
  }
}
