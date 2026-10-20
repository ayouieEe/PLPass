import type { PropsWithChildren } from "react";
import { BrowserRouter } from "react-router-dom";
import { QueryClientProvider } from "@tanstack/react-query";
import { Toaster } from "@/components/ui/sonner";
import { DevelopmentSessionProvider } from "@/app/providers/DevelopmentSessionProvider";
import { ThemeProvider } from "@/app/providers/ThemeProvider";
import { queryClient } from "@/app/providers/queryClient";
import type { AppSurface } from "@/app/providers/developmentSessionContext";

export function AppProviders({ children, surface = "desktop" }: PropsWithChildren<{ surface?: AppSurface }>) {
  return (
    <QueryClientProvider client={queryClient}>
      <ThemeProvider>
        <DevelopmentSessionProvider surface={surface}>
          <BrowserRouter>{children}</BrowserRouter>
          <Toaster />
        </DevelopmentSessionProvider>
      </ThemeProvider>
    </QueryClientProvider>
  );
}
