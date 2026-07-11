import { Toaster as SonnerToaster } from "sonner";

export function Toaster() {
  return (
    <SonnerToaster
      richColors
      closeButton
      position="top-right"
      toastOptions={{
        classNames: {
          toast: "rounded-2xl border border-border bg-surface text-foreground shadow-xl",
          title: "text-sm font-semibold",
          description: "text-sm text-muted-foreground",
          actionButton: "rounded-lg bg-primary px-3 py-1.5 text-sm font-semibold text-primary-foreground",
          cancelButton: "rounded-lg border border-border bg-surface px-3 py-1.5 text-sm font-semibold text-foreground",
          closeButton: "border-border bg-surface text-muted-foreground hover:text-foreground"
        }
      }}
    />
  );
}
