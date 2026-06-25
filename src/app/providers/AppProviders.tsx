import type { PropsWithChildren } from "react";
import { BrowserRouter } from "react-router-dom";
import { QueryClientProvider } from "@tanstack/react-query";
import { Toaster } from "@/components/ui/sonner";
import { DevelopmentSessionProvider } from "@/app/providers/DevelopmentSessionProvider";
import { ThemeProvider } from "@/app/providers/ThemeProvider";
import { queryClient } from "@/app/providers/queryClient";

export function AppProviders({ children }: PropsWithChildren) {
  return (
    <QueryClientProvider client={queryClient}>
      <ThemeProvider>
        <DevelopmentSessionProvider>
          <BrowserRouter>{children}</BrowserRouter>
          <Toaster />
        </DevelopmentSessionProvider>
      </ThemeProvider>
    </QueryClientProvider>
  );
}
