import { useMemo, type PropsWithChildren } from "react";
import {
  DevelopmentSessionContext,
  type DevelopmentSession,
  type DevelopmentSessionContextValue
} from "@/app/providers/developmentSessionContext";

const developmentSession: DevelopmentSession = {
  isAuthenticated: true,
  role: "admin",
  displayName: "Development User"
};

export function DevelopmentSessionProvider({ children }: PropsWithChildren) {
  const value = useMemo<DevelopmentSessionContextValue>(() => ({ session: developmentSession }), []);

  return <DevelopmentSessionContext.Provider value={value}>{children}</DevelopmentSessionContext.Provider>;
}
